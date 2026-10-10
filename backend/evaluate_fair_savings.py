import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath('simulator.py')))
from simulator import ScenarioConfig, run_simulation, simulate_unmanaged, simulate_independent, simulate_coordinated, build_population, get_tariff
from transformer import Transformer

def _calc_metrics(demand_slots, price, carbon):
    cost = sum(kw * 0.5 * price[s] for s, kw in enumerate(demand_slots))
    co2 = sum(kw * 0.5 * carbon[s] for s, kw in enumerate(demand_slots))
    energy = sum(kw * 0.5 for kw in demand_slots)
    return cost, co2, energy

def print_markdown_table(mode, results):
    print(f"\n### Results: {mode}")
    print("| Homes | Strategy | Peak Demand (kW) | Max Util (%) | Overloaded Ints | Max Overload (kW) | Cost (₹) | Savings vs Unmanaged | Losers | Max Loss (₹) | CO2e (kg) | Unmet Energy (kWh) | Sheds / Infeas |")
    print("|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in results:
        print(f"| {r['homes']} | {r['strategy']} | {r['peak']:.1f} | {r['max_util']:.1f}% | {r['ovr_ints']} | {r['max_ovr']:.1f} | {r['cost']:.1f} | {r['savings_inr']:.1f} ({r['savings_pct']:.1f}%) | {r['losers']} ({r['losers_pct']:.1f}%) | {r['max_loss']:.1f} | {r['co2']:.1f} | {r['unmet']:.1f} | {r['sheds_infeas']} |")


def main():
    print("## FAIR SAVINGS BENCHMARK")
    
    for shedding in [False, True]:
        results = []
        mode = 'Strict Capacity / Load Shedding' if shedding else 'Overload Minimization (Fallback)'
        
        for homes_count in [100, 200, 300, 400, 500]:
            cfg = ScenarioConfig(n_homes=homes_count, n_transformers=5, transformer_capacity_kw=50.0, seed=42, enable_load_shedding=shedding)
            
            tariff = get_tariff(cfg.tariff_id)
            price = tariff["price_slots"]
            carbon = tariff["carbon_slots"]
            
            homes = build_population(cfg)
            transformers = [Transformer(id=f"T{i+1:02d}", capacity_kw=cfg.transformer_capacity_kw, home_ids=[h.id for h in homes if h.transformer_idx == i]) for i in range(cfg.n_transformers)]
            
            demand_a = simulate_unmanaged(homes)
            demand_b, _ = simulate_independent(homes, price, carbon)
            demand_c, decisions_c = simulate_coordinated(homes, transformers, price, carbon, enable_load_shedding=cfg.enable_load_shedding)
            
            costs_a = [_calc_metrics(d, price, carbon)[0] for d in demand_a]
            costs_b = [_calc_metrics(d, price, carbon)[0] for d in demand_b]
            costs_c = [_calc_metrics(d, price, carbon)[0] for d in demand_c]
            
            r = run_simulation(cfg)
            ma = r.unmanaged_metrics
            mb = r.independent_metrics
            mc = r.coordinated_metrics
            
            flockshield_losers = sum(1 for i in range(homes_count) if costs_c[i] > costs_a[i] + 1e-4)
            independent_losers = sum(1 for i in range(homes_count) if costs_b[i] > costs_a[i] + 1e-4)
            
            flockshield_max_loss = max((costs_c[i] - costs_a[i] for i in range(homes_count)), default=0.0)
            independent_max_loss = max((costs_b[i] - costs_a[i] for i in range(homes_count)), default=0.0)
            flockshield_max_loss = flockshield_max_loss if flockshield_max_loss > 0 else 0.0
            independent_max_loss = independent_max_loss if independent_max_loss > 0 else 0.0
            
            unmet_energy = ma.total_energy_kwh - mc.total_energy_kwh if shedding else 0.0
            
            results.append({
                'homes': homes_count, 'strategy': 'Unmanaged', 'peak': ma.peak_demand_kw,
                'max_util': ma.max_transformer_utilization_pct, 'ovr_ints': ma.overloaded_transformer_slots,
                'max_ovr': ma.max_transformer_overload_kw, 'cost': ma.total_cost_inr_per_day,
                'savings_inr': 0.0, 'savings_pct': 0.0, 'losers': 0, 'losers_pct': 0.0, 'max_loss': 0.0, 'co2': ma.total_co2_kg_per_day,
                'unmet': 0.0, 'sheds_infeas': '-'
            })
            
            results.append({
                'homes': homes_count, 'strategy': 'Independent', 'peak': mb.peak_demand_kw,
                'max_util': mb.max_transformer_utilization_pct, 'ovr_ints': mb.overloaded_transformer_slots,
                'max_ovr': mb.max_transformer_overload_kw, 'cost': mb.total_cost_inr_per_day,
                'savings_inr': ma.total_cost_inr_per_day - mb.total_cost_inr_per_day, 
                'savings_pct': (ma.total_cost_inr_per_day - mb.total_cost_inr_per_day)/ma.total_cost_inr_per_day * 100, 
                'losers': independent_losers, 'losers_pct': (independent_losers/homes_count)*100, 'max_loss': independent_max_loss, 'co2': mb.total_co2_kg_per_day,
                'unmet': 0.0, 'sheds_infeas': '-'
            })
            
            results.append({
                'homes': homes_count, 'strategy': 'FlockShield', 'peak': mc.peak_demand_kw,
                'max_util': mc.max_transformer_utilization_pct, 'ovr_ints': mc.overloaded_transformer_slots,
                'max_ovr': mc.max_transformer_overload_kw, 'cost': mc.total_cost_inr_per_day,
                'savings_inr': ma.total_cost_inr_per_day - mc.total_cost_inr_per_day, 
                'savings_pct': (ma.total_cost_inr_per_day - mc.total_cost_inr_per_day)/ma.total_cost_inr_per_day * 100, 
                'losers': flockshield_losers, 'losers_pct': (flockshield_losers/homes_count)*100, 'max_loss': flockshield_max_loss, 'co2': mc.total_co2_kg_per_day,
                'unmet': unmet_energy, 'sheds_infeas': f"{mc.comfort_violations} / {mc.infeasible_appliances}"
            })
        print_markdown_table(mode, results)

if __name__ == '__main__':
    main()
