"""
coordinator.py — FlockShield capacity-aware neighbourhood coordination engine.

FlockShield is the core innovation: it schedules flexible appliance loads
across households while respecting shared transformer capacity limits.

Strategy C: FlockShield Coordination
  - Process households in order; for each appliance choose the cheapest
    feasible slot that does not push the transformer over capacity.
  - Prefer cheaper, cleaner slots; spread load rather than concentrating it.

Algorithm (deterministic heuristic):
  1. Build the synthetic population (from simulator.py).
  2. For each transformer, maintain a running slot-level load tracker.
  3. Process households in a deterministic order (seeded by scenario).
  4. For each flexible appliance, evaluate candidate starts in cost order,
     filtering by (a) household sanctioned load, (b) transformer remaining capacity.
  5. Assign the best feasible slot; update both household and transformer load.
  6. If no feasible slot exists, report infeasibility.
  7. Validate the final schedule with transformer.py.

This is NOT globally optimal.  It is a greedy heuristic that produces
capacity-safe schedules while preferring cheap, clean periods.
Global optimality would require integer programming.

Units: power kW, energy kWh, slots 30-min, tariff INR/kWh, carbon kg CO2/kWh.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from tariffs import SLOTS, SLOT_H
from transformer import Transformer, check_all_transformers, aggregate_neighbourhood_demand


@dataclass
class CoordApplianceSpec:
    name: str
    power_kw: float
    duration_slots: int
    current_start_slot: int
    earliest_slot: int
    latest_end_slot: int    # exclusive; may be < earliest for overnight
    shiftable: bool = True


@dataclass
class CoordDecision:
    home_id: int
    appliance_name: str
    prev_slot: int
    new_slot: int
    reason: str
    constraint: str          # 'tariff' | 'transformer_capacity' | 'sanctioned_load' | 'fixed' | 'infeasible'
    passed_validation: bool


@dataclass
class CoordHomeResult:
    home_id: int
    transformer_id: str
    demand_slots: list[float]    # kW per slot after coordination
    decisions: list[CoordDecision]
    infeasible_appliances: int


def _fits_window(start: int, n: int, earliest: int, latest_end: int) -> bool:
    """True if all n slots starting at start are within the window."""
    for i in range(n):
        s = (start + i) % SLOTS
        if latest_end > earliest:
            if not (earliest <= s < latest_end):
                return False
        else:  # overnight
            if not (s >= earliest or s < latest_end):
                return False
    return True


def _slot_cost(start: int, n: int, price: list[float], carbon: list[float],
               power_kw: float) -> tuple[float, float]:
    cost = 0.0
    co2 = 0.0
    for i in range(n):
        s = (start + i) % SLOTS
        energy = power_kw * SLOT_H
        cost += price[s] * energy
        co2 += carbon[s] * energy
    return cost, co2


def _candidate_starts(earliest: int, latest_end: int, n: int) -> list[int]:
    result = []
    for s in range(SLOTS):
        if _fits_window(s, n, earliest, latest_end):
            result.append(s)
    return result


def _slot_to_time(s: int) -> str:
    s = s % SLOTS
    h = s // 2
    m = (s % 2) * 30
    return f"{h:02d}:{m:02d}"


def coordinate_balanced(
    homes_appliances: list[list[CoordApplianceSpec]],
    homes_base_load: list[list[float]],
    homes_sanctioned_kw: list[float],
    homes_transformer_idx: list[int],
    transformers: list[Transformer],
    price: list[float],
    carbon: list[float],
    enable_load_shedding: bool = False,
) -> tuple[list[CoordHomeResult], list[CoordDecision]]:
    n_homes = len(homes_appliances)
    home_load: list[list[float]] = [list(bl) for bl in homes_base_load]
    transformer_load: list[list[float]] = [[0.0] * SLOTS for _ in transformers]
    for home_idx, t_idx in enumerate(homes_transformer_idx):
        for s in range(SLOTS):
            transformer_load[t_idx][s] += homes_base_load[home_idx][s]

    all_decisions: list[CoordDecision] = []
    home_decisions: list[list[CoordDecision]] = [[] for _ in range(n_homes)]
    home_infeasible_counts: list[int] = [0 for _ in range(n_homes)]
    home_penalties: list[float] = [0.0 for _ in range(n_homes)]

    # Fixed loads first, then the appliance with the fewest possible start times,
    # then the largest energy. Same rule as the household optimizer.
    def _order(a: CoordApplianceSpec):
        starts = len(_candidate_starts(a.earliest_slot, a.latest_end_slot, a.duration_slots))
        return (a.shiftable, starts, -a.power_kw * a.duration_slots)

    for home_idx in range(n_homes):
        homes_appliances[home_idx] = sorted(homes_appliances[home_idx], key=_order)

    max_apps = max((len(apps) for apps in homes_appliances), default=0)

    for app_idx in range(max_apps):
        # Sort households by their accumulated cost penalty (highest penalty picks first!)
        # Tie-breaker is home_idx to remain deterministic
        order = sorted(range(n_homes), key=lambda idx: (home_penalties[idx], -idx), reverse=True)
        
        for home_idx in order:
            if app_idx >= len(homes_appliances[home_idx]): continue

            app = homes_appliances[home_idx][app_idx]
            t_idx = homes_transformer_idx[home_idx]
            transformer = transformers[t_idx]
            sanctioned = homes_sanctioned_kw[home_idx]
            n = app.duration_slots

            if not app.shiftable:
                for i in range(n):
                    s = (app.current_start_slot + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw
                home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=app.current_start_slot, reason="Fixed load: runs at its usual time and is never shifted.", constraint="fixed", passed_validation=True))
                continue

            candidates = _candidate_starts(app.earliest_slot, app.latest_end_slot, n)
            feasible = []
            
            # Find the optimal unconstrained cost to measure penalty
            optimal_cost = min((_slot_cost(s, n, price, carbon, app.power_kw)[0] for s in candidates), default=0.0)

            for s in candidates:
                home_ok = all(home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6 for i in range(n))
                xfmr_ok = all(transformer_load[t_idx][(s + i) % SLOTS] + app.power_kw <= transformer.capacity_kw + 1e-6 for i in range(n))
                if home_ok and xfmr_ok: feasible.append(s)

            if not feasible:
                if enable_load_shedding:
                    home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=-1, reason="Load Shed", constraint="infeasible", passed_validation=False))
                    home_infeasible_counts[home_idx] += 1
                    continue
                home_feasible = [s for s in candidates if all(home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6 for i in range(n))]
                if home_feasible:
                    best = min(home_feasible, key=lambda start_s: (max(transformer_load[t_idx][(start_s + i) % SLOTS] for i in range(n)), _slot_cost(start_s, n, price, carbon, app.power_kw)[0]))
                    home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason=f"No time in its window fits within transformer {transformer.id}; placed at {_slot_to_time(best)}, where the transformer is least loaded.", constraint="transformer_capacity", passed_validation=False))
                    home_infeasible_counts[home_idx] += 1
                    # They suffered a penalty
                    actual_cost = _slot_cost(best, n, price, carbon, app.power_kw)[0]
                    home_penalties[home_idx] += (actual_cost - optimal_cost)
                else:
                    best = app.current_start_slot
                    home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason="No time in its window fits within the home's sanctioned load; left at its usual time.", constraint="infeasible", passed_validation=False))
                    home_infeasible_counts[home_idx] += 1
                for i in range(n):
                    s = (best + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw
                continue

            # Balanced Score: (cost, peak_transformer_load_during_this_slot)
            # This perfectly flattens the curve across the cheap band!
            def _score(s):
                cost, co2 = _slot_cost(s, n, price, carbon, app.power_kw)
                peak_load = max(transformer_load[t_idx][(s + i) % SLOTS] for i in range(n))
                return (cost, peak_load, co2)
            
            best = min(feasible, key=_score)
            actual_cost = _slot_cost(best, n, price, carbon, app.power_kw)[0]
            home_penalties[home_idx] += (actual_cost - optimal_cost)
            
            # Explain the placement.
            if actual_cost > optimal_cost + 1e-9:
                # A cheaper time existed in the window but was not available.
                cheapest = min(candidates, key=lambda c: _slot_cost(c, n, price, carbon, app.power_kw)[0])
                extra = actual_cost - optimal_cost
                home_blocked = any(
                    home_load[home_idx][(cheapest + i) % SLOTS] + app.power_kw > sanctioned + 1e-6
                    for i in range(n)
                )
                if home_blocked:
                    reason = (f"Cheapest time ({_slot_to_time(cheapest)}) would exceed the home's sanctioned load; "
                              f"placed at {_slot_to_time(best)} (Rs {extra:.2f} more per run).")
                    constraint = "sanctioned_load"
                else:
                    reason = (f"Cheapest time ({_slot_to_time(cheapest)}) is full on transformer {transformer.id}; "
                              f"placed at {_slot_to_time(best)} (Rs {extra:.2f} more per run).")
                    constraint = "transformer_capacity"
            elif best == app.current_start_slot:
                reason = "Already at the cheapest time in its window; not moved."
                constraint = "tariff"
            else:
                same_price = sum(
                    1 for c in feasible
                    if abs(_slot_cost(c, n, price, carbon, app.power_kw)[0] - actual_cost) < 1e-9
                )
                if same_price > 1:
                    reason = (f"Moved to {_slot_to_time(best)}: one of {same_price} equally cheap start times, "
                              f"chosen because transformer {transformer.id} is least loaded then.")
                else:
                    reason = f"Moved to {_slot_to_time(best)}, the cheapest time in its window."
                constraint = "tariff"

            for i in range(n):
                s = (best + i) % SLOTS
                home_load[home_idx][s] += app.power_kw
                transformer_load[t_idx][s] += app.power_kw
            home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason=reason, constraint=constraint, passed_validation=True))

    home_results: list[CoordHomeResult] = []
    for home_idx in range(n_homes):
        t_idx = homes_transformer_idx[home_idx]
        home_results.append(CoordHomeResult(home_id=home_idx, transformer_id=transformers[t_idx].id, demand_slots=home_load[home_idx], decisions=home_decisions[home_idx], infeasible_appliances=home_infeasible_counts[home_idx]))
        all_decisions.extend(home_decisions[home_idx])

    return home_results, all_decisions

def coordinate(
    homes_appliances: list[list[CoordApplianceSpec]],
    homes_base_load: list[list[float]],
    homes_sanctioned_kw: list[float],
    homes_transformer_idx: list[int],
    transformers: list[Transformer],
    price: list[float],
    carbon: list[float],
    enable_load_shedding: bool = False,
) -> tuple[list[CoordHomeResult], list[CoordDecision]]:
    return coordinate_balanced(homes_appliances, homes_base_load, homes_sanctioned_kw, homes_transformer_idx, transformers, price, carbon, enable_load_shedding)

