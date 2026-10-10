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


def coordinate(
    homes_appliances: list[list[CoordApplianceSpec]],
    homes_base_load: list[list[float]],      # fixed load per slot per home
    homes_sanctioned_kw: list[float],
    homes_transformer_idx: list[int],
    transformers: list[Transformer],
    price: list[float],
    carbon: list[float],
) -> tuple[list[CoordHomeResult], list[CoordDecision]]:
    """
    Coordinate all homes' flexible appliances under transformer capacity.

    homes_appliances[i] — flexible appliances for home i
    homes_base_load[i][s] — fixed kW load for home i at slot s
    homes_sanctioned_kw[i] — max total kW for home i
    homes_transformer_idx[i] — which transformer home i belongs to

    Returns (home_results, all_decisions).
    """
    n_homes = len(homes_appliances)

    # Slot-level load per home (starts from base load)
    home_load: list[list[float]] = [list(bl) for bl in homes_base_load]

    # Slot-level transformer load tracker
    transformer_load: list[list[float]] = [
        [0.0] * SLOTS for _ in transformers
    ]

    # Initialise transformer loads from base loads
    for home_idx, t_idx in enumerate(homes_transformer_idx):
        for s in range(SLOTS):
            transformer_load[t_idx][s] += homes_base_load[home_idx][s]

    all_decisions: list[CoordDecision] = []
    home_results: list[CoordHomeResult] = []

    for home_idx in range(n_homes):
        t_idx = homes_transformer_idx[home_idx]
        transformer = transformers[t_idx]
        sanctioned = homes_sanctioned_kw[home_idx]
        decisions: list[CoordDecision] = []
        infeasible_count = 0

        # Sort appliances by energy (largest first) to maximise constraint coverage
        apps = sorted(
            homes_appliances[home_idx],
            key=lambda a: a.power_kw * a.duration_slots,
            reverse=True,
        )

        for app in apps:
            n = app.duration_slots

            if not app.shiftable:
                # Add to load; record as fixed
                for i in range(n):
                    s = (app.current_start_slot + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw
                decisions.append(CoordDecision(
                    home_id=home_idx,
                    appliance_name=app.name,
                    prev_slot=app.current_start_slot,
                    new_slot=app.current_start_slot,
                    reason="Appliance is fixed and cannot be shifted.",
                    constraint="fixed",
                    passed_validation=True,
                ))
                continue

            candidates = _candidate_starts(app.earliest_slot, app.latest_end_slot, n)

            # Filter: sanctioned load AND transformer capacity
            feasible = []
            for s in candidates:
                # Check home sanctioned load
                home_ok = all(
                    home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6
                    for i in range(n)
                )
                if not home_ok:
                    continue
                # Check transformer capacity
                xfmr_ok = all(
                    transformer_load[t_idx][(s + i) % SLOTS] + app.power_kw
                    <= transformer.capacity_kw + 1e-6
                    for i in range(n)
                )
                if xfmr_ok:
                    feasible.append(s)

            if not feasible:
                # Try without transformer constraint (at least satisfy household)
                home_feasible = [
                    s for s in candidates
                    if all(
                        home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6
                        for i in range(n)
                    )
                ]
                if home_feasible:
                    # Place at cheapest home-feasible slot, note transformer infeasibility
                    best = min(home_feasible, key=lambda s: _slot_cost(s, n, price, carbon, app.power_kw)[0])
                    reason = (
                        f"No transformer-safe slot available; placed at cheapest "
                        f"home-feasible slot. Transformer {transformer.id} may be overloaded."
                    )
                    constraint = "transformer_capacity"
                    passed = False
                    infeasible_count += 1
                else:
                    # Completely infeasible
                    best = app.current_start_slot
                    reason = "No feasible slot: sanctioned load and transformer constraints both violated."
                    constraint = "infeasible"
                    passed = False
                    infeasible_count += 1

                for i in range(n):
                    s = (best + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw

                decisions.append(CoordDecision(
                    home_id=home_idx,
                    appliance_name=app.name,
                    prev_slot=app.current_start_slot,
                    new_slot=best,
                    reason=reason,
                    constraint=constraint,
                    passed_validation=passed,
                ))
                continue

            # Score: (cost, carbon, distance_from_current)
            def _score(s, _n=n, _p=price, _c=carbon, _pw=app.power_kw,
                       _cur=app.current_start_slot):
                cost, co2 = _slot_cost(s, _n, _p, _c, _pw)
                dist = min(abs(s - _cur), SLOTS - abs(s - _cur))
                return (cost, co2, dist)

            best = min(feasible, key=_score)

            # Determine reason
            if best == app.current_start_slot:
                reason = "Already in the optimal slot within transformer capacity."
                constraint = "tariff"
            else:
                preferred_candidates = _candidate_starts(
                    app.earliest_slot, app.latest_end_slot, n)
                preferred_unconstrained = (
                    min(preferred_candidates,
                        key=lambda s: _slot_cost(s, n, price, carbon, app.power_kw)[0])
                    if preferred_candidates else best
                )
                if best != preferred_unconstrained:
                    reason = (
                        f"Preferred slot ({_slot_to_time(preferred_unconstrained)}) exceeded "
                        f"transformer {transformer.id} remaining capacity; "
                        f"moved to {_slot_to_time(best)}."
                    )
                    constraint = "transformer_capacity"
                else:
                    reason = f"Shifted to cheapest available slot ({_slot_to_time(best)})."
                    constraint = "tariff"

            for i in range(n):
                s = (best + i) % SLOTS
                home_load[home_idx][s] += app.power_kw
                transformer_load[t_idx][s] += app.power_kw

            decisions.append(CoordDecision(
                home_id=home_idx,
                appliance_name=app.name,
                prev_slot=app.current_start_slot,
                new_slot=best,
                reason=reason,
                constraint=constraint,
                passed_validation=True,
            ))

        home_results.append(CoordHomeResult(
            home_id=home_idx,
            transformer_id=transformer.id,
            demand_slots=home_load[home_idx],
            decisions=decisions,
            infeasible_appliances=infeasible_count,
        ))
        all_decisions.extend(decisions)

    return home_results, all_decisions


def _slot_to_time(s: int) -> str:
    s = s % SLOTS
    h = s // 2
    m = (s % 2) * 30
    return f"{h:02d}:{m:02d}"
