"""Checks on the default scenario that the dashboard opens with."""

from metrics import attach_comparisons
from optimizer import _time_to_slot
from simulator import ScenarioConfig, build_population, run_simulation


def test_ev_never_charges_before_it_is_plugged_in():
    for home in build_population(ScenarioConfig()):
        for app in home.appliances:
            if app.name == "EV charger":
                assert _time_to_slot(app.earliest_start) == _time_to_slot(app.current_start)
                assert _time_to_slot(app.earliest_start) >= _time_to_slot("18:00")


def test_default_scenario_shows_rebound_and_flockshield_fixes_it():
    r = run_simulation(ScenarioConfig())
    a, b, c = r.unmanaged_metrics, r.independent_metrics, r.coordinated_metrics
    attach_comparisons(a, c, b)

    # Independent optimization creates a higher peak than doing nothing.
    assert b.peak_demand_kw > a.peak_demand_kw
    assert b.overloaded_transformers > 0

    # FlockShield keeps every transformer within capacity.
    assert c.overloaded_transformers == 0
    assert c.infeasible_appliances == 0
    assert c.peak_demand_kw < a.peak_demand_kw

    # Coordination costs households almost nothing compared with optimizing alone.
    assert c.total_cost_inr_per_day <= b.total_cost_inr_per_day * 1.001
    assert c.losers_vs_unmanaged == 0
