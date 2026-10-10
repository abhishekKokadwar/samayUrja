/**
 * HostingCapacity: how many EV homes the same transformers can take under each
 * strategy. The backend reruns the scenario at every EV adoption level; this
 * shows the headline answer and the busiest transformer's load at each level.
 */
import { useEffect, useRef, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { api } from '../../api.js'

const STRATEGIES = [
  { id: 'unmanaged', label: 'Today', color: '#737373', dash: '5 4' },
  { id: 'independent', label: 'Each home alone', color: '#F4B860' },
  { id: 'coordinated', label: 'FlockShield', color: '#FFFFFF' },
]

// Slower than the main rerun: this request is eleven simulations.
const DELAY_MS = 900

function hosted(pct) {
  return pct === null || pct === undefined ? 'none' : `${pct}%`
}

function headline(max) {
  const today = max.unmanaged
  const flock = max.coordinated
  if (flock === null) return 'These transformers are too small for this neighbourhood, even with no EVs.'
  if (today === null) return `Today these transformers overload even with no EVs. With FlockShield they can host EVs in up to ${flock}% of homes.`
  if (flock > today) return `The same transformers can host EVs in up to ${today}% of homes today, and ${flock}% with FlockShield.`
  return `These transformers can host EVs in up to ${flock}% of homes, with or without coordination.`
}

export function HostingCapacity({ params }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const latest = useRef(0)

  useEffect(() => {
    const id = ++latest.current
    const timer = setTimeout(async () => {
      try {
        const r = await api.hostingCapacity(params)
        if (id === latest.current) { setResult(r); setError(null) }
      } catch (err) {
        if (id === latest.current) { setResult(null); setError(err.message) }
      }
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [params])

  if (error) return <p className="text-xs text-[#A3A3A3]">{error}</p>
  if (!result) return <div className="skeleton h-48 rounded-lg" />

  const data = result.ev_pct.map((pct, i) => ({
    pct,
    unmanaged: result.utilization_pct.unmanaged[i],
    independent: result.utilization_pct.independent[i],
    coordinated: result.utilization_pct.coordinated[i],
  }))

  const top = Math.max(100, ...data.flatMap(d => [d.unmanaged, d.independent, d.coordinated]))

  return (
    <div>
      <p className="text-sm font-semibold text-[#FFFFFF] mb-3">{headline(result.max_ev_pct)}</p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {STRATEGIES.map(s => (
          <div key={s.id} className="rounded-lg px-3 py-2" style={{ background: '#141414' }}>
            <div className="flex items-center gap-1.5 text-xs text-[#A3A3A3]">
              <span className="inline-block w-3 h-1.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </div>
            <div className="text-xl font-semibold text-[#FFFFFF] tabular-nums">
              {hosted(result.max_ev_pct[s.id])}
            </div>
            <div className="text-xs text-[#A3A3A3]">
              {result.max_ev_pct[s.id] === null ? 'overloaded even with no EVs' : 'of homes can have an EV'}
            </div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 14, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="pct"
            tick={{ fill: '#A3A3A3', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
            tickLine={false}
            tickFormatter={v => `${v}%`}
            label={{ value: 'Homes with an EV', position: 'insideBottom', offset: -8, fill: '#A3A3A3', fontSize: 12 }}
          />
          <YAxis
            tick={{ fill: '#A3A3A3', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${v}%`}
            ticks={Array.from({ length: Math.ceil(top / 50) + 1 }, (_, i) => i * 50)}
            domain={[0, Math.ceil(top / 50) * 50]}
            width={48}
          />
          <Tooltip
            contentStyle={{ background: '#141414', border: '1px solid #1A1A1A', borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: '#FFFFFF' }}
            labelFormatter={v => `${v}% of homes have an EV`}
            formatter={(v, name) => [`${Math.round(v)}% of capacity`, name]}
          />
          <ReferenceLine
            y={100}
            stroke="#F16C75"
            strokeDasharray="4 2"
            strokeWidth={1.5}
            label={{ value: 'Capacity', position: 'insideTopRight', fill: '#F16C75', fontSize: 12 }}
          />
          {STRATEGIES.map(s => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="mt-2 text-xs text-[#A3A3A3]">
        Each point is the busiest transformer's peak load when that share of homes owns an EV, with
        everything else in the scenario unchanged. A share counts as hosted when no transformer goes
        above capacity and every appliance still gets a slot. Checked in steps of 10%.
      </p>
    </div>
  )
}
