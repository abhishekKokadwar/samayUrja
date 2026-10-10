"""
optimizer.py — Greedy, per-household appliance scheduler (Strategy B baseline).

NOTE: greedy placement, largest load first.  Not globally optimal under a tight
sanctioned-load cap.  Swap for a MILP (PuLP) if households exceed ~20 appliances.

This module is intentionally pure: no I/O, no random state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from tariffs import SLOTS, SLOT_H


@dataclass
class ApplianceInput:
    name: str
    power_kw: float          # constant power draw
    duration_min: int        # must be a multiple of 30
    days_per_week: int       # 1-7
    current_start: str       # 'HH:MM'
    earliest_start: str      # 'HH:MM' — allowed window start
    latest_end: str          # 'HH:MM' — allowed window end (may wrap past midnight)
    shiftable: bool = True   # if False, keep at current_start always


@dataclass
class ApplianceResult:
    name: str
    current_start: str
    new_start: str
    days: list[int]          # 0=Mon … 6=Sun
    power_kw: float
    duration_slots: int
    slots_used: list[int]    # absolute slot indices for the new schedule
    energy_kwh_per_run: float
    cost_before_inr: float   # per run
    cost_after_inr: float
    co2_before_kg: float
    co2_after_kg: float
    note: Optional[str] = None


@dataclass
class OptimizeResult:
    runs: list[ApplianceResult]
    monthly: dict            # cost_before/after, co2_before/after


def _time_to_slot(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 2 + m // 30


def _slot_to_time(s: int) -> str:
    s = s % SLOTS
    h = s // 2
    m = (s % 2) * 30
    return f"{h:02d}:{m:02d}"


def _run_cost(start_slot: int, n_slots: int, price: list[float], carbon: list[float],
              power_kw: float) -> tuple[float, float]:
    """Return (cost_inr, co2_kg) for a run of n_slots starting at start_slot."""
    cost = 0.0
    co2 = 0.0
    for i in range(n_slots):
        s = (start_slot + i) % SLOTS
        energy = power_kw * SLOT_H  # kWh
        cost += price[s] * energy
        co2 += carbon[s] * energy
    return cost, co2


def _allowed_starts(earliest: int, latest_end: int, n_slots: int) -> list[int]:
    """
    Return all start slots such that the run [start, start+n_slots) fits
    entirely within the window [earliest, latest_end).
    latest_end may be < earliest (window wraps past midnight).
    """
    result = []
    if latest_end > earliest:
        # simple window
        for s in range(earliest, latest_end - n_slots + 1):
            result.append(s)
        # allow exact fit at latest_end - n_slots
    else:
        # overnight wrap: [earliest .. 47] then [0 .. latest_end]
        # enumerate all 48 possible starts and check containment
        for s in range(SLOTS):
            if _fits_in_window(s, n_slots, earliest, latest_end):
                result.append(s)
    return result


def _fits_in_window(start: int, n_slots: int, earliest: int, latest_end: int) -> bool:
    """True if all slots of the run are inside the allowed window."""
    for i in range(n_slots):
        s = (start + i) % SLOTS
        if latest_end > earliest:
            if not (earliest <= s < latest_end):
                return False
        else:  # wraps past midnight
            if not (s >= earliest or s < latest_end):
                return False
    return True


def _week_days(days_per_week: int) -> list[int]:
    """Return evenly spread day indices for 'days_per_week' runs per week."""
    return [int(i * 7 / days_per_week) for i in range(days_per_week)]


def optimize(
    appliances: list[ApplianceInput],
    price: list[float],
    carbon: list[float],
    sanctioned_load_kw: float,
    base_load: Optional[list[float]] = None,
) -> OptimizeResult:
    """
    Greedy optimizer: schedule each appliance to minimise cost.
    load[] tracks cumulative demand; never exceeds sanctioned_load_kw.
    Appliances are processed largest-energy-first.
    base_load is the home's fixed demand per slot. It counts toward the
    sanctioned load, the same way the neighbourhood coordinator counts it.
    """
    load = list(base_load) if base_load else [0.0] * SLOTS

    # Fixed loads first, then the appliance with the fewest possible start
    # times, then the largest energy. Placing the most constrained load first
    # stops a flexible one from taking the only slots a constrained one can use.
    def _order(a: ApplianceInput):
        n = max(1, a.duration_min // 30)
        starts = len(_allowed_starts(_time_to_slot(a.earliest_start), _time_to_slot(a.latest_end), n))
        return (a.shiftable, starts, -a.power_kw * a.duration_min)

    sorted_apps = sorted(appliances, key=_order)

    results: list[ApplianceResult] = []

    for app in sorted_apps:
        n_slots = max(1, app.duration_min // 30)
        current_slot = _time_to_slot(app.current_start)
        earliest_slot = _time_to_slot(app.earliest_start)
        latest_slot = _time_to_slot(app.latest_end)

        cost_before, co2_before = _run_cost(current_slot, n_slots, price, carbon, app.power_kw)
        energy_kwh = app.power_kw * n_slots * SLOT_H

        if not app.shiftable:
            # Keep at current_start; still add to load
            for i in range(n_slots):
                load[(current_slot + i) % SLOTS] += app.power_kw
            results.append(ApplianceResult(
                name=app.name,
                current_start=app.current_start,
                new_start=app.current_start,
                days=_week_days(app.days_per_week),
                power_kw=app.power_kw,
                duration_slots=n_slots,
                slots_used=[(current_slot + i) % SLOTS for i in range(n_slots)],
                energy_kwh_per_run=energy_kwh,
                cost_before_inr=cost_before,
                cost_after_inr=cost_before,
                co2_before_kg=co2_before,
                co2_after_kg=co2_before,
                note="Fixed — cannot be shifted.",
            ))
            continue

        candidates = _allowed_starts(earliest_slot, latest_slot, n_slots)

        # Filter by sanctioned load
        feasible = []
        for s in candidates:
            if all(load[(s + i) % SLOTS] + app.power_kw <= sanctioned_load_kw
                   for i in range(n_slots)):
                feasible.append(s)

        if not feasible:
            # Cannot move; keep at current_start (may violate load if no room)
            for i in range(n_slots):
                load[(current_slot + i) % SLOTS] += app.power_kw
            results.append(ApplianceResult(
                name=app.name,
                current_start=app.current_start,
                new_start=app.current_start,
                days=_week_days(app.days_per_week),
                power_kw=app.power_kw,
                duration_slots=n_slots,
                slots_used=[(current_slot + i) % SLOTS for i in range(n_slots)],
                energy_kwh_per_run=energy_kwh,
                cost_before_inr=cost_before,
                cost_after_inr=cost_before,
                co2_before_kg=co2_before,
                co2_after_kg=co2_before,
                note="Could not move: window too narrow or load limit reached.",
            ))
            continue

        # Score each feasible start: (cost, carbon, distance from current)
        def _score(s: int):
            cost, co2 = _run_cost(s, n_slots, price, carbon, app.power_kw)
            dist = abs(s - current_slot)
            dist = min(dist, SLOTS - dist)  # circular distance
            return (cost, co2, dist)

        best = min(feasible, key=_score)
        best_cost, best_co2 = _run_cost(best, n_slots, price, carbon, app.power_kw)

        # Only move if it actually helps
        if best_cost >= cost_before and best_co2 >= co2_before:
            # No improvement; keep at current_start if it's feasible
            if current_slot in feasible:
                best = current_slot
                best_cost, best_co2 = cost_before, co2_before
            # else keep best (forced by load constraint)

        note = None
        moved = best != current_slot
        improved = best_cost < cost_before - 0.001 or best_co2 < co2_before - 0.001

        if not moved and not improved:
            note = "Already in the cheapest available slot."
        elif moved and not improved:
            # Moved but didn't improve (e.g. forced by load constraint, or window is all-peak)
            if best_cost > cost_before + 0.001:
                note = (
                    f"All slots in the allowed window have the same or higher price "
                    f"({_slot_to_time(best)} costs more than {app.current_start}). "
                    f"No saving is available within this window."
                )
            else:
                note = "Rescheduled due to load constraints; no cost improvement available."
        elif not moved and improved:
            note = "Already in the cheapest available slot."

        for i in range(n_slots):
            load[(best + i) % SLOTS] += app.power_kw

        results.append(ApplianceResult(
            name=app.name,
            current_start=app.current_start,
            new_start=_slot_to_time(best),
            days=_week_days(app.days_per_week),
            power_kw=app.power_kw,
            duration_slots=n_slots,
            slots_used=[(best + i) % SLOTS for i in range(n_slots)],
            energy_kwh_per_run=energy_kwh,
            cost_before_inr=cost_before,
            cost_after_inr=best_cost,
            co2_before_kg=co2_before,
            co2_after_kg=best_co2,
            note=note,
        ))

    # Aggregate monthly figures
    MONTHS_FACTOR = 52 / 12  # weeks per month

    total_cost_before = 0.0
    total_cost_after = 0.0
    total_co2_before = 0.0
    total_co2_after = 0.0

    for r in results:
        days = len(r.days)
        weeks_factor = days * MONTHS_FACTOR
        total_cost_before += r.cost_before_inr * weeks_factor
        total_cost_after += r.cost_after_inr * weeks_factor
        total_co2_before += r.co2_before_kg * weeks_factor
        total_co2_after += r.co2_after_kg * weeks_factor

    return OptimizeResult(
        runs=results,
        monthly={
            "cost_before_inr": round(total_cost_before, 2),
            "cost_after_inr": round(total_cost_after, 2),
            "co2_before_kg": round(total_co2_before, 2),
            "co2_after_kg": round(total_co2_after, 2),
        },
    )
