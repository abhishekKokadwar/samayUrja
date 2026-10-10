import os

def rewrite_coordinator():
    path = '/home/mella/Desktop/build/samayUrja/backend/coordinator.py'
    
    with open(path, 'r') as f:
        content = f.read()

    # The file currently has `coordinate`. We want to rename it to `coordinate_round_robin`.
    content = content.replace('def coordinate(', 'def coordinate_round_robin(')

    new_implementations = """
def coordinate_greedy(
    homes_appliances: list[list[CoordApplianceSpec]],
    homes_base_load: list[list[float]],
    homes_sanctioned_kw: list[float],
    homes_transformer_idx: list[int],
    transformers: list[Transformer],
    price: list[float],
    carbon: list[float],
    enable_load_shedding: bool = False,
) -> tuple[list[CoordHomeResult], list[CoordDecision]]:
    n_homes = len(homes_appliances)
    home_load: list[list[float]] = [list(bl) for bl in homes_base_load]
    transformer_load: list[list[float]] = [[0.0] * SLOTS for _ in transformers]
    for home_idx, t_idx in enumerate(homes_transformer_idx):
        for s in range(SLOTS):
            transformer_load[t_idx][s] += homes_base_load[home_idx][s]

    all_decisions: list[CoordDecision] = []
    home_results: list[CoordHomeResult] = []

    for home_idx in range(n_homes):
        t_idx = homes_transformer_idx[home_idx]
        transformer = transformers[t_idx]
        sanctioned = homes_sanctioned_kw[home_idx]
        decisions: list[CoordDecision] = []
        infeasible_count = 0

        apps = sorted(homes_appliances[home_idx], key=lambda a: a.power_kw * a.duration_slots, reverse=True)

        for app in apps:
            n = app.duration_slots
            if not app.shiftable:
                for i in range(n):
                    s = (app.current_start_slot + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw
                decisions.append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=app.current_start_slot, reason="fixed", constraint="fixed", passed_validation=True))
                continue

            candidates = _candidate_starts(app.earliest_slot, app.latest_end_slot, n)
            feasible = []
            for s in candidates:
                home_ok = all(home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6 for i in range(n))
                xfmr_ok = all(transformer_load[t_idx][(s + i) % SLOTS] + app.power_kw <= transformer.capacity_kw + 1e-6 for i in range(n))
                if home_ok and xfmr_ok: feasible.append(s)

            if not feasible:
                if enable_load_shedding:
                    decisions.append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=-1, reason="Load Shed", constraint="infeasible", passed_validation=False))
                    infeasible_count += 1
                    continue
                home_feasible = [s for s in candidates if all(home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6 for i in range(n))]
                if home_feasible:
                    best = min(home_feasible, key=lambda start_s: (max(transformer_load[t_idx][(start_s + i) % SLOTS] for i in range(n)), _slot_cost(start_s, n, price, carbon, app.power_kw)[0]))
                    decisions.append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason="transformer overload fallback", constraint="transformer_capacity", passed_validation=False))
                    infeasible_count += 1
                else:
                    best = app.current_start_slot
                    decisions.append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason="completely infeasible", constraint="infeasible", passed_validation=False))
                    infeasible_count += 1
                for i in range(n):
                    s = (best + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw
                continue

            def _score(s):
                cost, co2 = _slot_cost(s, n, price, carbon, app.power_kw)
                dist = min(abs(s - app.current_start_slot), SLOTS - abs(s - app.current_start_slot))
                return (cost, co2, dist)
            
            best = min(feasible, key=_score)
            
            for i in range(n):
                s = (best + i) % SLOTS
                home_load[home_idx][s] += app.power_kw
                transformer_load[t_idx][s] += app.power_kw
            decisions.append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason="placed", constraint="tariff", passed_validation=True))

        home_results.append(CoordHomeResult(home_id=home_idx, transformer_id=transformer.id, demand_slots=home_load[home_idx], decisions=decisions, infeasible_appliances=infeasible_count))
        all_decisions.extend(decisions)

    return home_results, all_decisions


def coordinate_balanced(
    homes_appliances: list[list[CoordApplianceSpec]],
    homes_base_load: list[list[float]],
    homes_sanctioned_kw: list[float],
    homes_transformer_idx: list[int],
    transformers: list[Transformer],
    price: list[float],
    carbon: list[float],
    enable_load_shedding: bool = False,
) -> tuple[list[CoordHomeResult], list[CoordDecision]]:
    n_homes = len(homes_appliances)
    home_load: list[list[float]] = [list(bl) for bl in homes_base_load]
    transformer_load: list[list[float]] = [[0.0] * SLOTS for _ in transformers]
    for home_idx, t_idx in enumerate(homes_transformer_idx):
        for s in range(SLOTS):
            transformer_load[t_idx][s] += homes_base_load[home_idx][s]

    all_decisions: list[CoordDecision] = []
    home_decisions: list[list[CoordDecision]] = [[] for _ in range(n_homes)]
    home_infeasible_counts: list[int] = [0 for _ in range(n_homes)]
    home_penalties: list[float] = [0.0 for _ in range(n_homes)]

    for home_idx in range(n_homes):
        homes_appliances[home_idx] = sorted(homes_appliances[home_idx], key=lambda a: a.power_kw * a.duration_slots, reverse=True)

    max_apps = max((len(apps) for apps in homes_appliances), default=0)

    for app_idx in range(max_apps):
        # Sort households by their accumulated cost penalty (highest penalty picks first!)
        # Tie-breaker is home_idx to remain deterministic
        order = sorted(range(n_homes), key=lambda idx: (home_penalties[idx], -idx), reverse=True)
        
        for home_idx in order:
            if app_idx >= len(homes_appliances[home_idx]): continue

            app = homes_appliances[home_idx][app_idx]
            t_idx = homes_transformer_idx[home_idx]
            transformer = transformers[t_idx]
            sanctioned = homes_sanctioned_kw[home_idx]
            n = app.duration_slots

            if not app.shiftable:
                for i in range(n):
                    s = (app.current_start_slot + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw
                home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=app.current_start_slot, reason="fixed", constraint="fixed", passed_validation=True))
                continue

            candidates = _candidate_starts(app.earliest_slot, app.latest_end_slot, n)
            feasible = []
            
            # Find the optimal unconstrained cost to measure penalty
            optimal_cost = min((_slot_cost(s, n, price, carbon, app.power_kw)[0] for s in candidates), default=0.0)

            for s in candidates:
                home_ok = all(home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6 for i in range(n))
                xfmr_ok = all(transformer_load[t_idx][(s + i) % SLOTS] + app.power_kw <= transformer.capacity_kw + 1e-6 for i in range(n))
                if home_ok and xfmr_ok: feasible.append(s)

            if not feasible:
                if enable_load_shedding:
                    home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=-1, reason="Load Shed", constraint="infeasible", passed_validation=False))
                    home_infeasible_counts[home_idx] += 1
                    continue
                home_feasible = [s for s in candidates if all(home_load[home_idx][(s + i) % SLOTS] + app.power_kw <= sanctioned + 1e-6 for i in range(n))]
                if home_feasible:
                    best = min(home_feasible, key=lambda start_s: (max(transformer_load[t_idx][(start_s + i) % SLOTS] for i in range(n)), _slot_cost(start_s, n, price, carbon, app.power_kw)[0]))
                    home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason="transformer overload fallback", constraint="transformer_capacity", passed_validation=False))
                    home_infeasible_counts[home_idx] += 1
                    # They suffered a penalty
                    actual_cost = _slot_cost(best, n, price, carbon, app.power_kw)[0]
                    home_penalties[home_idx] += (actual_cost - optimal_cost)
                else:
                    best = app.current_start_slot
                    home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason="completely infeasible", constraint="infeasible", passed_validation=False))
                    home_infeasible_counts[home_idx] += 1
                for i in range(n):
                    s = (best + i) % SLOTS
                    home_load[home_idx][s] += app.power_kw
                    transformer_load[t_idx][s] += app.power_kw
                continue

            # Balanced Score: (cost, peak_transformer_load_during_this_slot)
            # This perfectly flattens the curve across the cheap band!
            def _score(s):
                cost, co2 = _slot_cost(s, n, price, carbon, app.power_kw)
                peak_load = max(transformer_load[t_idx][(s + i) % SLOTS] for i in range(n))
                return (cost, peak_load, co2)
            
            best = min(feasible, key=_score)
            actual_cost = _slot_cost(best, n, price, carbon, app.power_kw)[0]
            home_penalties[home_idx] += (actual_cost - optimal_cost)
            
            for i in range(n):
                s = (best + i) % SLOTS
                home_load[home_idx][s] += app.power_kw
                transformer_load[t_idx][s] += app.power_kw
            home_decisions[home_idx].append(CoordDecision(home_id=home_idx, appliance_name=app.name, prev_slot=app.current_start_slot, new_slot=best, reason="placed", constraint="tariff", passed_validation=True))

    home_results: list[CoordHomeResult] = []
    for home_idx in range(n_homes):
        t_idx = homes_transformer_idx[home_idx]
        home_results.append(CoordHomeResult(home_id=home_idx, transformer_id=transformers[t_idx].id, demand_slots=home_load[home_idx], decisions=home_decisions[home_idx], infeasible_appliances=home_infeasible_counts[home_idx]))
        all_decisions.extend(home_decisions[home_idx])

    return home_results, all_decisions

def coordinate(
    homes_appliances: list[list[CoordApplianceSpec]],
    homes_base_load: list[list[float]],
    homes_sanctioned_kw: list[float],
    homes_transformer_idx: list[int],
    transformers: list[Transformer],
    price: list[float],
    carbon: list[float],
    enable_load_shedding: bool = False,
) -> tuple[list[CoordHomeResult], list[CoordDecision]]:
    # Change this alias to test different strategies. The application uses `coordinate`.
    return coordinate_balanced(homes_appliances, homes_base_load, homes_sanctioned_kw, homes_transformer_idx, transformers, price, carbon, enable_load_shedding)

"""

    with open(path, 'w') as f:
        f.write(content + "\n" + new_implementations)

rewrite_coordinator()
