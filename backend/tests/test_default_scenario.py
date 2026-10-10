"""Checks on the default scenario that the dashboard opens with."""

from metrics import attach_comparisons
from optimizer import _time_to_slot
from simulator import ScenarioConfig, build_population, hosting_capacity, run_simulation


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


def test_hot_water_is_ready_on_time_under_every_tariff():
    for tariff_id in ("tod-ev-illustrative", "tod-domestic-illustrative", "flat-domestic-illustrative"):
        r = run_simulation(ScenarioConfig(tariff_id=tariff_id))
        assert r.unmanaged_metrics.cold_water_homes == 0
        assert r.independent_metrics.cold_water_homes == 0
        assert r.coordinated_metrics.cold_water_homes == 0
        assert r.coordinated_metrics.infeasible_appliances == 0


def test_air_conditioners_are_never_moved():
    r = run_simulation(ScenarioConfig(n_homes=100))
    acs = [d for d in r.decisions if d["appliance_name"] == "Air conditioner"]
    assert acs
    assert all(d["prev_time"] == d["new_time"] and d["constraint"] == "fixed" for d in acs)


def test_rooftop_solar_lowers_midday_demand_and_cost():
    none = run_simulation(ScenarioConfig(solar_adoption_rate=0.0))
    full = run_simulation(ScenarioConfig(solar_adoption_rate=1.0))
    noon = 25  # 12:30
    assert full.coordinated_demand[noon] < none.coordinated_demand[noon]
    assert full.coordinated_metrics.total_cost_inr_per_day < none.coordinated_metrics.total_cost_inr_per_day
    # No sun at the evening or early-morning peaks, so solar does not change them.
    assert full.unmanaged_metrics.peak_demand_kw == none.unmanaged_metrics.peak_demand_kw


def test_every_decision_carries_an_explanation():
    r = run_simulation(ScenarioConfig())
    assert all(len(d["reason"]) > 20 for d in r.decisions)
    # At 60% EV adoption the cheapest slots fill up, so some moves cite the transformer.
    busy = run_simulation(ScenarioConfig(ev_adoption_rate=0.6))
    assert any(d["constraint"] == "transformer_capacity" for d in busy.decisions)


def test_decision_summary_counts_every_decision():
    r = run_simulation(ScenarioConfig())
    s = r.decision_summary
    assert s["total"] > len(r.decisions)  # the list is a sample, the summary is not
    assert s["fixed"] + s["moved"] + s["unchanged"] + s["unplaced"] == s["total"]
    assert s["unplaced"] == r.coordinated_metrics.infeasible_appliances == 0


def test_flockshield_lets_the_same_transformers_host_more_evs():
    h = hosting_capacity(ScenarioConfig())
    assert h["ev_pct"] == list(range(0, 101, 10))
    assert all(len(v) == 11 for v in h["utilization_pct"].values())
    # The default scenario (30% EVs) already overloads today and is fine when coordinated.
    assert h["max_ev_pct"]["unmanaged"] < 30 <= h["max_ev_pct"]["coordinated"]
    # Optimizing alone overloads the transformers before any EV is added.
    assert h["max_ev_pct"]["independent"] is None
