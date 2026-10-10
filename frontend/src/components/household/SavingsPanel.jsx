/**
 * SavingsPanel — Household optimizer analytics.
 *
 * Sections:
 *  A. KPI row          — monthly cost before/after, savings (signed), total energy, runs moved
 *  B. Load profile     — 24-hour demand chart (before vs after), 30-min resolution
 *  C. Schedule heatmap — appliance × time-slot matrix with tariff band overlay
 *  D. Cost breakdown   — horizontal bars: per-run cost before vs after, with delta
 *  E. Tariff + schedule overlay — price line + appliance start markers
 *  F. Optimization log — compact table of all runs, filterable, show more/less
 *
 * ── Source fields & formulas ──────────────────────────────────────────────────
 *  All data comes from POST /optimize → OptimizeResponse:
 *    runs[i].name                  string
 *    runs[i].current_start         "HH:MM" — original start time
 *    runs[i].new_start             "HH:MM" — optimizer-selected start time
 *    runs[i].days                  int[]   — day indices (0=Mon) this run is active
 *    runs[i].power_kw              float   — appliance rated power
 *    runs[i].duration_slots        int     — duration in 30-min slots
 *    runs[i].energy_kwh_per_run    float   — power_kw × duration_slots × 0.5 h (from backend)
 *    runs[i].cost_before_inr       float   — Σ price[s]×power×0.5 for original slots (per run)
 *    runs[i].cost_after_inr        float   — Σ price[s]×power×0.5 for optimized slots (per run)
 *    runs[i].co2_before_kg         float   — Σ carbon[s]×power×0.5 for original slots (per run)
 *    runs[i].co2_after_kg          float   — Σ carbon[s]×power×0.5 for optimized slots (per run)
 *    runs[i].monthly_saving_inr    float   — (cost_before−cost_after)×days×(52/12)
 *    runs[i].monthly_saving_kg     float   — (co2_before−co2_after)×days×(52/12)
 *    runs[i].note                  string? — optional optimizer note
 *
 *    monthly.cost_before_inr       float   — Σ all runs × monthly_factor
 *    monthly.cost_after_inr        float   — Σ all runs × monthly_factor
 *    monthly.co2_before_kg         float
 *    monthly.co2_after_kg          float
 *
 *  Demand profile derivation:
 *    demand_before[slot] = Σ runs: power_kw if slot ∈ [orig_start_slot, orig_start_slot + duration_slots)
 *    demand_after[slot]  = Σ runs: power_kw if slot ∈ [new_start_slot,  new_start_slot  + duration_slots)
 *    Resolution: 30 minutes. Wraps modulo 48.
 *    This is a representative profile for a day when all scheduled appliances run.
 *
 *  Per-run cost breakdown: uses cost_before_inr and cost_after_inr directly from the backend.
 *
 *  Tariff band classification from tariff.price_slots[48]:
 *    peak  = price >= maxPrice × 0.95
 *    solar = price <= minPrice × 1.05
 *    normal = otherwise
 *
 * No meter readings, historical trends, or fabricated values are used.
 */
import { useState, useMemo } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, ReferenceLine, Area,
} from 'recharts'
import {
  ArrowRight, TrendingDown, Info, ChevronDown, ChevronUp,
  CheckCircle, Clock, Filter, AlertTriangle
} from 'lucide-react'

// ── Formatters ────────────────────────────────────────────────────────────────

const INR  = v => v < 0 
  ? `-₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(v))}`
  : `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)}`
const FMT  = (v, d = 1) => Number(v).toFixed(d)
const PCT  = v => `${v > 0 ? '+' : ''}${FMT(v, 1)}%`

// ── Slot helpers ──────────────────────────────────────────────────────────────

function slotToTime(s) {
  const h = Math.floor(s / 2)
  const m = (s % 2) * 30
  return `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`
}

function timeToSlot(t) {
  if (!t) return 0
  const [hStr, mStr] = t.split(':')
  return parseInt(hStr) * 2 + (parseInt(mStr) >= 30 ? 1 : 0)
}

/**
 * Build a 48-slot kW demand array.
 * Formula: demand[slot] += run.power_kw for every slot in the run's interval.
 * Source: runs[].power_kw, runs[].duration_slots, runs[].current_start or new_start
 */
function buildDemandProfile(runs, useNewStart) {
  const demand = new Array(48).fill(0)
  for (const run of runs) {
    const startSlot = timeToSlot(useNewStart ? run.new_start : run.current_start)
    for (let i = 0; i < run.duration_slots; i++) {
      demand[(startSlot + i) % 48] += run.power_kw
    }
  }
  return demand.map(v => Math.round(v * 100) / 100)
}

/** Classify a slot's tariff band from price_slots array. */
function bandClass(slot, priceSlots) {
  if (!priceSlots?.length) return 'normal'
  const p = priceSlots[slot]
  const maxP = Math.max(...priceSlots)
  const minP = Math.min(...priceSlots)
  if (p >= maxP * 0.95) return 'peak'
  if (p <= minP * 1.05) return 'cheap'
  return 'normal'
}

const BAND_COLORS = {
  peak:   'rgba(241,108,117,0.14)',
  cheap:  'rgba(255,255,255,0.10)',
  normal: 'transparent',
}

const APP_PALETTE = ['#FFFFFF', '#FFFFFF', '#F4B860', '#A3A3A3', '#F16C75', '#A3A3A3', '#A3A3A3']

// ── Shared tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return (
    <div className="p-2.5 rounded-lg text-xs shadow-xl"
      style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.18)', minWidth: 150 }}>
      <p className="text-[#FFFFFF] font-semibold mb-1.5 tabular-nums">{label}</p>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey || p.name} className="flex justify-between gap-4 mb-0.5">
          <span className="text-[#A3A3A3]">{p.name}</span>
          <span className="tabular-nums font-medium" style={{ color: p.color || p.fill }}>
            {fmt ? fmt(p.value, p.dataKey) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, sub, children, action }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.12)' }}>
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <p className="text-[0.78rem] font-semibold text-[#FFFFFF]">{title}</p>
          {sub && <p className="text-xs text-[#A3A3A3] mt-0.5 leading-snug">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── A. KPI row ────────────────────────────────────────────────────────────────

function KPIRow({ monthly, runs }) {
  // Sources: monthly.cost_before_inr, monthly.cost_after_inr, monthly.co2_before_kg, monthly.co2_after_kg
  const saving    = monthly.cost_before_inr - monthly.cost_after_inr
  const co2Saved  = monthly.co2_before_kg - monthly.co2_after_kg
  const savingPct = monthly.cost_before_inr > 0 ? (saving / monthly.cost_before_inr) * 100 : 0
  // Source: runs[].energy_kwh_per_run (sum over all runs = total energy per complete cycle)
  const totalEnergy = runs.reduce((s, r) => s + r.energy_kwh_per_run, 0)
  const shifted   = runs.filter(r => r.new_start !== r.current_start).length

  const tiles = [
    {
      id: 'before', label: 'Baseline cost',
      value: INR(monthly.cost_before_inr), sub: 'est. monthly · before opt.',
      color: '#A3A3A3',
    },
    {
      id: 'after', label: 'Optimized cost',
      value: INR(monthly.cost_after_inr), sub: 'est. monthly · after opt.',
      color: '#FFFFFF',
    },
    {
      id: 'saving', label: saving >= 0 ? 'Est. savings' : 'Extra cost',
      value: saving > 0 ? `+${INR(saving)}` : INR(saving),
      sub: `${PCT(savingPct)} vs baseline`,
      color: saving >= 0 ? '#FFFFFF' : '#F16C75',
    },
    {
      id: 'energy', label: 'Total energy / cycle',
      value: `${FMT(totalEnergy, 2)} kWh`,
      sub: 'all runs added together',
      color: '#FFFFFF',
    },
    {
      id: 'co2', label: co2Saved >= 0 ? 'CO₂ avoided' : 'CO₂ increase',
      value: `${FMT(Math.abs(co2Saved), 1)} kg`,
      sub: 'est. monthly · illustrative',
      color: co2Saved >= 0 ? '#FFFFFF' : '#F4B860',
    },
    {
      id: 'moved', label: 'Runs moved',
      value: `${shifted} / ${runs.length}`,
      sub: 'to lower-tariff slots',
      color: shifted > 0 ? '#FFFFFF' : '#A3A3A3',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
      {tiles.map(t => (
        <div key={t.id} className="rounded-xl p-3"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p className="text-xs text-[#A3A3A3] uppercase tracking-wider font-semibold mb-1.5 leading-tight">
            {t.label}
          </p>
          <p className="text-[1.05rem] font-bold tabular-nums leading-none" style={{ color: t.color }}>
            {t.value}
          </p>
          <p className="text-xs text-[#525252] mt-1 leading-tight">{t.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── B. 24-hour load profile ───────────────────────────────────────────────────
//
// Formula: demand_before[s] = Σ power_kw for runs whose original interval covers slot s
//          demand_after[s]  = Σ power_kw for runs whose optimized interval covers slot s
// Source: runs[].power_kw, duration_slots, current_start, new_start
// Resolution: 30-minute slots (48 per day)
// Caveat: representative single-day profile — not a weekly average

function LoadProfileChart({ runs, tariff }) {
  const { chartData, peakBefore, peakAfter } = useMemo(() => {
    const before = buildDemandProfile(runs, false)
    const after  = buildDemandProfile(runs, true)
    const priceSlots = tariff?.price_slots || []
    const data = Array.from({ length: 48 }, (_, s) => ({
      time:    slotToTime(s),
      before:  before[s],
      after:   after[s],
      band:    bandClass(s, priceSlots),
    }))
    return {
      chartData:  data,
      peakBefore: Math.max(...before),
      peakAfter:  Math.max(...after),
    }
  }, [runs, tariff])

  const xTicks  = chartData.filter((_, i) => i % 4 === 0).map(d => d.time)
  const maxVal  = Math.max(peakBefore, peakAfter, 0.5)

  // Build tariff background reference areas as an array of {start, end, band}
  const bandAreas = useMemo(() => {
    if (!tariff?.price_slots?.length) return []
    const areas = []
    let cur = { band: chartData[0]?.band, start: chartData[0]?.time }
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].band !== cur.band) {
        areas.push({ ...cur, end: chartData[i].time })
        cur = { band: chartData[i].band, start: chartData[i].time }
      }
    }
    areas.push({ ...cur, end: '24:00' })
    return areas.filter(a => a.band !== 'normal')
  }, [chartData, tariff])

  const peakReduced = peakBefore > 0 && peakAfter < peakBefore

  return (
    <Section
      title="24-Hour Load Profile"
      action={
        peakReduced && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>
            Peak ↓ {FMT(peakBefore - peakAfter, 2)} kW
          </span>
        )
      }
    >
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3">
        {[['Before', 'rgba(241,108,117,0.75)'], ['After', '#FFFFFF']].map(([l, c]) => (
          <div key={l} className="flex items-center gap-2">
            <span className="w-6 h-0.5 rounded inline-block" style={{ background: c }} />
            <span className="text-xs text-[#A3A3A3]">{l}</span>
          </div>
        ))}
        {tariff?.price_slots?.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-4 h-3 rounded-sm inline-block" style={{ background: 'rgba(241,108,117,0.25)' }} />
              <span className="text-xs text-[#A3A3A3]">Peak tariff</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-3 rounded-sm inline-block" style={{ background: 'rgba(255,255,255,0.18)' }} />
              <span className="text-xs text-[#A3A3A3]">Cheap tariff</span>
            </div>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis dataKey="time" ticks={xTicks} tick={{ fill: '#A3A3A3', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
          <YAxis tick={{ fill: '#A3A3A3', fontSize: 12 }} axisLine={false} tickLine={false}
            unit=" kW" domain={[0, Math.ceil(maxVal * 1.2) || 2]} width={44} />
          <Tooltip content={<ChartTooltip fmt={v => `${FMT(v, 2)} kW`} />} />

          {/* Tariff background bands */}
          {bandAreas.map((a, i) => (
            <ReferenceLine key={i} x={a.start}
              stroke={a.band === 'peak' ? 'rgba(241,108,117,0.3)' : 'rgba(255,255,255,0.25)'}
              strokeWidth={0}
              label={false}
            />
          ))}

          {/* Peak baseline reference */}
          <ReferenceLine y={peakBefore} stroke="rgba(241,108,117,0.3)" strokeDasharray="4 2"
            label={{ value: `Baseline peak ${FMT(peakBefore, 1)} kW`, position: 'insideTopRight', fill: 'rgba(241,108,117,0.6)', fontSize: 12 }} />

          <Area type="monotone" dataKey="before" name="Before" fill="rgba(241,108,117,0.08)"
            stroke="rgba(241,108,117,0.75)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
          <Area type="monotone" dataKey="after" name="After" fill="rgba(255,255,255,0.08)"
            stroke="#FFFFFF" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </Section>
  )
}

// ── C. Schedule heatmap ───────────────────────────────────────────────────────
//
// Rows: appliances  Columns: 48 half-hour slots
// A cell is filled if the appliance occupies that slot in the optimized schedule
// Source: runs[].new_start → timeToSlot, runs[].duration_slots
// Tariff band background: tariff.price_slots[slot]

function ScheduleHeatmap({ runs, tariff }) {
  const priceSlots = tariff?.price_slots || []
  const CELL = 14  // px per slot column width
  const ROW  = 22  // px per appliance row

  // Map appliance → occupied slots after optimization
  const scheduleMap = useMemo(() => {
    return runs.map(run => {
      const startSlot = timeToSlot(run.new_start)
      const slots = new Set()
      for (let i = 0; i < run.duration_slots; i++) slots.add((startSlot + i) % 48)
      const origSlot = timeToSlot(run.current_start)
      const origSlots = new Set()
      for (let i = 0; i < run.duration_slots; i++) origSlots.add((origSlot + i) % 48)
      return { run, slots, origSlots, moved: run.new_start !== run.current_start }
    })
  }, [runs])

  const hourTicks = Array.from({ length: 13 }, (_, i) => i * 4) // 0,4,8,...48

  return (
    <Section
      title="Appliance Schedule Heatmap"
    >
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(48 * CELL + 100, 520) }}>
          {/* Time header */}
          <div className="flex mb-1" style={{ paddingLeft: 100 }}>
            {hourTicks.map(s => (
              <div key={s} style={{ width: CELL * 4, fontSize: 12, color: '#A3A3A3', flexShrink: 0 }}>
                {slotToTime(s)}
              </div>
            ))}
          </div>

          {/* Tariff band strip */}
          <div className="flex mb-2" style={{ paddingLeft: 100 }}>
            {Array.from({ length: 48 }, (_, s) => (
              <div key={s} style={{
                width: CELL, height: 6, flexShrink: 0,
                background: BAND_COLORS[bandClass(s, priceSlots)],
                borderRight: '1px solid rgba(255,255,255,0.04)',
              }} title={priceSlots[s] ? `₹${FMT(priceSlots[s], 2)}/kWh` : ''} />
            ))}
          </div>

          {/* Appliance rows */}
          {scheduleMap.map(({ run, slots, origSlots, moved }, ri) => {
            const color = APP_PALETTE[ri % APP_PALETTE.length]
            return (
              <div key={run.name} className="flex items-center mb-0.5">
                {/* Label */}
                <div style={{ width: 100, flexShrink: 0 }}
                  className="text-xs text-[#FFFFFF] pr-2 truncate text-right" title={run.name}>
                  {run.name}
                </div>
                {/* Cells */}
                <div className="flex">
                  {Array.from({ length: 48 }, (_, s) => {
                    const isActive   = slots.has(s)
                    const wasOriginal = origSlots.has(s) && moved && !isActive
                    return (
                      <div key={s} style={{
                        width: CELL, height: ROW, flexShrink: 0,
                        background: isActive
                          ? color + 'CC'
                          : wasOriginal
                            ? 'transparent'
                            : bandClass(s, priceSlots) !== 'normal'
                              ? BAND_COLORS[bandClass(s, priceSlots)]
                              : 'transparent',
                        border: wasOriginal
                          ? `1px dashed ${color}70`
                          : isActive
                            ? `1px solid ${color}`
                            : '1px solid rgba(255,255,255,0.04)',
                        borderRadius: 1,
                      }}
                        title={isActive
                          ? `${run.name} · ${slotToTime(s)} · ${run.power_kw} kW${priceSlots[s] ? ` · ₹${FMT(priceSlots[s], 2)}/kWh` : ''}`
                          : wasOriginal ? `${run.name} · original: ${slotToTime(s)}`
                          : ''
                        }
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3 pl-[100px]">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded-sm" style={{ background: APP_PALETTE[0] + 'CC', border: `1px solid ${APP_PALETTE[0]}` }} />
              <span className="text-xs text-[#A3A3A3]">Active (optimized)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded-sm" style={{ border: `1px dashed ${APP_PALETTE[0]}70` }} />
              <span className="text-xs text-[#A3A3A3]">Original position</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded-sm" style={{ background: BAND_COLORS.peak }} />
              <span className="text-xs text-[#A3A3A3]">Peak tariff</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded-sm" style={{ background: BAND_COLORS.cheap }} />
              <span className="text-xs text-[#A3A3A3]">Cheap tariff</span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── D. Cost breakdown by appliance ────────────────────────────────────────────
//
// Source: runs[].cost_before_inr, runs[].cost_after_inr (per single run, from backend)
// These are direct optimizer outputs — not derived.
// Displayed as per-run costs.

function CostBreakdownChart({ runs }) {
  const [metric, setMetric] = useState('cost') // 'cost' | 'energy'

  const data = useMemo(() => {
    return [...runs]
      .map(r => ({
        name:        r.name.length > 12 ? r.name.split(' ')[0] : r.name,
        fullName:    r.name,
        before:      Math.round(r.cost_before_inr * 100) / 100,
        after:       Math.round(r.cost_after_inr * 100) / 100,
        delta:       Math.round((r.cost_before_inr - r.cost_after_inr) * 100) / 100,
        energy:      Math.round(r.energy_kwh_per_run * 100) / 100,
        moved:       r.new_start !== r.current_start,
      }))
      .sort((a, b) =>
        metric === 'cost' ? b.before - a.before : b.energy - a.energy
      )
  }, [runs, metric])

  const barHeight = Math.max(runs.length * 36 + 30, 80)

  return (
    <Section
      title={metric === 'cost' ? 'Per-Run Cost Breakdown' : 'Energy per Run'}
      action={
        <div className="flex rounded-lg p-0.5 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
          {[['cost', '₹ Cost'], ['energy', 'kWh']].map(([id, label]) => (
            <button key={id} onClick={() => setMetric(id)}
              className="px-2 py-0.5 rounded-md text-xs font-semibold transition-all"
              style={{
                background: metric === id ? '#141414' : 'transparent',
                color:      metric === id ? '#FFFFFF' : '#A3A3A3',
                border:     metric === id ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
              }}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart data={data} layout="vertical"
          margin={{ top: 2, right: metric === 'cost' ? 60 : 40, bottom: 2, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#A3A3A3', fontSize: 12 }}
            axisLine={false} tickLine={false}
            tickFormatter={v => metric === 'cost' ? `₹${v}` : `${v}`} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#A3A3A3', fontSize: 12 }}
            axisLine={false} tickLine={false} width={82} />
          <Tooltip content={
            <ChartTooltip fmt={(v, key) => {
              if (key === 'energy') return `${FMT(v, 2)} kWh`
              return INR(v)
            }} />
          } />
          {metric === 'cost' ? (
            <>
              <Bar dataKey="before" name="Before" radius={[0, 3, 3, 0]} maxBarSize={12} barSize={10}
                fill="rgba(241,108,117,0.55)" />
              <Bar dataKey="after"  name="After"  radius={[0, 3, 3, 0]} maxBarSize={12} barSize={10}
                fill="#FFFFFF" opacity={0.85} />
            </>
          ) : (
            <Bar dataKey="energy" name="Energy (kWh)" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {data.map(entry => (
                <Cell key={entry.fullName}
                  fill={entry.moved ? '#FFFFFF' : '#FFFFFF'} opacity={0.85} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
      {metric === 'cost' && (
        <div className="flex gap-4 mt-2">
          {[['rgba(241,108,117,0.55)', 'Before'], ['#FFFFFF', 'After']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: c }} />
              <span className="text-xs text-[#A3A3A3]">{l}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ── E. Tariff + appliance overlay ─────────────────────────────────────────────
//
// Source: tariff.price_slots[48] (from /tariffs) · runs[].new_start, current_start

function TariffOverlay({ tariff, runs }) {
  const data = useMemo(() => {
    if (!tariff?.price_slots?.length) return []
    return Array.from({ length: 48 }, (_, s) => ({
      time:  slotToTime(s),
      price: Math.round(tariff.price_slots[s] * 1000) / 1000,
      band:  bandClass(s, tariff.price_slots),
    }))
  }, [tariff])

  const appMarkers = useMemo(() => runs.map((run, i) => ({
    time:  slotToTime(timeToSlot(run.new_start)),
    name:  run.name,
    moved: run.new_start !== run.current_start,
    color: APP_PALETTE[i % APP_PALETTE.length],
  })), [runs])

  if (!data.length) {
    return (
      <Section title="Tariff Profile" sub="Select a tariff to see price bands">
        <p className="text-xs text-[#A3A3A3] text-center py-6">
          Tariff data unavailable
        </p>
      </Section>
    )
  }

  const prices  = data.map(d => d.price)
  const maxP    = Math.max(...prices)
  const minP    = Math.min(...prices)
  const xTicks  = data.filter((_, i) => i % 4 === 0).map(d => d.time)

  return (
    <Section
      title="Tariff Profile & Appliance Placement"
    >
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis dataKey="time" ticks={xTicks} tick={{ fill: '#A3A3A3', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
          <YAxis tick={{ fill: '#A3A3A3', fontSize: 12 }} axisLine={false} tickLine={false}
            domain={[minP * 0.88, maxP * 1.12]} width={44}
            tickFormatter={v => `₹${FMT(v, 2)}`} />
          <Tooltip content={<ChartTooltip fmt={v => `₹${FMT(v, 3)}/kWh`} />} />
          {appMarkers.map(a => (
            <ReferenceLine key={a.name} x={a.time}
              stroke={a.color} strokeWidth={1.5}
              strokeDasharray={a.moved ? '0' : '3 2'}
              strokeOpacity={0.8}
              label={{ value: a.name.split(' ')[0], position: 'top', fill: a.color, fontSize: 12, offset: 2 }}
            />
          ))}
          <Line type="monotone" dataKey="price" name="Price" stroke="#FFFFFF"
            strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 rounded inline-block" style={{ background: '#FFFFFF' }} />
          <span className="text-xs text-[#A3A3A3]">Tariff price</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-0.5 h-3 rounded inline-block" style={{ background: '#A3A3A3' }} />
          <span className="text-xs text-[#A3A3A3]">Appliance start (solid = moved)</span>
        </div>
      </div>
    </Section>
  )
}

// ── F. Optimization log ───────────────────────────────────────────────────────
//
// Source: all runs[] fields. Status derived from new_start !== current_start.
// No reasons are invented. Tariff observations are labelled "inferred".

const LOG_PAGE = 10

function OptLog({ runs, tariff }) {
  const [filter, setFilter] = useState('all') // 'all' | 'moved' | 'unchanged'
  const [page,   setPage]   = useState(1)

  const priceSlots = tariff?.price_slots || []

  // Infer tariff band label for a time — labelled explicitly as inferred
  function inferredBand(t) {
    if (!priceSlots.length) return null
    const s = timeToSlot(t)
    return bandClass(s, priceSlots)
  }

  const sorted = useMemo(() => {
    let rows = [...runs].sort((a, b) =>
      (b.new_start !== b.current_start ? 1 : 0) - (a.new_start !== a.current_start ? 1 : 0)
    )
    if (filter === 'moved')     rows = rows.filter(r => r.new_start !== r.current_start)
    if (filter === 'unchanged') rows = rows.filter(r => r.new_start === r.current_start)
    return rows
  }, [runs, filter])

  const visible  = sorted.slice(0, page * LOG_PAGE)
  const hasMore  = visible.length < sorted.length

  const BAND_LABELS = { peak: { label: 'Peak', color: '#F16C75' }, cheap: { label: 'Cheap', color: '#FFFFFF' }, normal: { label: 'Normal', color: '#A3A3A3' } }

  return (
    <Section
      title="Optimization Log"
      action={
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Filter size={11} color="#A3A3A3" />
          <div className="flex rounded-lg p-0.5"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            {[['all', 'All'], ['moved', 'Moved'], ['unchanged', 'Unchanged']].map(([id, label]) => (
              <button key={id} onClick={() => { setFilter(id); setPage(1) }}
                className="px-2 py-0.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: filter === id ? '#141414' : 'transparent',
                  color:      filter === id ? '#FFFFFF' : '#A3A3A3',
                  border:     filter === id ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {/* Table header */}
      <div className="grid text-xs text-[#A3A3A3] font-semibold uppercase tracking-wider mb-1 pb-1 border-b"
        style={{ gridTemplateColumns: '1fr 80px 110px 70px 70px', borderColor: 'rgba(255,255,255,0.1)' }}>
        <span>Appliance</span>
        <span className="text-right">Original</span>
        <span className="text-center">Change</span>
        <span className="text-right">Band</span>
        <span className="text-right">Impact/run</span>
      </div>

      {sorted.length === 0 && (
        <p className="text-xs text-[#A3A3A3] text-center py-4">No runs match this filter.</p>
      )}

      {visible.map(run => {
        const moved  = run.new_start !== run.current_start
        const delta  = run.cost_before_inr - run.cost_after_inr
        const band   = inferredBand(run.new_start)
        const bc     = BAND_LABELS[band] || BAND_LABELS.normal

        return (
          <div key={run.name}
            className="grid items-center py-2 border-b"
            style={{ gridTemplateColumns: '1fr 80px 110px 70px 70px', borderColor: 'rgba(255,255,255,0.06)' }}>
            {/* Name + status */}
            <div className="flex items-center gap-2 min-w-0">
              {moved
                ? <CheckCircle size={11} color="#FFFFFF" className="flex-shrink-0" />
                : <Clock size={11} color="#A3A3A3" className="flex-shrink-0" />
              }
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#FFFFFF] truncate">{run.name}</p>
                <p className="text-xs text-[#A3A3A3]">{run.power_kw} kW · {run.duration_slots * 30} min</p>
              </div>
            </div>

            {/* Original time */}
            <p className="text-xs text-[#A3A3A3] tabular-nums text-right">{run.current_start}</p>

            {/* Arrow */}
            <div className="flex items-center justify-center gap-1 text-xs">
              {moved ? (
                <>
                  <span className="text-[#A3A3A3] tabular-nums">{run.current_start}</span>
                  <ArrowRight size={9} color="#A3A3A3" />
                  <span className="font-semibold tabular-nums" style={{ color: '#FFFFFF' }}>{run.new_start}</span>
                </>
              ) : (
                <span className="text-xs text-[#525252]">unchanged</span>
              )}
            </div>

            {/* Tariff band (inferred) */}
            <div className="text-right">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                style={{ background: `${bc.color}18`, color: bc.color }}>
                {bc.label}
              </span>
            </div>

            {/* Cost delta per run */}
            <p className="text-xs tabular-nums font-semibold text-right"
              style={{ color: delta > 0.01 ? '#FFFFFF' : delta < -0.01 ? '#F16C75' : '#A3A3A3' }}>
              {Math.abs(delta) > 0.01 ? `${delta > 0 ? '+' : ''}${INR(delta)}` : '—'}
            </p>
          </div>
        )
      })}

      {/* Pagination */}
      {(hasMore || page > 1) && (
        <div className="mt-3 flex items-center gap-3">
          {hasMore && (
            <button onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1.5 text-xs text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors">
              <ChevronDown size={12} />
              Show more ({sorted.length - visible.length} remaining)
            </button>
          )}
          {page > 1 && (
            <button onClick={() => setPage(1)}
              className="flex items-center gap-1.5 text-xs text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors ml-auto">
              <ChevronUp size={12} />
              Show less
            </button>
          )}
        </div>
      )}
    </Section>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SavingsPanel({ result, loading, tariff, isStale }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[24, 220, 160, 140, 160, 200].map((h, i) => (
          <div key={i} className="skeleton rounded-xl" style={{ height: h }} />
        ))}
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <TrendingDown size={28} color="#A3A3A3" className="mb-3 opacity-40" />
        <p className="text-[#A3A3A3] text-sm">Add appliances and optimise to see results.</p>
        <p className="text-xs text-[#525252] mt-1">Use the Quick add buttons or add a custom appliance.</p>
      </div>
    )
  }

  const { runs, monthly } = result

  return (
    <div className="space-y-4">
      {isStale && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 mb-2"
          style={{ background: 'rgba(244,184,96,0.1)', border: '1px solid rgba(244,184,96,0.2)' }}>
          <AlertTriangle size={12} color="#F4B860" className="flex-shrink-0" />
          <p className="text-[#F4B860]">
            <strong>Showing last successful result.</strong> The latest optimization request failed.
          </p>
        </div>
      )}

      {/* A. KPI row */}
      <KPIRow monthly={monthly} runs={runs} />

      {/* B. Load profile */}
      <LoadProfileChart runs={runs} tariff={tariff} />

      {/* C. Schedule heatmap */}
      <ScheduleHeatmap runs={runs} tariff={tariff} />

      {/* D. Cost breakdown */}
      <CostBreakdownChart runs={runs} />

      {/* E. Tariff overlay */}
      {tariff?.price_slots?.length > 0 && (
        <TariffOverlay tariff={tariff} runs={runs} />
      )}

      {/* F. Optimization log */}
      <OptLog runs={runs} tariff={tariff} />

      {/* Disclaimer */}
      <DisclaimerDisclosure />
    </div>
  )
}

function DisclaimerDisclosure() {
  const [open, setOpen] = useState(false)
  
  return (
    <div className="relative inline-block mt-2">
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors"
        aria-expanded={open}
      >
        <Info size={12} />
        <span>Illustrative estimates</span>
      </button>
      
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[280px] sm:w-[340px] z-10 rounded-lg p-3 shadow-xl"
          style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.15)' }}>
          <p className="text-xs text-[#A3A3A3] leading-relaxed">
            Tariff prices and carbon factors are illustrative.
            Savings arise from shifting runs to lower-price slots — total energy consumed does not change.
            Demand profile derived from appliance schedules, not measured meter readings.
          </p>
          <div className="absolute -bottom-1.5 left-4 w-3 h-3 rotate-45"
            style={{ background: '#0A0A0A', borderRight: '1px solid rgba(255,255,255,0.15)', borderBottom: '1px solid rgba(255,255,255,0.15)' }} />
        </div>
      )}
    </div>
  )
}
