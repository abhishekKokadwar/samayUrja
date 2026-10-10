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

const STRATEGY_COLORS = {
  unmanaged: '#94A3B8',
  independent: '#F4B860',
  coordinated: '#43D9A3',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="p-3 rounded-xl text-xs"
      style={{
        background: '#151F2A',
        border: '1px solid rgba(148,163,184,0.18)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        minWidth: 180,
      }}
    >
      <p className="font-semibold text-[#EDF4F7] mb-2">{label}</p>
      {payload.map(p => p.value != null && (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-[#94A3B8] capitalize">{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums" style={{ color: p.color }}>
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
    unmanaged: 'Unmanaged',
    independent: 'Independent (rebound)',
    coordinated: 'FlockShield',
  }
  return (
    <div className="flex flex-wrap gap-4 justify-center mt-2">
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-1.5">
          <span className="block w-5 h-0.5 rounded" style={{ background: p.color }} />
          <span className="text-[0.7rem] text-[#94A3B8]">{labels[p.dataKey] || p.dataKey}</span>
        </div>
      ))}
    </div>
  )
}

export function LoadCurveChart({
  unmanagedDemand,
  independentDemand,
  coordinatedDemand,
  transformerCapacityKw,
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
  const maxVal = allValues.length ? Math.max(...allValues) : 100

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.08)"
          vertical={false}
        />
        <XAxis
          dataKey="time"
          ticks={xTicks}
          tick={{ fill: '#94A3B8', fontSize: 10 }}
          axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
          tickLine={false}
          label={{ value: 'Time of day', position: 'insideBottom', offset: -2, fill: '#94A3B8', fontSize: 10 }}
        />
        <YAxis
          tick={{ fill: '#94A3B8', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}`}
          label={{ value: 'kW', angle: -90, position: 'insideLeft', offset: 10, fill: '#94A3B8', fontSize: 10 }}
          domain={[0, Math.ceil(maxVal * 1.12)]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />

        {/* Transformer capacity reference line */}
        {transformerCapacityKw && (
          <ReferenceLine
            y={transformerCapacityKw}
            stroke="#F16C75"
            strokeDasharray="4 2"
            strokeWidth={1.5}
            label={{ value: 'Transformer cap.', position: 'right', fill: '#F16C75', fontSize: 9 }}
          />
        )}

        <Line
          type="monotone"
          dataKey="unmanaged"
          name="unmanaged"
          stroke={STRATEGY_COLORS.unmanaged}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          opacity={0.7}
        />
        <Line
          type="monotone"
          dataKey="independent"
          name="independent"
          stroke={STRATEGY_COLORS.independent}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="coordinated"
          name="coordinated"
          stroke={STRATEGY_COLORS.coordinated}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
