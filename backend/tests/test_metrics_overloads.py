import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(__file__))

from simulator import ScenarioConfig, run_simulation

def test_overloaded_slots_is_unique_time_intervals():
    """Verify that overloaded slots never exceeds 48 and counts unique intervals across transformers."""
    # Run with 500 homes to guarantee overloads
    cfg = ScenarioConfig(
        n_homes=500,
        n_transformers=5,
        transformer_capacity_kw=50.0,
        seed=42
    )
    result = run_simulation(cfg)
    
    # Check that Unmanaged had some overloads
    unmanaged_slots = result.unmanaged_metrics.overloaded_transformer_slots
    assert unmanaged_slots > 0, "Expected unmanaged to have overloads at 500 homes / 50 kW capacity"
    
    # But it must be <= 48
    assert unmanaged_slots <= 48, f"Numerator cannot exceed denominator 48, got {unmanaged_slots}"
    
    # Check that the metric matches the number of unique slots across all transformer violations
    unique_slots = set()
    for t_status in result.unmanaged_transformer_status:
        for violation in t_status.violations:
            unique_slots.add(violation.slot)
            
    assert unmanaged_slots == len(unique_slots), (
        f"Expected metric {unmanaged_slots} to equal unique violated slots {len(unique_slots)}"
    )

    # Verify new magnitude metrics
    max_kw = result.unmanaged_metrics.max_transformer_overload_kw
    excess_kwh = result.unmanaged_metrics.total_excess_energy_kwh
    
    assert max_kw > 0, "Max overload should be > 0 when overloads occur"
    assert excess_kwh > 0, "Excess energy should be > 0 when overloads occur"
    
    # Calculate manually to verify
    manual_max_kw = 0.0
    manual_excess_kwh = 0.0
    from tariffs import SLOT_H
    
    for t_status in result.unmanaged_transformer_status:
        for v in t_status.violations:
            manual_max_kw = max(manual_max_kw, v.overload_kw)
            manual_excess_kwh += v.overload_kw * SLOT_H
            
    assert abs(max_kw - manual_max_kw) < 0.01
    assert abs(excess_kwh - manual_excess_kwh) < 0.01

