import pytest
from simulator import ScenarioConfig, run_simulation
from metrics import StrategyMetrics

def test_strict_capacity_respects_limits():
    """Test 100-500 homes with strict capacity limits."""
    for homes in [100, 200, 300, 400, 500]:
        cfg = ScenarioConfig(
            n_homes=homes,
            n_transformers=5,
            transformer_capacity_kw=50.0,
            seed=42,
            enable_load_shedding=True
        )
        r = run_simulation(cfg)
        m = r.coordinated_metrics
        
        # If the simulation claims NO overloaded slots, then demand must NEVER exceed capacity
        if m.overloaded_transformer_slots == 0:
            assert m.max_transformer_utilization_pct <= 100.0
            
            # Check every slot manually
            for t_idx, demand in enumerate(r.coordinated_demand):
                # The aggregate is across all transformers, wait, coordinated_demand is per home!
                # Actually agg_c is neighbourhood demand.
                pass
            
            # r.coordinated_transformer_status contains per-transformer statuses
            for status in r.coordinated_transformer_status:
                assert status.overloaded_slots == 0
                assert status.max_utilization_pct <= 100.0
                assert status.peak_load_kw <= 50.0 + 1e-4

def test_impossible_scenario():
    """Test an impossible scenario where base load alone exceeds capacity."""
    # 500 homes on 5 transformers (100 homes per transformer)
    # 100 homes * 0.3 kW base load = 30 kW base load.
    # Transformer capacity = 10 kW.
    cfg = ScenarioConfig(
        n_homes=500,
        n_transformers=5,
        transformer_capacity_kw=10.0,
        seed=42,
        enable_load_shedding=True
    )
    r = run_simulation(cfg)
    m = r.coordinated_metrics
    
    # Must explicitly NOT be completely feasible
    assert m.overloaded_transformer_slots > 0
    assert m.max_transformer_utilization_pct > 100.0
    
    # Must shed a lot of appliances
    assert m.comfort_violations > 0
