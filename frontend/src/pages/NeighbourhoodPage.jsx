/**
 * NeighbourhoodPage — the flagship Murmuration view.
 *
 * Layout (revised for hackathon demo clarity):
 *  A. Compact header — title, status, SYNTHETIC DATA label
 *  B. Strategy selector
 *  C. 4 primary KPI cards — Peak Demand, Peak/Avg Ratio, Max Transformer %, Est. Savings
 *  D. Secondary metrics — CO₂, Overloaded Slots, + load-shedding diagnostics when active
 *  E. Main analytics — demand curve (prominent) + Transformer Health (with fullscreen)
 *  F. FlockShield decision log
 *  G. Scenario controls
 *  H. Simulation disclaimer
 */
import { useState, useCallback, useEffect } from 'react'
import {
  Zap, TrendingDown, BarChart2, PiggyBank, Leaf, AlertTriangle,
  Info, RefreshCw
} from 'lucide-react'
import { KPICard } from '../components/shared/KPICard.jsx'
import { LoadCurveChart } from '../components/neighbourhood/LoadCurveChart.jsx'
import { TransformerMap } from '../components/neighbourhood/TransformerMap.jsx'
import { ScenarioControls } from '../components/neighbourhood/ScenarioControls.jsx'
import { DecisionLog } from '../components/neighbourhood/DecisionLog.jsx'
import { api } from '../api.js'

const INR = v => v == null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)
const FMT = (v, d = 1) => v == null ? '—' : Number(v).toFixed(d)

const STRATEGY_OPTIONS = [
  { id: 'unmanaged', label: 'Unmanaged', color: '#94A3B8' },
  { id: 'independent', label: 'Independent', color: '#F4B860' },
  { id: 'coordinated', label: 'FlockShield', color: '#43D9A3' },
]

export default function NeighbourhoodPage() {
  const [simResult, setSimResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeStrategy, setActiveStrategy] = useState('coordinated')

  const runSimulation = useCallback(async (params) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.simulate(params)
      setSimResult(result)
    } catch (err) {
      setError(err.message || 'Simulation failed. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-run on mount
  useEffect(() => {
    runSimulation({
      n_homes: 100,
      n_transformers: 5,
      transformer_capacity_kw: 200,
      ev_adoption_rate: 0.30,
      ac_adoption_rate: 0.40,
      geyser_adoption_rate: 0.70,
      solar_adoption_rate: 0.10,
      tariff_id: 'tod-domestic-illustrative',
      sanctioned_load_kw: 5,
      seed: 42,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const metrics = simResult
    ? {
        unmanaged: simResult.unmanaged_metrics,
        independent: simResult.independent_metrics,
        coordinated: simResult.coordinated_metrics,
      }[activeStrategy]
    : null

  const coordMetrics = simResult?.coordinated_metrics
  const indepMetrics = simResult?.independent_metrics
  const unmanagedMetrics = simResult?.unmanaged_metrics

  const loadSheddingActive = simResult?.scenario?.enable_load_shedding

  // Status indicator
  const status = loading ? 'simulating' : error ? 'error' : simResult ? 'ready' : 'idle'

  return (
    <div className="p-4 lg:p-6 space-y-5">

      {/* ── A. Compact header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-[#EDF4F7] tracking-tight">
            Neighbourhood Intelligence
          </h1>
          {/* Live status pill */}
          <span
            className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5"
            style={{
              background: status === 'simulating' ? 'rgba(244,184,96,0.1)'
                : status === 'error' ? 'rgba(241,108,117,0.1)'
                : status === 'ready' ? 'rgba(67,217,163,0.08)'
                : 'rgba(148,163,184,0.08)',
              color: status === 'simulating' ? '#F4B860'
                : status === 'error' ? '#F16C75'
                : status === 'ready' ? '#43D9A3'
                : '#94A3B8',
              border: `1px solid ${
                status === 'simulating' ? 'rgba(244,184,96,0.2)'
                : status === 'error' ? 'rgba(241,108,117,0.2)'
                : status === 'ready' ? 'rgba(67,217,163,0.15)'
                : 'rgba(148,163,184,0.12)'
              }`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: status === 'simulating' ? '#F4B860'
                  : status === 'error' ? '#F16C75'
                  : status === 'ready' ? '#43D9A3'
                  : '#94A3B8',
                animation: status === 'simulating' ? 'pulse-soft 1.5s infinite' : 'none',
              }}
            />
            {status === 'simulating' ? 'Simulating…'
              : status === 'error' ? 'Error'
              : status === 'ready' ? 'Ready'
              : 'Idle'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {simResult && !loading && (
            <span className="text-[0.65rem] text-[#94A3B8] tabular-nums">
              {simResult.scenario.n_homes} homes · {FMT(simResult.elapsed_ms, 0)} ms
            </span>
          )}
          <span
            className="text-[0.62rem] px-2 py-1 rounded-lg font-semibold"
            style={{ background: 'rgba(244,184,96,0.08)', color: '#F4B860', border: '1px solid rgba(244,184,96,0.18)' }}
          >
            SYNTHETIC DATA
          </span>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-start gap-3 p-3 rounded-xl text-sm"
          style={{ background: 'rgba(241,108,117,0.07)', border: '1px solid rgba(241,108,117,0.18)' }}
        >
          <AlertTriangle size={15} color="#F16C75" className="flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[#F16C75] font-medium text-xs">Simulation error</p>
            <p className="text-[#94A3B8] text-[0.68rem] mt-0.5">{error}</p>
            <p className="text-[#94A3B8] text-[0.68rem] mt-1">
              Ensure the backend is running: <code className="text-[#58BFE8]">cd backend && uvicorn app:app --reload</code>
            </p>
          </div>
          <button
            onClick={() => runSimulation({
              n_homes: 100, n_transformers: 5, transformer_capacity_kw: 200,
              ev_adoption_rate: 0.30, ac_adoption_rate: 0.40, geyser_adoption_rate: 0.70,
              solar_adoption_rate: 0.10, tariff_id: 'tod-domestic-illustrative',
              sanctioned_load_kw: 5, seed: 42,
            })}
            className="btn-icon flex-shrink-0"
            aria-label="Retry simulation"
            title="Retry"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      {/* ── B. Strategy selector ──────────────────────────────────── */}
      {(simResult || loading) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[0.65rem] text-[#94A3B8] font-medium mr-1">Strategy:</span>
          {STRATEGY_OPTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveStrategy(s.id)}
              aria-pressed={activeStrategy === s.id}
              className="px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold transition-all"
              style={{
                background: activeStrategy === s.id ? `${s.color}14` : 'rgba(148,163,184,0.06)',
                color: activeStrategy === s.id ? s.color : '#94A3B8',
                border: `1px solid ${activeStrategy === s.id ? s.color + '2a' : 'rgba(148,163,184,0.12)'}`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── C. Primary KPI cards (4) ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Peak Demand"
          value={metrics ? FMT(metrics.peak_demand_kw) : '—'}
          unit="kW"
          icon={Zap}
          color="#58BFE8"
          loading={loading && !simResult}
          comparison={
            indepMetrics && activeStrategy === 'coordinated'
              ? `${FMT(indepMetrics.peak_demand_kw - (metrics?.peak_demand_kw || 0))} kW vs independent`
              : null
          }
        />
        <KPICard
          label="Peak / Avg Ratio"
          value={metrics ? FMT(metrics.peak_to_avg_ratio, 2) : '—'}
          unit="×"
          icon={BarChart2}
          color="#58BFE8"
          loading={loading && !simResult}
          comparison={
            activeStrategy === 'coordinated' && indepMetrics
              ? `${FMT(indepMetrics.peak_to_avg_ratio, 2)} → ${FMT(coordMetrics?.peak_to_avg_ratio, 2)} (lower is better)`
              : null
          }
        />
        <KPICard
          label="Max Transformer Load"
          value={metrics ? FMT(metrics.max_transformer_utilization_pct) : '—'}
          unit="% of rated capacity"
          icon={Zap}
          color={
            metrics
              ? metrics.max_transformer_utilization_pct > 100
                ? '#F16C75'
                : metrics.max_transformer_utilization_pct > 90
                  ? '#F4B860'
                  : '#43D9A3'
              : '#94A3B8'
          }
          loading={loading && !simResult}
          comparison={
            metrics?.max_transformer_utilization_pct != null
              ? metrics.max_transformer_utilization_pct > 100
                ? `${FMT(metrics.max_transformer_utilization_pct - 100)} % above rated capacity (simulated)`
                : metrics.max_transformer_utilization_pct > 90
                ? 'Near rated capacity'
                : 'Below rated capacity'
              : null
          }
        />
        <KPICard
          label={
            metrics?.savings_vs_unmanaged_inr != null && metrics.savings_vs_unmanaged_inr < 0
              ? 'Extra Cost vs Unmanaged'
              : 'Est. Daily Savings'
          }
          value={
            metrics?.savings_vs_unmanaged_inr != null
              ? `₹${INR(Math.abs(metrics.savings_vs_unmanaged_inr))}`
              : '—'
          }
          unit={
            metrics?.savings_vs_unmanaged_inr != null && metrics.savings_vs_unmanaged_inr < 0
              ? 'more than unmanaged'
              : 'saved vs unmanaged'
          }
          icon={PiggyBank}
          color={metrics?.savings_vs_unmanaged_inr >= 0 ? '#43D9A3' : '#F16C75'}
          loading={loading && !simResult}
          comparison={
            activeStrategy === 'unmanaged' ? 'Baseline — no scheduling applied'
            : metrics?.savings_vs_unmanaged_inr != null && metrics.savings_vs_unmanaged_inr < 0
              ? 'Costs more due to tariff or comfort trade-offs'
              : null
          }
        />
      </div>

      {/* ── D. Secondary metrics + diagnostics ───────────────────── */}
      {(simResult || loading) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label={
              metrics?.co2_avoided_vs_unmanaged_kg != null && metrics.co2_avoided_vs_unmanaged_kg < 0
                ? 'Est. CO₂ Increase'
                : 'Est. CO₂ Avoided'
            }
            value={
              metrics?.co2_avoided_vs_unmanaged_kg != null
                ? FMT(Math.abs(metrics.co2_avoided_vs_unmanaged_kg), 1)
                : '—'
            }
            unit={
              metrics?.co2_avoided_vs_unmanaged_kg != null && metrics.co2_avoided_vs_unmanaged_kg < 0
                ? 'kg/day more than unmanaged'
                : 'kg/day vs unmanaged'
            }
            icon={Leaf}
            color={
              metrics?.co2_avoided_vs_unmanaged_kg != null && metrics.co2_avoided_vs_unmanaged_kg < 0
                ? '#F4B860'
                : '#43D9A3'
            }
            loading={loading && !simResult}
            comparison="Illustrative — based on carbon intensity model"
          />
          <KPICard
            label="Overloaded Slots"
            value={metrics ? metrics.overloaded_transformer_slots : '—'}
            unit="/ 48 half-hour slots"
            icon={AlertTriangle}
            color={metrics?.overloaded_transformer_slots > 0 ? '#F16C75' : '#43D9A3'}
            loading={loading && !simResult}
            comparison={metrics?.overloaded_transformer_slots === 0 ? 'No transformer violations' : undefined}
          />
          {loadSheddingActive ? (
            <>
              <KPICard
                label="Comfort Violations"
                value={metrics ? metrics.comfort_violations : '—'}
                unit="appliances shed"
                icon={AlertTriangle}
                color={metrics?.comfort_violations > 0 ? '#F4B860' : '#43D9A3'}
                loading={loading && !simResult}
                comparison="Appliances rejected to protect grid"
              />
              <KPICard
                label="Unmet Energy"
                value={
                  metrics?.total_energy_kwh != null && unmanagedMetrics?.total_energy_kwh != null
                    ? FMT(unmanagedMetrics.total_energy_kwh - metrics.total_energy_kwh, 1)
                    : '—'
                }
                unit="kWh vs unmanaged"
                icon={TrendingDown}
                color={
                  metrics && unmanagedMetrics && (unmanagedMetrics.total_energy_kwh - metrics.total_energy_kwh) > 0.5
                    ? '#F16C75'
                    : '#43D9A3'
                }
                loading={loading && !simResult}
                comparison="Demand not met due to capacity shedding"
              />
            </>
          ) : (
            <KPICard
              label="Infeasible Appliances"
              value={metrics?.infeasible_appliances != null ? metrics.infeasible_appliances : '—'}
              unit="fallback placements"
              icon={AlertTriangle}
              color={metrics?.infeasible_appliances > 0 ? '#F4B860' : '#43D9A3'}
              loading={loading && !simResult}
              comparison={metrics?.infeasible_appliances > 0
                ? 'Placed at best available slot despite overload'
                : 'All appliances placed within capacity'}
            />
          )}
        </div>
      )}



      {/* ── E. Main analytics: chart + transformer health ─────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Demand chart — most prominent */}
        <div
          className="xl:col-span-2 rounded-xl p-4"
          style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.14)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#EDF4F7]">
                Neighbourhood Demand Curve
              </h2>
              <p className="text-[0.65rem] text-[#94A3B8] mt-0.5">
                All three strategies — same synthetic population, seed {simResult?.scenario?.seed ?? 42}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[0.62rem] text-[#94A3B8]">
              <Info size={10} />
              <span>Illustrative</span>
            </div>
          </div>

          <LoadCurveChart
            unmanagedDemand={simResult?.unmanaged_demand}
            independentDemand={simResult?.independent_demand}
            coordinatedDemand={simResult?.coordinated_demand}
            transformerCapacityKw={
              simResult
                ? simResult.scenario.n_transformers > 0
                  ? simResult.scenario.transformer_capacity_kw
                  : undefined
                : undefined
            }
            loading={loading && !simResult}
          />

          {/* Rebound peak callout — only when data present */}
          {simResult && indepMetrics && (
            <div
              className="mt-3 px-3 py-2 rounded-lg text-[0.65rem] flex items-start gap-2"
              style={{ background: 'rgba(244,184,96,0.05)', border: '1px solid rgba(244,184,96,0.12)' }}
            >
              <AlertTriangle size={11} color="#F4B860" className="flex-shrink-0 mt-0.5" />
              <span className="text-[#94A3B8]">
                <span className="font-semibold text-[#F4B860]">Rebound peak:</span> Independent optimization
                peaks at {FMT(indepMetrics.peak_demand_kw)} kW because homes simultaneously shift to cheapest slots.
                FlockShield reduces PAR from {FMT(indepMetrics.peak_to_avg_ratio, 2)} to {FMT(coordMetrics?.peak_to_avg_ratio, 2)}.
              </span>
            </div>
          )}
        </div>

        {/* Transformer health */}
        <div className="space-y-4">
          <div
            className="rounded-xl p-4"
            style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.14)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#EDF4F7]">Transformer Health</h3>
                <p className="text-[0.65rem] text-[#94A3B8] capitalize">{activeStrategy} strategy</p>
              </div>
            </div>
            <TransformerMap
              transformerSummary={simResult?.transformer_summary}
              strategy={activeStrategy}
              loading={loading && !simResult}
            />
          </div>

          {/* Scenario controls */}
          <ScenarioControls onRun={runSimulation} loading={loading} />
        </div>
      </div>

      {/* ── F. FlockShield decision log ───────────────────────────── */}
      <div
        className="rounded-xl p-4"
        style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.14)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-[#EDF4F7]">FlockShield Decision Log</h2>
          <span
            className="text-[0.58rem] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(67,217,163,0.08)', color: '#43D9A3', border: '1px solid rgba(67,217,163,0.18)' }}
          >
            COORDINATION ENGINE
          </span>
        </div>
        <DecisionLog decisions={simResult?.decisions} loading={loading && !simResult} />
      </div>

      {/* ── G. Simulation disclaimer ──────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3 text-[0.65rem] text-[#94A3B8] flex items-start gap-2"
        style={{ background: 'rgba(148,163,184,0.03)', border: '1px solid rgba(148,163,184,0.09)' }}
      >
        <Info size={11} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong className="text-[#EDF4F7]">Disclaimer:</strong> All results are synthetic simulations.
          Tariffs are illustrative (not real DISCOM tariffs). Carbon estimates use the CEA CO₂ Baseline Database as
          an approximation. FlockShield demonstrates capacity-constrained scheduling, not certified grid protection.
          Shifting load does not reduce total energy consumed — savings arise from tariff band changes only.
        </p>
      </div>
    </div>
  )
}
