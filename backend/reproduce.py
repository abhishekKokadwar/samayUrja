from simulator import ScenarioConfig, run_simulation

configs = [100, 200, 300, 400, 500]

for homes in configs:
    cfg = ScenarioConfig(n_homes=homes, n_transformers=5, seed=42)
    r = run_simulation(cfg)
    
    # We want to check overloaded slots for each strategy
    # The overloaded slots might be summed across transformers?
    u_over = r.unmanaged_metrics.overloaded_slots
    i_over = r.independent_metrics.overloaded_slots
    f_over = r.coordinated_metrics.overloaded_slots
    
    print(f"Homes: {homes:3} | Unmanaged: {u_over:3} | Independent: {i_over:3} | FlockShield: {f_over:3}")

