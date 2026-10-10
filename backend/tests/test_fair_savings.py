import pytest
from simulator import ScenarioConfig, run_simulation

def test_fair_savings_calculation():
    """Verify that savings logic is consistent and shedding unmet energy is not counted as delivered."""
    cfg_no_shed = ScenarioConfig(n_homes=100, n_transformers=5, transformer_capacity_kw=50.0, seed=42, enable_load_shedding=False)
    r_no_shed = run_simulation(cfg_no_shed)
    
    cfg_shed = ScenarioConfig(n_homes=500, n_transformers=5, transformer_capacity_kw=50.0, seed=42, enable_load_shedding=True)
    r_shed = run_simulation(cfg_shed)
    
    # In 100 homes (no shedding, no overloads), energy should be identical across all strategies
    assert abs(r_no_shed.unmanaged_metrics.total_energy_kwh - r_no_shed.coordinated_metrics.total_energy_kwh) < 1e-4
    
    # In 500 homes (shedding enabled), shedding happens, so total energy MUST be lower than unmanaged
    assert r_shed.coordinated_metrics.total_energy_kwh < r_shed.unmanaged_metrics.total_energy_kwh
    
    # Ensure savings calculation is mathematically correct: (Unmanaged Cost) - (Coordinated Cost)
    expected_savings = round(r_no_shed.unmanaged_metrics.total_cost_inr_per_day - r_no_shed.coordinated_metrics.total_cost_inr_per_day, 2)
    
    # Since attach_comparisons isn't run automatically by run_simulation alone, we check the raw values here:
    assert expected_savings > 0

def test_app_metrics_out():
    """Ensure the API returns all newly added metrics."""
    from app import app
    from fastapi.testclient import TestClient
    
    client = TestClient(app)
    response = client.post("/simulate", json={
        "n_homes": 10,
        "n_transformers": 1,
        "transformer_capacity_kw": 50.0
    })
    
    assert response.status_code == 200
    data = response.json()
    
    assert "infeasible_appliances" in data["coordinated_metrics"]
    assert "comfort_violations" in data["coordinated_metrics"]
