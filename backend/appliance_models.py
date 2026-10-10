"""
appliance_models.py — Simple deterministic thermal and EV models.

All models are deliberately simple and documented.
They are not machine-learning models — they are physics-based approximations.

ASSUMPTIONS (disclosed):
  Geyser: first-order thermal model, constant heat-loss coefficient.
  AC: single-zone thermal model, constant outdoor temperature per slot.
  EV: constant charging power, no state-of-charge curve.

These assumptions are displayed in the UI wherever comfort results appear.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from tariffs import SLOTS, SLOT_H


# ---------------------------------------------------------------------------
# EV Charger
# ---------------------------------------------------------------------------

@dataclass
class EVChargerSpec:
    power_kw: float          # charging power
    required_energy_kwh: float   # energy needed for a full charge
    earliest_start_slot: int
    deadline_slot: int       # charging must finish by this slot

    @property
    def required_slots(self) -> int:
        """Minimum number of slots needed to deliver required_energy_kwh."""
        return max(1, round(self.required_energy_kwh / (self.power_kw * SLOT_H)))


def ev_feasible(spec: EVChargerSpec) -> bool:
    """True if there are enough slots in the window to charge fully."""
    if spec.deadline_slot > spec.earliest_start_slot:
        available = spec.deadline_slot - spec.earliest_start_slot
    else:
        available = (SLOTS - spec.earliest_start_slot) + spec.deadline_slot
    return available >= spec.required_slots


# ---------------------------------------------------------------------------
# Geyser / Water Heater (first-order thermal model)
# ---------------------------------------------------------------------------

@dataclass
class GeyserSpec:
    capacity_litres: float = 25.0
    power_kw: float = 2.0
    # heat loss: degrees C lost per hour per degree above ambient
    heat_loss_coeff: float = 0.05
    initial_temp_c: float = 25.0   # water temp at start of day
    ambient_temp_c: float = 25.0
    min_required_temp_c: float = 50.0  # must reach this by deadline
    max_temp_c: float = 70.0
    deadline_slot: int = 14        # by 07:00 (slot 14)


# ASSUMPTION: specific heat of water = 4.186 kJ/kg·K; density = 1 kg/L
_WATER_SH_KJ_PER_KG_K = 4.186


def geyser_heating_rate_c_per_slot(spec: GeyserSpec) -> float:
    """
    Temperature rise per half-hour slot when geyser is on.
    Power [kW] * 0.5 h * 3600 kJ/kWh / (mass_kg * SH [kJ/kg/K])
    """
    mass_kg = spec.capacity_litres  # density = 1 kg/L
    energy_kj_per_slot = spec.power_kw * SLOT_H * 3600
    return energy_kj_per_slot / (mass_kg * _WATER_SH_KJ_PER_KG_K)


def geyser_loss_rate_c_per_slot(spec: GeyserSpec, current_temp: float) -> float:
    """Temperature drop due to ambient heat loss in one half-hour slot."""
    return spec.heat_loss_coeff * (current_temp - spec.ambient_temp_c) * SLOT_H


def geyser_simulate(spec: GeyserSpec, on_slots: list[int]) -> list[float]:
    """
    Simulate water temperature over 48 slots.
    on_slots: sorted list of slot indices when geyser is active.
    Returns list of 48 temperatures (start of each slot).
    """
    rate_on = geyser_heating_rate_c_per_slot(spec)
    temp = spec.initial_temp_c
    temps = []
    on_set = set(on_slots)
    for s in range(SLOTS):
        temps.append(temp)
        loss = geyser_loss_rate_c_per_slot(spec, temp)
        if s in on_set:
            temp = min(spec.max_temp_c, temp + rate_on - loss)
        else:
            temp = max(spec.ambient_temp_c, temp - loss)
    return temps


def geyser_min_slots_needed(spec: GeyserSpec) -> int:
    """Minimum heating slots to raise water from initial to required temp."""
    rate_on = geyser_heating_rate_c_per_slot(spec)
    delta = spec.min_required_temp_c - spec.initial_temp_c
    if delta <= 0:
        return 0
    # Approximate: ignore heat loss for minimum estimate
    return max(1, int(delta / rate_on) + 1)


def geyser_comfort_satisfied(spec: GeyserSpec, on_slots: list[int]) -> tuple[bool, float]:
    """
    Returns (satisfied, final_temp_at_deadline).
    satisfied is True if the water reaches min_required_temp by the deadline slot.
    """
    temps = geyser_simulate(spec, on_slots)
    temp_at_deadline = temps[min(spec.deadline_slot, SLOTS - 1)]
    return temp_at_deadline >= spec.min_required_temp_c, temp_at_deadline
