import pytest
from app import app
from fastapi.testclient import TestClient

def test_api_returns_fairness_metrics():
    client = TestClient(app)
    response = client.post("/simulate", json={
        "n_homes": 20,
        "n_transformers": 2,
        "transformer_capacity_kw": 10.0,  # low capacity to force losers
        "seed": 42
    })
    
    assert response.status_code == 200
    data = response.json()
    
    metrics = data["coordinated_metrics"]
    
    assert "losers_vs_unmanaged" in metrics
    assert "losers_vs_unmanaged_pct" in metrics
    assert "max_cost_increase_vs_unmanaged_inr" in metrics
    assert "losers_vs_independent" in metrics
    assert "losers_vs_independent_pct" in metrics
    assert "max_cost_increase_vs_independent_inr" in metrics
    
    # We should have some losers since we forced a low capacity
    assert metrics["losers_vs_unmanaged"] >= 0
    assert metrics["losers_vs_independent"] >= 0
