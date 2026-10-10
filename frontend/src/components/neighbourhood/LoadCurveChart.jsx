/**
 * LoadCurveChart — Recharts area/line chart showing demand across all three strategies.
 *
 * Shows 48 half-hour slots (00:00 to 24:00) with:
 * - Unmanaged baseline (grey)
 * - Independent optimization (amber — shows rebound peak)
 * - FlockShield coordination (emerald — shows improvement)
 *
 * The rebound peak from independent optimization is the visual centrepiece.
 */
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
} from 'recharts'

function slotLabel(s) {
  const h = Math.floor(s / 2)
  const m = (s % 2) * 30
  return `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`
}

function buildChartData(unmanaged, independent, coordinated, transformerCapacity) {
  return Array.from({ length: 48 }, (_, s) => ({
    time: slotLabel(s),
    slot: s,
    unmanaged: unmanaged ? Math.round(unmanaged[s] * 10) / 10 : null,
    independent: independent ? Math.round(independent[s] * 10) / 10 : null,
    coordinated: coordinated ? Math.round(coordinated[s] * 10) / 10 : null,
    transformerCapacity,
  }))
}

// Contiguous runs of slots at the cheapest price and at the dearest price.
// Shading them behind the lines shows why load moves where it does.
function tariffBands(priceSlots) {
  if (!priceSlots?.length) return []
  const lo = Math.min(...priceSlots)
  const hi = Math.max(...priceSlots)
  if (hi - lo < 1e-9) return [] // flat tariff: nothing to shade
  const bands = []
  const collect = (target, kind) => {
    let start = null
    for (let s = 0; s <= priceSlots.length; s++) {
      const hit = s < priceSlots.length && Math.abs(priceSlots[s] - target) < 1e-9
      if (hit && start === null) start = s
      if (!hit && start !== null) {
        bands.push({ kind, from: slotLabel(start), to: slotLabel(Math.min(s, priceSlots.length - 1)) })
        start = null
      }
    }
  }
  collect(lo, 'cheap')
  collect(hi, 'peak')
  return bands
}

// The highest point of each strategy, labelled on the chart.
function peaks(data) {
  return ['unmanaged', 'independent', 'coordinated']
    .map(key => {
      const top = data.reduce((best, d) => (d[key] != null && (best === null || d[key] > best[key]) ? d : best), null)
      return top ? { key, time: top.time, kw: top[key] } : null
    })
    .filter(Boolean)
}

const STRATEGY_COLORS = {
  // Grey dashed baseline, amber for the problem case, white for FlockShield.
  // The dash keeps the baseline readable without relying on colour.
  unmanaged: '#737373',
  independent: '#F4B860',
  coordinated: '#FFFFFF',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="p-3 rounded-xl text-xs"
      style={{
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        minWidth: 180,
      }}
    >
      <p className="font-semibold text-[#FFFFFF] mb-2">{label}</p>
      {payload.map(p => p.value != null && (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-[#A3A3A3]">{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums text-[#FFFFFF]">
            {p.value} kW
          </span>
        </div>
      ))}
    </div>
  )
}

const CustomLegend = ({ payload }) => {
  if (!payload?.length) return null
  const labels = {
    unmanaged: 'Today (unmanaged)',
    independent: 'Each home alone',
    coordinated: 'FlockShield',
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-1.5">
          <span
            className="block w-5"
            style={{ borderTop: `2px ${p.dataKey === 'unmanaged' ? 'dashed' : 'solid'} ${p.color}` }}
          />
          <span className="text-xs text-[#A3A3A3]">{labels[p.dataKey] || p.dataKey}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="block w-5" style={{ borderTop: '2px dashed #F16C75' }} />
        <span className="text-xs text-[#A3A3A3]">Combined transformer capacity</span>
      </div>
    </div>
  )
}

export function LoadCurveChart({
  unmanagedDemand,
  independentDemand,
  coordinatedDemand,
  transformerCapacityKw,
  priceSlots,
  loading,
}) {
  if (loading) {
    return <div className="skeleton w-full h-64 rounded-xl" />
  }

  const data = buildChartData(
    unmanagedDemand,
    independentDemand,
    coordinatedDemand,
    transformerCapacityKw,
  )

  // Determine tick interval for readable x-axis (every 2 hours = every 4 slots)
  const xTicks = data.filter((_, i) => i % 4 === 0).map(d => d.time)

  const allValues = [
    ...(unmanagedDemand || []),
    ...(independentDemand || []),
    ...(coordinatedDemand || []),
  ].filter(Boolean)
  // Include the capacity line so it is always inside the visible range.
  const maxVal = Math.max(allValues.length ? Math.max(...allValues) : 100, transformerCapacityKw || 0)
  // Net demand goes below zero when rooftop solar exports more than homes use.
  const minVal = Math.min(0, ...allValues)

  return (
    <ResponsiveContainer width="100%" height={440}>
      <ComposedChart data={data} margin={{ top: 22, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.08)"
          vertical={false}
        />
        <XAxis
          dataKey="time"
          ticks={xTicks}
          tick={{ fill: '#A3A3A3', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
          tickLine={false}
          label={{ value: 'Time of day', position: 'insideBottom', offset: -2, fill: '#A3A3A3', fontSize: 12 }}
        />
        <YAxis
          tick={{ fill: '#A3A3A3', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}`}
          label={{ value: 'kW', angle: -90, position: 'insideLeft', offset: 10, fill: '#A3A3A3', fontSize: 12 }}
          domain={[Math.floor(minVal * 1.12), Math.ceil(maxVal * 1.12)]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />

        {/* Tariff bands: cheapest hours and peak-price hours */}
        {tariffBands(priceSlots).map(b => (
          <ReferenceArea
            key={`${b.kind}-${b.from}`}
            x1={b.from}
            x2={b.to}
            fill={b.kind === 'cheap' ? '#FFFFFF' : '#F16C75'}
            fillOpacity={b.kind === 'cheap' ? 0.07 : 0.09}
            stroke="none"
            label={{
              value: b.kind === 'cheap' ? 'Cheapest' : 'Peak price',
              position: 'insideBottom',
              fill: '#A3A3A3',
              fontSize: 12,
            }}
          />
        ))}

        {/* Transformer capacity reference line */}
        {transformerCapacityKw && (
          <ReferenceLine
            y={transformerCapacityKw}
            stroke="#F16C75"
            strokeDasharray="4 2"
            strokeWidth={1.5}
          />
        )}

        <Line
          type="monotone"
          dataKey="unmanaged"
          name="Today"
          stroke={STRATEGY_COLORS.unmanaged}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          opacity={0.7}
        />
        <Line
          type="monotone"
          dataKey="independent"
          name="Each home alone"
          stroke={STRATEGY_COLORS.independent}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="coordinated"
          name="FlockShield"
          stroke={STRATEGY_COLORS.coordinated}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />

        {/* Peak of each strategy, labelled directly */}
        {peaks(data).map(pk => (
          <ReferenceDot
            key={pk.key}
            x={pk.time}
            y={pk.kw}
            r={4}
            fill={STRATEGY_COLORS[pk.key]}
            stroke="#000000"
            strokeWidth={2}
            label={{
              value: `${Math.round(pk.kw).toLocaleString('en-IN')} kW · ${pk.time}`,
              position:
                transformerCapacityKw && Math.abs(pk.kw - transformerCapacityKw) < transformerCapacityKw * 0.1
                  ? 'bottom'
                  : 'top',
              fill: '#FFFFFF',
              fontSize: 12,
              fontWeight: 600,
            }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
