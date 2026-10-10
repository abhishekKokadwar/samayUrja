"""
simulator.py — Deterministic synthetic neighbourhood population generator
               and three-strategy simulation engine.

This module generates a reproducible synthetic population of homes and
simulates three scheduling strategies on it:

  Strategy A (unmanaged): homes use their original appliance start times.
  Strategy B (independent): each home optimizes greedily without coordination.
  Strategy C (FlockShield): coordinated scheduling across all homes.

All population generation is seeded; the same scenario parameters produce
identical results on every run (required for testing and reproducibility).

SIMULATION ASSUMPTIONS (disclosed in UI):
  - Synthetic population; not based on real meter data.
  - Illustrative tariffs; not a real DISCOM tariff.
  - Fixed (non-varying) ambient temperature and base load profiles.
  - EV adoption means one EV charger per home flagged as having an EV.
  - AC and geyser adoption rates assign those appliances to that fraction of homes.
  - Base load (lighting, refrigerator, fans) is modelled as a fixed 0.3 kW profile
    that varies slightly by hour using a simple demand curve.
  - Rooftop solar reduces per-slot cost and carbon for solar-adopting homes.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Optional

from tariffs import SLOTS, SLOT_H, get_tariff
from optimizer import (
    ApplianceInput,
    optimize as household_optimize,
    _time_to_slot,
    _slot_to_time,
    _allowed_starts,
    _run_cost,
    _week_days,
)
from coordinator import (
    CoordApplianceSpec,
    CoordDecision,
    coordinate,
)
from transformer import (
    Transformer,
    check_all_transformers,
    aggregate_neighbourhood_demand,
    TransformerStatus,
)
from metrics import compute_metrics, StrategyMetrics


# ---------------------------------------------------------------------------
# Scenario configuration
# ---------------------------------------------------------------------------

@dataclass
class ScenarioConfig:
    n_homes: int = 100
    n_transformers: int = 5
    transformer_capacity_kw: float = 200.0   # per transformer
    ev_adoption_rate: float = 0.30
    ac_adoption_rate: float = 0.40
    geyser_adoption_rate: float = 0.70
    solar_adoption_rate: float = 0.10
    tariff_id: str = "tod-domestic-illustrative"
    sanctioned_load_kw: float = 5.0          # per home
    seed: int = 42


# ---------------------------------------------------------------------------
# Synthetic home population
# ---------------------------------------------------------------------------

@dataclass
class SyntheticHome:
    id: int
    transformer_idx: int
    sanctioned_load_kw: float
    has_ev: bool
    has_ac: bool
    has_geyser: bool
    has_solar: bool
    appliances: list[ApplianceInput]
    base_load_slots: list[float]   # fixed load per slot in kW


def _base_load_profile(seed_offset: int) -> list[float]:
    """
    Simple deterministic base load (lighting, fans, fridge, misc).
    Varies between 0.2 and 0.5 kW following a simple demand curve.
    """
    # Morning peak 07-09, evening peak 19-22, low overnight
    curve = []
    rng = random.Random(seed_offset)
    for s in range(SLOTS):
        h = s / 2.0
        if 7 <= h < 9:
            base = 0.45
        elif 19 <= h < 23:
            base = 0.50
        elif 0 <= h < 5:
            base = 0.20
        else:
            base = 0.30
        # Small home-to-home variation
        curve.append(base + rng.uniform(-0.05, 0.05))
    return curve


def _solar_generation_profile(kw_peak: float = 1.0) -> list[float]:
    """
    Deterministic solar generation curve (bell curve, 07:00-18:00).
    Returns kW generated per slot.
    """
    curve = []
    for s in range(SLOTS):
        h = s / 2.0
        if 7 <= h <= 18:
            # Bell curve centred at 12:30
            x = (h - 12.5) / 2.5
            curve.append(kw_peak * math.exp(-0.5 * x * x))
        else:
            curve.append(0.0)
    return curve


def _build_appliances(
    home_id: int,
    has_ev: bool,
    has_ac: bool,
    has_geyser: bool,
    rng: random.Random,
) -> list[ApplianceInput]:
    """Build a list of shiftable appliances for a synthetic home."""
    apps: list[ApplianceInput] = []

    # Washing machine: everyone has one
    wm_start_h = rng.choice([7, 8, 9, 18, 19, 20])
    apps.append(ApplianceInput(
        name="Washing machine",
        power_kw=0.8,
        duration_min=60,
        days_per_week=rng.randint(3, 7),
        current_start=f"{wm_start_h:02d}:00",
        earliest_start="06:00",
        latest_end="22:00",
    ))

    # Geyser
    if has_geyser:
        geyser_start_h = rng.choice([5, 6, 7, 8])
        apps.append(ApplianceInput(
            name="Geyser",
            power_kw=2.0,
            duration_min=60,
            days_per_week=7,
            current_start=f"{geyser_start_h:02d}:00",
            earliest_start="04:00",
            latest_end="09:00",
        ))

    # AC
    if has_ac:
        ac_start_h = rng.choice([13, 14, 15, 19, 20, 21])
        apps.append(ApplianceInput(
            name="Air conditioner",
            power_kw=1.5,
            duration_min=180,
            days_per_week=rng.randint(5, 7),
            current_start=f"{ac_start_h:02d}:00",
            earliest_start="12:00",
            latest_end="23:00",
        ))

    # EV charger — this is the key load that causes the rebound peak
    if has_ev:
        # Most EV owners plug in after returning home (evening peak)
        ev_start_h = rng.choice([18, 19, 20, 21])
        apps.append(ApplianceInput(
            name="EV charger",
            power_kw=3.3,
            duration_min=240,
            days_per_week=rng.randint(5, 7),
            current_start=f"{ev_start_h:02d}:00",
            earliest_start="09:00",
            latest_end="07:00",  # can charge overnight, wrap
        ))

    # Water pump
    pump_start_h = rng.choice([6, 7, 8])
    apps.append(ApplianceInput(
        name="Water pump",
        power_kw=0.5,
        duration_min=60,
        days_per_week=7,
        current_start=f"{pump_start_h:02d}:00",
        earliest_start="05:00",
        latest_end="10:00",
    ))

    return apps


def build_population(cfg: ScenarioConfig) -> list[SyntheticHome]:
    """Build a deterministic synthetic neighbourhood population."""
    rng = random.Random(cfg.seed)
    homes = []

    for i in range(cfg.n_homes):
        home_rng = random.Random(cfg.seed * 10000 + i)
        t_idx = i % cfg.n_transformers

        has_ev = home_rng.random() < cfg.ev_adoption_rate
        has_ac = home_rng.random() < cfg.ac_adoption_rate
        has_geyser = home_rng.random() < cfg.geyser_adoption_rate
        has_solar = home_rng.random() < cfg.solar_adoption_rate

        apps = _build_appliances(i, has_ev, has_ac, has_geyser, home_rng)
        base = _base_load_profile(cfg.seed + i)

        # Solar reduces effective cost but not actual kW drawn (grid import)
        homes.append(SyntheticHome(
            id=i,
            transformer_idx=t_idx,
            sanctioned_load_kw=cfg.sanctioned_load_kw,
            has_ev=has_ev,
            has_ac=has_ac,
            has_geyser=has_geyser,
            has_solar=has_solar,
            appliances=apps,
            base_load_slots=base,
        ))

    return homes


# ---------------------------------------------------------------------------
# Strategy A: Unmanaged baseline
# ---------------------------------------------------------------------------

def simulate_unmanaged(
    homes: list[SyntheticHome],
) -> list[list[float]]:
    """
    Strategy A: use original appliance start times.
    Returns demand_by_home[home_idx][slot] in kW.
    """
    demand_by_home = []
    for home in homes:
        demand = list(home.base_load_slots)
        for app in home.appliances:
            start_slot = _time_to_slot(app.current_start)
            n = max(1, app.duration_min // 30)
            for i in range(n):
                demand[(start_slot + i) % SLOTS] += app.power_kw
        demand_by_home.append(demand)
    return demand_by_home


# ---------------------------------------------------------------------------
# Strategy B: Independent household optimization
# ---------------------------------------------------------------------------

def simulate_independent(
    homes: list[SyntheticHome],
    price: list[float],
    carbon: list[float],
) -> tuple[list[list[float]], list]:
    """
    Strategy B: each home optimizes greedily without coordination.
    Returns (demand_by_home, optimization_results_by_home).
    This naturally causes a rebound peak when many homes select the same
    cheap tariff slot.
    """
    demand_by_home = []
    opt_results = []

    for home in homes:
        result = household_optimize(
            appliances=home.appliances,
            price=price,
            carbon=carbon,
            sanctioned_load_kw=home.sanctioned_load_kw,
        )
        demand = list(home.base_load_slots)
        for run in result.runs:
            for s in run.slots_used:
                demand[s] += run.power_kw
        demand_by_home.append(demand)
        opt_results.append(result)

    return demand_by_home, opt_results


# ---------------------------------------------------------------------------
# Strategy C: FlockShield coordination
# ---------------------------------------------------------------------------

def simulate_coordinated(
    homes: list[SyntheticHome],
    transformers: list[Transformer],
    price: list[float],
    carbon: list[float],
) -> tuple[list[list[float]], list[CoordDecision]]:
    """
    Strategy C: FlockShield coordination.
    Returns (demand_by_home, all_decisions).
    """
    homes_appliances: list[list[CoordApplianceSpec]] = []
    for home in homes:
        coord_apps = []
        for app in home.appliances:
            n = max(1, app.duration_min // 30)
            coord_apps.append(CoordApplianceSpec(
                name=app.name,
                power_kw=app.power_kw,
                duration_slots=n,
                current_start_slot=_time_to_slot(app.current_start),
                earliest_slot=_time_to_slot(app.earliest_start),
                latest_end_slot=_time_to_slot(app.latest_end),
                shiftable=app.shiftable,
            ))
        homes_appliances.append(coord_apps)

    homes_base_load = [home.base_load_slots for home in homes]
    homes_sanctioned = [home.sanctioned_load_kw for home in homes]
    homes_t_idx = [home.transformer_idx for home in homes]

    home_results, all_decisions = coordinate(
        homes_appliances=homes_appliances,
        homes_base_load=homes_base_load,
        homes_sanctioned_kw=homes_sanctioned,
        homes_transformer_idx=homes_t_idx,
        transformers=transformers,
        price=price,
        carbon=carbon,
    )

    demand_by_home = [hr.demand_slots for hr in home_results]
    return demand_by_home, all_decisions


# ---------------------------------------------------------------------------
# Full simulation entry point
# ---------------------------------------------------------------------------

@dataclass
class SimulationResult:
    scenario: dict
    tariff: dict

    # Strategy A
    unmanaged_demand: list[float]          # 48 slots, kW
    unmanaged_transformer_status: list[TransformerStatus]
    unmanaged_metrics: StrategyMetrics

    # Strategy B
    independent_demand: list[float]
    independent_transformer_status: list[TransformerStatus]
    independent_metrics: StrategyMetrics

    # Strategy C
    coordinated_demand: list[float]
    coordinated_transformer_status: list[TransformerStatus]
    coordinated_metrics: StrategyMetrics

    # Decisions from FlockShield (sample, up to 100)
    decisions: list[dict]

    # Per-transformer summary for UI map
    transformer_summary: list[dict]

    simulation_version: str = "1.0.0"


def run_simulation(cfg: ScenarioConfig) -> SimulationResult:
    """Run the full three-strategy simulation for the given scenario."""
    tariff = get_tariff(cfg.tariff_id)
    price = tariff["price_slots"]
    carbon = tariff["carbon_slots"]

    homes = build_population(cfg)

    transformers = [
        Transformer(
            id=f"T{i+1:02d}",
            capacity_kw=cfg.transformer_capacity_kw,
            home_ids=[h.id for h in homes if h.transformer_idx == i],
        )
        for i in range(cfg.n_transformers)
    ]

    # Strategy A
    demand_a = simulate_unmanaged(homes)
    agg_a = aggregate_neighbourhood_demand(demand_a)
    status_a = check_all_transformers(transformers, demand_a)
    metrics_a = compute_metrics(agg_a, status_a, demand_a, homes, price, carbon, "unmanaged")

    # Strategy B
    demand_b, _ = simulate_independent(homes, price, carbon)
    agg_b = aggregate_neighbourhood_demand(demand_b)
    status_b = check_all_transformers(transformers, demand_b)
    metrics_b = compute_metrics(agg_b, status_b, demand_b, homes, price, carbon, "independent")

    # Strategy C
    demand_c, decisions = simulate_coordinated(homes, transformers, price, carbon)
    agg_c = aggregate_neighbourhood_demand(demand_c)
    status_c = check_all_transformers(transformers, demand_c)
    
    infeasible_c = sum(1 for d in decisions if not d.passed_validation)
    metrics_c = compute_metrics(agg_c, status_c, demand_c, homes, price, carbon, "coordinated", infeasible_appliances=infeasible_c)

    # Sample decisions for UI (first 100, prefer transformer-constrained ones)
    sorted_decisions = sorted(
        decisions,
        key=lambda d: (0 if d.constraint == "transformer_capacity" else 1, d.home_id),
    )
    decision_dicts = [
        {
            "home_id": d.home_id,
            "appliance_name": d.appliance_name,
            "prev_time": _slot_to_time(d.prev_slot),
            "new_time": _slot_to_time(d.new_slot),
            "reason": d.reason,
            "constraint": d.constraint,
            "passed_validation": d.passed_validation,
        }
        for d in sorted_decisions[:100]
    ]

    # Per-transformer summary for the neighbourhood map
    def _t_summary(t: Transformer, status_list: list[TransformerStatus], label: str) -> dict:
        st = next((s for s in status_list if s.transformer_id == t.id), None)
        return {
            "id": t.id,
            "capacity_kw": t.capacity_kw,
            "n_homes": len(t.home_ids),
            "unmanaged": _status_to_dict(
                next((s for s in status_a if s.transformer_id == t.id), None)),
            "independent": _status_to_dict(
                next((s for s in status_b if s.transformer_id == t.id), None)),
            "coordinated": _status_to_dict(
                next((s for s in status_c if s.transformer_id == t.id), None)),
        }

    transformer_summary = [_t_summary(t, status_c, "coordinated") for t in transformers]

    return SimulationResult(
        scenario={
            "n_homes": cfg.n_homes,
            "n_transformers": cfg.n_transformers,
            "transformer_capacity_kw": cfg.transformer_capacity_kw,
            "ev_adoption_rate": cfg.ev_adoption_rate,
            "ac_adoption_rate": cfg.ac_adoption_rate,
            "geyser_adoption_rate": cfg.geyser_adoption_rate,
            "solar_adoption_rate": cfg.solar_adoption_rate,
            "tariff_id": cfg.tariff_id,
            "sanctioned_load_kw": cfg.sanctioned_load_kw,
            "seed": cfg.seed,
        },
        tariff={
            "id": tariff["id"],
            "name": tariff["name"],
            "price_slots": price,
            "carbon_slots": carbon,
        },
        unmanaged_demand=agg_a,
        unmanaged_transformer_status=status_a,
        unmanaged_metrics=metrics_a,
        independent_demand=agg_b,
        independent_transformer_status=status_b,
        independent_metrics=metrics_b,
        coordinated_demand=agg_c,
        coordinated_transformer_status=status_c,
        coordinated_metrics=metrics_c,
        decisions=decision_dicts,
        transformer_summary=transformer_summary,
    )


def _status_to_dict(st: Optional[TransformerStatus]) -> dict:
    if st is None:
        return {}
    return {
        "peak_load_kw": st.peak_load_kw,
        "avg_load_kw": st.avg_load_kw,
        "max_utilization_pct": st.max_utilization_pct,
        "overloaded_slots": st.overloaded_slots,
    }
