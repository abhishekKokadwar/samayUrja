import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath('simulator.py')))
from simulator import ScenarioConfig, run_simulation, simulate_unmanaged, simulate_independent, build_population, get_tariff
from transformer import Transformer
from metrics import compute_metrics, attach_comparisons
import coordinator

def print_markdown_table(mode, results):
    print(f"\n### Results: {mode}")
    print("| Homes | Strategy | Peak Demand (kW) | Max Util (%) | Overloaded Ints | Max Overload (kW) | Cost (₹) | Savings vs Unmanaged | Losers | Max Loss (₹) | CO2e (kg) | Unmet Energy (kWh) | Sheds / Infeas |")
    print("|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in results:
        print(f"| {r['homes']} | {r['strategy']} | {r['peak']:.1f} | {r['max_util']:.1f}% | {r['ovr_ints']} | {r['max_ovr']:.1f} | {r['cost']:.1f} | {r['savings_inr']:.1f} ({r['savings_pct']:.1f}%) | {r['losers']} ({r['losers_pct']:.1f}%) | {r['max_loss']:.1f} | {r['co2']:.1f} | {r['unmet']:.1f} | {r['sheds_infeas']} |")

def main():
    print("## FAIR SAVINGS BENCHMARK")
    
    strategies = [
        ("FlockShield (Greedy)", coordinator.coordinate_greedy),
        ("FlockShield (RoundRobin)", coordinator.coordinate_round_robin),
        ("FlockShield (Balanced)", coordinator.coordinate_balanced),
    ]
    
    for shedding in [False, True]:
        results = []
        mode = 'Strict Capacity / Load Shedding' if shedding else 'Overload Minimization (Fallback)'
        
        for homes_count in [100, 200, 300, 400, 500]:
            cfg = ScenarioConfig(n_homes=homes_count, n_transformers=5, transformer_capacity_kw=50.0, seed=42, enable_load_shedding=shedding)
            
            # Run simulation for baseline
            r = run_simulation(cfg)
            ma = r.unmanaged_metrics
            mb = r.independent_metrics
            
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
                'savings_inr': mb.savings_vs_unmanaged_inr, 
                'savings_pct': (mb.savings_vs_unmanaged_inr)/ma.total_cost_inr_per_day * 100 if ma.total_cost_inr_per_day > 0 else 0, 
                'losers': mb.losers_vs_unmanaged, 'losers_pct': mb.losers_vs_unmanaged_pct, 'max_loss': mb.max_cost_increase_vs_unmanaged_inr, 'co2': mb.total_co2_kg_per_day,
                'unmet': 0.0, 'sheds_infeas': '-'
            })
            
            for strategy_name, coord_func in strategies:
                # Mock simulator.coordinate
                import simulator
                simulator.coordinate = coord_func
                rc = run_simulation(cfg)
                attach_comparisons(rc.unmanaged_metrics, rc.coordinated_metrics, independent=rc.independent_metrics)
                mc = rc.coordinated_metrics
                
                unmet_energy = ma.total_energy_kwh - mc.total_energy_kwh if shedding else 0.0
                
                results.append({
                    'homes': homes_count, 'strategy': strategy_name, 'peak': mc.peak_demand_kw,
                    'max_util': mc.max_transformer_utilization_pct, 'ovr_ints': mc.overloaded_transformer_slots,
                    'max_ovr': mc.max_transformer_overload_kw, 'cost': mc.total_cost_inr_per_day,
                    'savings_inr': mc.savings_vs_unmanaged_inr, 
                    'savings_pct': (mc.savings_vs_unmanaged_inr)/ma.total_cost_inr_per_day * 100 if ma.total_cost_inr_per_day > 0 else 0, 
                    'losers': mc.losers_vs_unmanaged, 'losers_pct': mc.losers_vs_unmanaged_pct, 'max_loss': mc.max_cost_increase_vs_unmanaged_inr, 'co2': mc.total_co2_kg_per_day,
                    'unmet': unmet_energy, 'sheds_infeas': f"{mc.comfort_violations} / {mc.infeasible_appliances}"
                })
        print_markdown_table(mode, results)

if __name__ == '__main__':
    main()
