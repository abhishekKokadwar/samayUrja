"""
transformer.py — Transformer capacity models and constraint checking.

Each transformer has a rated usable capacity in kW.
A transformer is associated with a set of homes (household IDs).

Slot-level capacity check:
  sum(demand_kw[home] for home in transformer.homes) <= transformer.capacity_kw

This must hold for every slot (0..47).
Checking each home independently is insufficient and incorrect.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from tariffs import SLOTS


@dataclass
class Transformer:
    id: str
    capacity_kw: float        # usable capacity; not the nameplate rating
    home_ids: list[int]       # indices into the home list


@dataclass
class TransformerViolation:
    transformer_id: str
    slot: int
    actual_kw: float
    capacity_kw: float
    overload_kw: float


@dataclass
class TransformerStatus:
    transformer_id: str
    capacity_kw: float
    n_homes: int
    peak_load_kw: float
    avg_load_kw: float
    max_utilization_pct: float   # 0–100+
    overloaded_slots: int
    violations: list[TransformerViolation]


def check_transformer(
    transformer: Transformer,
    demand_by_home: list[list[float]],  # shape [n_homes][48]
) -> TransformerStatus:
    """
    Validate a single transformer's slot-level load against its capacity.
    demand_by_home[home_idx][slot] = kW drawn by that home in that slot.
    Only homes whose index is in transformer.home_ids are aggregated.
    """
    agg = [0.0] * SLOTS
    for home_idx in transformer.home_ids:
        for s in range(SLOTS):
            agg[s] += demand_by_home[home_idx][s]

    violations: list[TransformerViolation] = []
    for s in range(SLOTS):
        if agg[s] > transformer.capacity_kw + 1e-6:
            violations.append(TransformerViolation(
                transformer_id=transformer.id,
                slot=s,
                actual_kw=round(agg[s], 3),
                capacity_kw=transformer.capacity_kw,
                overload_kw=round(agg[s] - transformer.capacity_kw, 3),
            ))

    peak = max(agg)
    avg = sum(agg) / SLOTS
    max_util = (peak / transformer.capacity_kw * 100) if transformer.capacity_kw > 0 else 0.0

    return TransformerStatus(
        transformer_id=transformer.id,
        capacity_kw=transformer.capacity_kw,
        n_homes=len(transformer.home_ids),
        peak_load_kw=round(peak, 3),
        avg_load_kw=round(avg, 3),
        max_utilization_pct=round(max_util, 1),
        overloaded_slots=len(violations),
        violations=violations,
    )


def check_all_transformers(
    transformers: list[Transformer],
    demand_by_home: list[list[float]],
) -> list[TransformerStatus]:
    return [check_transformer(t, demand_by_home) for t in transformers]


def aggregate_neighbourhood_demand(demand_by_home: list[list[float]]) -> list[float]:
    """Sum demand across all homes for each slot."""
    total = [0.0] * SLOTS
    for home in demand_by_home:
        for s in range(SLOTS):
            total[s] += home[s]
    return total
