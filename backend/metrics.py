"""
metrics.py — Compute strategy metrics from simulation output.

All calculations are derived from the actual schedule data.
No metrics are hard-coded or fabricated.

UNITS:
  power  — kW
  energy — kWh
  cost   — INR
  carbon — kg CO2
  time   — 30-min slots (SLOT_H = 0.5 h)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from tariffs import SLOTS, SLOT_H

if TYPE_CHECKING:
    from transformer import TransformerStatus
    from simulator import SyntheticHome


@dataclass
class StrategyMetrics:
    strategy: str

    # Neighbourhood demand
    peak_demand_kw: float
    avg_demand_kw: float
    peak_to_avg_ratio: float
    min_demand_kw: float

    # Transformer
    max_transformer_utilization_pct: float
    overloaded_transformer_slots: int
    overloaded_transformers: int

    # Energy
    total_energy_kwh: float       # sum of all homes, all slots

    # Cost (aggregate across all homes, per day)
    total_cost_inr_per_day: float
    total_co2_kg_per_day: float

    # VS unmanaged baseline (populated after comparing two StrategyMetrics)
    savings_vs_unmanaged_inr: float = 0.0
    co2_avoided_vs_unmanaged_kg: float = 0.0
    peak_reduction_kw: float = 0.0

    # Household-level stats
    n_homes: int = 0
    n_appliances_shifted: int = 0


def compute_metrics(
    agg_demand: list[float],          # 48-slot neighbourhood demand in kW
    transformer_statuses: list,       # list[TransformerStatus]
    demand_by_home: list[list[float]],
    homes: list,                      # list[SyntheticHome]
    price: list[float],
    carbon: list[float],
    strategy: str,
) -> StrategyMetrics:
    """Compute all metrics for one strategy from its actual schedule output."""

    peak = max(agg_demand) if agg_demand else 0.0
    avg = sum(agg_demand) / SLOTS if agg_demand else 0.0
    mn = min(agg_demand) if agg_demand else 0.0
    par = peak / avg if avg > 0 else 0.0

    max_util = max((s.max_utilization_pct for s in transformer_statuses), default=0.0)
    overloaded_slots = sum(s.overloaded_slots for s in transformer_statuses)
    overloaded_transformers = sum(1 for s in transformer_statuses if s.overloaded_slots > 0)

    # Total energy: sum of all homes, all slots
    total_energy = sum(
        home_demand[s] * SLOT_H
        for home_demand in demand_by_home
        for s in range(SLOTS)
    )

    # Total cost and CO2 at neighbourhood level (per day)
    total_cost = sum(
        agg_demand[s] * SLOT_H * price[s]
        for s in range(SLOTS)
    )
    total_co2 = sum(
        agg_demand[s] * SLOT_H * carbon[s]
        for s in range(SLOTS)
    )

    return StrategyMetrics(
        strategy=strategy,
        peak_demand_kw=round(peak, 2),
        avg_demand_kw=round(avg, 2),
        peak_to_avg_ratio=round(par, 3),
        min_demand_kw=round(mn, 2),
        max_transformer_utilization_pct=round(max_util, 1),
        overloaded_transformer_slots=overloaded_slots,
        overloaded_transformers=overloaded_transformers,
        total_energy_kwh=round(total_energy, 2),
        total_cost_inr_per_day=round(total_cost, 2),
        total_co2_kg_per_day=round(total_co2, 2),
        n_homes=len(homes),
    )


def attach_comparisons(
    baseline: StrategyMetrics,
    other: StrategyMetrics,
) -> StrategyMetrics:
    """Fill in savings/reduction fields vs a baseline strategy."""
    other.savings_vs_unmanaged_inr = round(
        baseline.total_cost_inr_per_day - other.total_cost_inr_per_day, 2
    )
    other.co2_avoided_vs_unmanaged_kg = round(
        baseline.total_co2_kg_per_day - other.total_co2_kg_per_day, 2
    )
    other.peak_reduction_kw = round(
        baseline.peak_demand_kw - other.peak_demand_kw, 2
    )
    return other
