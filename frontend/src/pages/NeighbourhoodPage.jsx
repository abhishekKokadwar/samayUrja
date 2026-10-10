/**
 * NeighbourhoodPage: the main Murmuration view.
 *
 * Layout, top to bottom:
 *  A. Header: title, status, SYNTHETIC DATA label
 *  B. Scenario presets
 *  C. Verdict: the result in one sentence
 *  D. Comparison: the three strategies side by side
 *  E. Demand curve and transformer load
 *  F. Advanced controls (collapsed)
 *  G. FlockShield decision log
 *  H. Simulation disclaimer
 */
import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Info, RefreshCw } from 'lucide-react'
import { LoadCurveChart } from '../components/neighbourhood/LoadCurveChart.jsx'
import { TransformerBars } from '../components/neighbourhood/TransformerBars.jsx'
import { ComparisonTable } from '../components/neighbourhood/ComparisonTable.jsx'
import {
  ScenarioControls, DEFAULT_SCENARIO, PRESETS, presetParams, activePresetId,
} from '../components/neighbourhood/ScenarioControls.jsx'
import { DecisionLog } from '../components/neighbourhood/DecisionLog.jsx'
import { api } from '../api.js'

const FMT = (v, d = 1) => v == null ? '—' : Number(v).toFixed(d)

// Wait this long after the last change before rerunning the simulation.
const RERUN_DELAY_MS = 400

// One-sentence reading of the result, shown above everything else.
function buildVerdict(sim) {
  const a = sim.unmanaged_metrics
  const b = sim.independent_metrics
  const c = sim.coordinated_metrics
  const n = sim.scenario.n_transformers
  const savingPct = m =>
    a.total_cost_inr_per_day > 0 ? (1 - m.total_cost_inr_per_day / a.total_cost_inr_per_day) * 100 : 0
  const saveB = savingPct(b)
  const saveC = savingPct(c)
  const saving =
    Math.abs(saveB - saveC) < 0.5
      ? saveC >= 0.5
        ? `Same ${saveC.toFixed(0)}% saving on the bill.`
        : 'Same bill.'
      : `Bill saving: ${saveC.toFixed(0)}% coordinated, ${saveB.toFixed(0)}% alone.`
  const today = `Unmanaged today: ${a.overloaded_transformers} of ${n} overloaded.`

  if (c.overloaded_transformers > 0) {
    return {
      warn: true,
      headline: `Even coordinated, ${c.overloaded_transformers} of ${n} transformers overload.`,
      detail: `Optimizing alone overloads ${b.overloaded_transformers} of ${n}. This neighbourhood needs more capacity. ${saving}`,
    }
  }
  if (b.overloaded_transformers > 0) {
    return {
      warn: false,
      headline: `Optimizing alone overloads ${b.overloaded_transformers} of ${n} transformers. FlockShield: 0.`,
      detail: `${saving} ${today}`,
    }
  }
  const cut = b.peak_demand_kw > 0 ? (1 - c.peak_demand_kw / b.peak_demand_kw) * 100 : 0
  return {
    warn: false,
    headline: 'No transformer overloads in this scenario.',
    detail: `FlockShield still lowers the peak by ${cut.toFixed(0)}% compared with optimizing alone. ${saving} ${today}`,
  }
}

export default function NeighbourhoodPage() {
  const [params, setParams] = useState(DEFAULT_SCENARIO)
  const [simResult, setSimResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const latestRequest = useRef(0)

  // Rerun whenever the scenario changes, after a short pause so dragging a
  // slider does not fire a request per pixel. Only the newest reply is kept.
  useEffect(() => {
    const requestId = ++latestRequest.current
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await api.simulate(params)
        if (requestId === latestRequest.current) setSimResult(result)
      } catch (err) {
        if (requestId === latestRequest.current) {
          setError(err.message || 'Simulation failed. Is the backend running?')
        }
      } finally {
        if (requestId === latestRequest.current) setLoading(false)
      }
    }, simResult ? RERUN_DELAY_MS : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, retry])

  const coordMetrics = simResult?.coordinated_metrics
  const indepMetrics = simResult?.independent_metrics
  const unmanagedMetrics = simResult?.unmanaged_metrics
  const activePreset = activePresetId(params)
  const stale = loading && simResult ? 0.6 : 1

  // Status indicator
  const status = loading ? 'simulating' : error ? 'error' : simResult ? 'ready' : 'idle'

  return (
    <div className="p-4 lg:p-6 space-y-5">

      {/* ── A. Compact header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-[#FFFFFF] tracking-tight">
            Neighbourhood Intelligence
          </h1>
          {/* Live status pill */}
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5"
            style={{
              background: status === 'simulating' ? 'rgba(244,184,96,0.1)'
                : status === 'error' ? 'rgba(241,108,117,0.1)'
                : status === 'ready' ? 'rgba(255,255,255,0.08)'
                : 'rgba(255,255,255,0.08)',
              color: status === 'simulating' ? '#F4B860'
                : status === 'error' ? '#F16C75'
                : status === 'ready' ? '#FFFFFF'
                : '#A3A3A3',
              border: `1px solid ${
                status === 'simulating' ? 'rgba(244,184,96,0.2)'
                : status === 'error' ? 'rgba(241,108,117,0.2)'
                : status === 'ready' ? 'rgba(255,255,255,0.15)'
                : 'rgba(255,255,255,0.12)'
              }`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: status === 'simulating' ? '#F4B860'
                  : status === 'error' ? '#F16C75'
                  : status === 'ready' ? '#FFFFFF'
                  : '#A3A3A3',
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
            <span className="text-xs text-[#A3A3A3] tabular-nums">
              {simResult.scenario.n_homes} homes · {FMT(simResult.elapsed_ms, 0)} ms
            </span>
          )}
          <span
            className="text-xs px-2 py-1 rounded-lg font-semibold"
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
          <div className="min-w-0 flex-1">
            <p className="text-[#F16C75] font-medium text-sm">Simulation error</p>
            <p className="text-[#A3A3A3] text-xs mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => setRetry(r => r + 1)}
            className="btn-icon flex-shrink-0"
            aria-label="Retry simulation"
            title="Retry"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      {/* ── B. Scenario presets ──────────────────────────────────── */}
      <div>
        <p className="text-xs text-[#A3A3A3] mb-2">Pick a scenario. Results update automatically.</p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {PRESETS.map(p => {
            const active = activePreset === p.id
            return (
              <button
                key={p.id}
                onClick={() => setParams(presetParams(p))}
                aria-pressed={active}
                className="px-3 py-2 rounded-lg text-left transition-colors"
                style={{
                  background: active ? '#FFFFFF' : '#0A0A0A',
                  color: active ? '#000000' : '#FFFFFF',
                  border: `1px solid ${active ? '#FFFFFF' : '#1A1A1A'}`,
                }}
              >
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-xs" style={{ color: active ? '#525252' : '#A3A3A3' }}>{p.hint}</span>
              </button>
            )
          })}
          {!activePreset && (
            <span className="self-center text-xs text-[#A3A3A3] px-2">Custom scenario</span>
          )}
        </div>
      </div>

      {/* ── C. Verdict: the result in one sentence ───────────────── */}
      {simResult && (() => {
        const v = buildVerdict(simResult)
        return (
          <div
            className="rounded-xl px-5 py-4"
            style={{
              background: '#0A0A0A',
              border: '1px solid #1A1A1A',
              borderLeft: `3px solid ${v.warn ? '#F4B860' : '#FFFFFF'}`,
              opacity: stale,
            }}
          >
            <p className="text-lg md:text-2xl font-semibold text-[#FFFFFF] leading-snug">{v.headline}</p>
            <p className="mt-1 text-sm text-[#A3A3A3]">{v.detail}</p>
          </div>
        )
      })()}

      {/* ── D. The three strategies side by side ─────────────────── */}
      <div style={{ opacity: stale }}>
        <ComparisonTable sim={simResult} />
      </div>

      {/* ── E. Demand curve + transformer load ───────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4" style={{ opacity: stale }}>

        <div
          className="xl:col-span-2 rounded-xl p-4 min-w-0"
          style={{ background: '#0A0A0A', border: '1px solid #1A1A1A' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#FFFFFF]">Demand through the day</h2>
              <p className="text-xs text-[#A3A3A3] mt-0.5">
                All {simResult?.scenario?.n_homes ?? ''} homes added together. Shaded bands mark the cheapest and the peak-price hours.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-xs text-[#A3A3A3]">
              <Info size={12} />
              <span>Illustrative</span>
            </div>
          </div>

          <LoadCurveChart
            unmanagedDemand={simResult?.unmanaged_demand}
            independentDemand={simResult?.independent_demand}
            coordinatedDemand={simResult?.coordinated_demand}
            priceSlots={simResult?.tariff?.price_slots}
            transformerCapacityKw={
              simResult ? simResult.scenario.n_transformers * simResult.scenario.transformer_capacity_kw : undefined
            }
            loading={loading && !simResult}
          />

          {simResult && indepMetrics && (
            <div
              className="mt-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
              style={{ background: 'rgba(244,184,96,0.05)', border: '1px solid rgba(244,184,96,0.12)' }}
            >
              <AlertTriangle size={13} color="#F4B860" className="flex-shrink-0 mt-0.5" />
              <span className="text-[#A3A3A3]">
                {indepMetrics.peak_demand_kw > (unmanagedMetrics?.peak_demand_kw ?? Infinity) ? (
                  <>
                    <span className="font-semibold text-[#F4B860]">Rebound peak:</span> when each home optimizes alone,
                    demand peaks at {FMT(indepMetrics.peak_demand_kw, 0)} kW, above the {FMT(unmanagedMetrics.peak_demand_kw, 0)} kW seen today,
                    because every home moves to the same cheap hours.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-[#F4B860]">No rebound in this scenario:</span> when each home optimizes alone,
                    demand peaks at {FMT(indepMetrics.peak_demand_kw, 0)} kW, below the {FMT(unmanagedMetrics?.peak_demand_kw, 0)} kW seen today,
                    but load still bunches into the cheapest hours.
                  </>
                )}{' '}
                FlockShield peaks at {FMT(coordMetrics?.peak_demand_kw, 0)} kW.
              </span>
            </div>
          )}
        </div>

        <div
          className="rounded-xl p-4 min-w-0"
          style={{ background: '#0A0A0A', border: '1px solid #1A1A1A' }}
        >
          <h3 className="text-base font-semibold text-[#FFFFFF]">Transformer load</h3>
          <p className="text-xs text-[#A3A3A3] mb-3">The busiest moment of each transformer, as a share of its capacity.</p>
          <TransformerBars transformerSummary={simResult?.transformer_summary} />
        </div>
      </div>

      {/* ── F. Advanced controls ─────────────────────────────────── */}
      <ScenarioControls params={params} onChange={setParams} />

      {/* ── G. FlockShield decision log ──────────────────────────── */}
      <div
        className="rounded-xl p-4"
        style={{ background: '#0A0A0A', border: '1px solid #1A1A1A' }}
      >
        <h2 className="text-base font-semibold text-[#FFFFFF] mb-2">What FlockShield decided, and why</h2>
        <DecisionLog
          decisions={simResult?.decisions}
          summary={simResult?.decision_summary}
          loading={loading && !simResult}
        />
      </div>

      {/* ── H. Simulation disclaimer ──────────────────────────────── */}
      <div
        className="rounded-xl px-4 py-3 text-xs text-[#A3A3A3] flex items-start gap-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}
      >
        <Info size={11} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong className="text-[#FFFFFF]">Disclaimer:</strong> All results are synthetic simulations.
          Tariffs are illustrative (not real DISCOM tariffs). Carbon estimates use the CEA CO₂ Baseline Database as
          an approximation. FlockShield demonstrates capacity-constrained scheduling, not certified grid protection.
          Shifting load does not reduce total energy consumed — savings arise from tariff band changes only.
        </p>
      </div>
    </div>
  )
}
