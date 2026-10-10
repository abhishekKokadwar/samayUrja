"""
tariffs.py — Load and expand tariff presets into per-slot arrays.

A day has 48 half-hour slots.  Slot 0 = 00:00-00:30, slot 47 = 23:30-24:00.
Each tariff band covers a range of hours; overlapping bands are resolved
left-to-right (first match wins).  An unlabelled "normal" band covers
all remaining slots.

Units:
  price   — INR / kWh
  carbon  — kg CO2 / kWh
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

SLOTS = 48  # half-hour slots per day
SLOT_H = 0.5  # hours per slot

_TARIFF_PATH = os.path.join(os.path.dirname(__file__), "tariffs.json")


@lru_cache(maxsize=1)
def _load_raw() -> list[dict[str, Any]]:
    with open(_TARIFF_PATH, encoding="utf-8") as f:
        return json.load(f)


def list_tariffs() -> list[dict[str, Any]]:
    """Return all tariff presets with pre-expanded slot arrays."""
    return [expand_tariff(t) for t in _load_raw()]


def get_tariff(tariff_id: str) -> dict[str, Any]:
    raw = _load_raw()
    for t in raw:
        if t["id"] == tariff_id:
            return expand_tariff(t)
    raise KeyError(f"Unknown tariff id: {tariff_id!r}")


def expand_tariff(t: dict[str, Any]) -> dict[str, Any]:
    """
    Return a copy of the tariff dict with two extra keys:
      "price_slots"  -- list[float] len=48, INR/kWh
      "carbon_slots" -- list[float] len=48, kg CO2/kWh
    """
    base = t["base_inr_per_kwh"]
    price_slots = [0.0] * SLOTS
    carbon_slots = [0.0] * SLOTS
    assigned = [False] * SLOTS

    default_mult = 1.0
    default_kg = 0.70

    for band in t["bands"]:
        if "from" not in band:
            default_mult = band["multiplier"]
            default_kg = band.get("kg_per_kwh", 0.70)
            continue
        s_from = _time_to_slot(band["from"])
        s_to = _time_to_slot(band["to"])
        if s_to == s_from:
            slots = list(range(SLOTS))
        elif s_to > s_from:
            slots = list(range(s_from, s_to))
        else:  # wraps past midnight
            slots = list(range(s_from, SLOTS)) + list(range(0, s_to))

        for s in slots:
            if not assigned[s]:
                price_slots[s] = base * band["multiplier"]
                carbon_slots[s] = band.get("kg_per_kwh", 0.70)
                assigned[s] = True

    # Fill unassigned slots with the default
    for s in range(SLOTS):
        if not assigned[s]:
            price_slots[s] = base * default_mult
            carbon_slots[s] = default_kg

    result = dict(t)
    result["price_slots"] = price_slots
    result["carbon_slots"] = carbon_slots
    return result


def _time_to_slot(t: str) -> int:
    """Convert 'HH:MM' to slot index (0-47)."""
    h, m = map(int, t.split(":"))
    return h * 2 + m // 30


def slot_label(s: int) -> str:
    """Return 'HH:MM' string for slot start."""
    h = s // 2
    m = (s % 2) * 30
    return f"{h:02d}:{m:02d}"
