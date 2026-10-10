/**
 * NeighbourhoodPage — the flagship Murmuration view.
 *
 * Layout:
 *  1. Page header (title, status, scenario controls)
 *  2. KPI row (6 metric cards)
 *  3. Load curve chart (left) + Transformer status (right)
 *  4. Decision log (left) + Transformer map (right)
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

  // Auto-run on mount — immediately show results without user interaction (SRS §7)
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

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#EDF4F7] tracking-tight">
            Neighbourhood Intelligence
          </h1>
          <p className="text-sm text-[#94A3B8] mt-0.5">
            Coordinate flexible demand. Prevent rebound peaks. Protect local grid capacity.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
              <span className="w-2 h-2 rounded-full bg-[#F4B860] animate-pulse-soft" />
              Simulating…
            </div>
          )}
          {!loading && simResult && (
            <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
              <span className="w-2 h-2 rounded-full bg-[#43D9A3]" />
              {simResult.scenario.n_homes} homes · {FMT(simResult.elapsed_ms, 0)} ms
            </div>
          )}
          <span
            className="text-[0.65rem] px-2 py-1 rounded-lg font-semibold"
            style={{ background: 'rgba(244,184,96,0.1)', color: '#F4B860', border: '1px solid rgba(244,184,96,0.2)' }}
          >
            SYNTHETIC DATA
          </span>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-start gap-3 p-3 rounded-xl text-sm"
          style={{ background: 'rgba(241,108,117,0.08)', border: '1px solid rgba(241,108,117,0.2)' }}
        >
          <AlertTriangle size={16} color="#F16C75" className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#F16C75] font-medium">Simulation error</p>
            <p className="text-[#94A3B8] text-xs mt-0.5">{error}</p>
            <p className="text-[#94A3B8] text-xs mt-1">
              Make sure the backend is running: <code className="text-[#58BFE8]">cd backend && uvicorn app:app --reload</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Strategy selector ────────────────────────────────────── */}
      {simResult && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-[#94A3B8] self-center mr-1 font-medium">View strategy:</span>
          {STRATEGY_OPTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveStrategy(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeStrategy === s.id ? 'ring-1' : 'opacity-60 hover:opacity-80'
              }`}
              style={{
                background: activeStrategy === s.id ? `${s.color}18` : 'rgba(148,163,184,0.06)',
                color: activeStrategy === s.id ? s.color : '#94A3B8',
                border: `1px solid ${activeStrategy === s.id ? s.color + '30' : 'rgba(148,163,184,0.12)'}`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard
          label="Peak Demand"
          value={metrics ? FMT(metrics.peak_demand_kw) : '—'}
          unit="kW"
          icon={Zap}
          color="#58BFE8"
          loading={loading && !simResult}
          comparison={
            coordMetrics && indepMetrics && activeStrategy !== 'unmanaged'
              ? `${FMT(indepMetrics.peak_demand_kw - (metrics?.peak_demand_kw || 0))} kW vs independent`
              : null
          }
        />
        <KPICard
          label="Peak-to-Avg Ratio"
          value={metrics ? FMT(metrics.peak_to_avg_ratio, 2) : '—'}
          unit="×"
          icon={BarChart2}
          color="#58BFE8"
          loading={loading && !simResult}
          comparison={
            coordMetrics && activeStrategy === 'coordinated'
              ? `Lower is better — FlockShield spreads load`
              : null
          }
        />
        <KPICard
          label="Max Transformer Load"
          value={metrics ? FMT(metrics.max_transformer_utilization_pct) : '—'}
          unit="%"
          icon={Zap}
          color={
            metrics
              ? metrics.max_transformer_utilization_pct > 90
                ? '#F16C75'
                : metrics.max_transformer_utilization_pct > 70
                  ? '#F4B860'
                  : '#43D9A3'
              : '#94A3B8'
          }
          loading={loading && !simResult}
          comparison={metrics ? `${metrics.overloaded_transformer_slots} overloaded slots` : null}
        />
        <KPICard
          label="Est. Daily Savings"
          value={
            metrics?.savings_vs_unmanaged_inr != null
              ? `₹${INR(Math.abs(metrics.savings_vs_unmanaged_inr))}`
              : '—'
          }
          unit="/day vs unmanaged"
          icon={PiggyBank}
          color="#43D9A3"
          loading={loading && !simResult}
        />
        <KPICard
          label="Est. CO₂ Avoided"
          value={
            metrics?.co2_avoided_vs_unmanaged_kg != null
              ? FMT(Math.abs(metrics.co2_avoided_vs_unmanaged_kg), 1)
              : '—'
          }
          unit="kg/day vs unmanaged"
          icon={Leaf}
          color="#43D9A3"
          loading={loading && !simResult}
          comparison="Based on illustrative carbon intensity model"
        />
        <KPICard
          label="Overloaded Slots"
          value={metrics ? metrics.overloaded_transformer_slots : '—'}
          unit="/ 48"
          icon={AlertTriangle}
          color={
            metrics?.overloaded_transformer_slots > 0 ? '#F16C75' : '#43D9A3'
          }
          loading={loading && !simResult}
          comparison={metrics?.overloaded_transformer_slots === 0 ? 'No transformer violations' : undefined}
        />
      </div>

      {/* ── Main grid: Chart + Controls ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Load curve chart */}
        <div
          className="xl:col-span-2 rounded-xl p-4"
          style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.14)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#EDF4F7]">
                Neighbourhood Demand Curve
              </h2>
              <p className="text-[0.68rem] text-[#94A3B8] mt-0.5">
                All three strategies — same synthetic population
              </p>
            </div>
            <div className="flex items-center gap-1 text-[0.65rem] text-[#94A3B8]">
              <Info size={11} />
              <span>Illustrative data</span>
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

          {/* Rebound peak explanation */}
          {simResult && indepMetrics && (
            <div
              className="mt-3 px-3 py-2 rounded-lg text-[0.68rem] flex items-start gap-2"
              style={{ background: 'rgba(244,184,96,0.06)', border: '1px solid rgba(244,184,96,0.12)' }}
            >
              <AlertTriangle size={12} color="#F4B860" className="flex-shrink-0 mt-0.5" />
              <span className="text-[#94A3B8]">
                <span className="font-semibold text-[#F4B860]">Rebound peak:</span> Independent
                optimization peaks at {FMT(indepMetrics.peak_demand_kw)} kW because homes
                simultaneously shift to the cheapest slots. FlockShield coordinates across
                all homes to spread this load (PAR: {FMT(indepMetrics.peak_to_avg_ratio, 2)} → {FMT(coordMetrics?.peak_to_avg_ratio, 2)}).
              </span>
            </div>
          )}
        </div>

        {/* Scenario controls + transformer health */}
        <div className="space-y-4">
          <ScenarioControls onRun={runSimulation} loading={loading} />

          {/* Transformer summary */}
          {simResult && (
            <div
              className="rounded-xl p-4"
              style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.14)' }}
            >
              <h3 className="text-sm font-semibold text-[#EDF4F7] mb-1">Transformer Health</h3>
              <p className="text-[0.68rem] text-[#94A3B8] mb-3">
                Showing {activeStrategy} strategy
              </p>
              <TransformerMap
                transformerSummary={simResult?.transformer_summary}
                strategy={activeStrategy}
                loading={loading && !simResult}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Decision log ─────────────────────────────────────────── */}
      <div
        className="rounded-xl p-4"
        style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.14)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-[#EDF4F7]">FlockShield Decision Log</h2>
          <span
            className="text-[0.6rem] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(67,217,163,0.1)', color: '#43D9A3', border: '1px solid rgba(67,217,163,0.2)' }}
          >
            COORDINATION ENGINE
          </span>
        </div>
        <p className="text-[0.68rem] text-[#94A3B8] mb-4">
          Each entry is a real scheduling decision from the backend. Showing up to 100 decisions.
        </p>
        <DecisionLog decisions={simResult?.decisions} loading={loading && !simResult} />
      </div>

      {/* ── Footer disclaimer ────────────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3 text-[0.68rem] text-[#94A3B8] flex items-start gap-2"
        style={{ background: 'rgba(148,163,184,0.04)', border: '1px solid rgba(148,163,184,0.1)' }}
      >
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong className="text-[#EDF4F7]">Simulation disclaimer:</strong> All data is synthetic.
          Tariffs are illustrative and modelled on India's ToD rules. Carbon intensities are
          approximations based on the CEA CO₂ Baseline Database. FlockShield demonstrates
          capacity-constrained scheduling, not certified grid protection. Shifting load does
          not reduce total energy consumed — savings come from tariff band changes only.
        </p>
      </div>
    </div>
  )
}
