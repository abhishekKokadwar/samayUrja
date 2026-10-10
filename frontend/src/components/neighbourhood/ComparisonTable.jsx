/**
 * ComparisonTable: the three strategies side by side, in plain words.
 * Replaces the per-strategy toggle and the KPI tiles.
 */

const INR = v => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)

function slotTime(s) {
  return `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`
}

function peakOf(demand) {
  if (!demand?.length) return null
  let i = 0
  for (let s = 1; s < demand.length; s++) if (demand[s] > demand[i]) i = s
  return { kw: demand[i], time: slotTime(i) }
}

const COLUMNS = [
  { id: 'unmanaged', label: 'Today', sub: 'No scheduling', swatch: '#737373', dashed: true },
  { id: 'independent', label: 'Each home alone', sub: 'Every home picks its cheapest time', swatch: '#F4B860' },
  { id: 'coordinated', label: 'FlockShield', sub: 'Homes scheduled together', swatch: '#FFFFFF' },
]

export function ComparisonTable({ sim }) {
  if (!sim) return <div className="skeleton h-64 rounded-xl" />

  const m = {
    unmanaged: sim.unmanaged_metrics,
    independent: sim.independent_metrics,
    coordinated: sim.coordinated_metrics,
  }
  const demand = {
    unmanaged: sim.unmanaged_demand,
    independent: sim.independent_demand,
    coordinated: sim.coordinated_demand,
  }
  const n = sim.scenario.n_transformers
  const baseCost = m.unmanaged.total_cost_inr_per_day
  const shedding = sim.scenario.enable_load_shedding

  // Each row: label, optional hint, and a cell renderer returning { text, sub, tone }.
  const rows = [
    {
      label: 'Highest demand',
      cell: id => {
        const p = peakOf(demand[id])
        return { text: `${Math.round(p.kw).toLocaleString('en-IN')} kW`, sub: `at ${p.time}` }
      },
    },
    {
      label: 'Busiest transformer',
      hint: 'Peak load as a share of its capacity',
      cell: id => {
        const pct = m[id].max_transformer_utilization_pct
        return { text: `${Math.round(pct)}%`, tone: pct > 100 ? 'bad' : pct > 90 ? 'warn' : null }
      },
    },
    {
      label: 'Transformers overloaded',
      cell: id => {
        const k = m[id].overloaded_transformers
        return { text: `${k} of ${n}`, tone: k > 0 ? 'bad' : null }
      },
    },
    {
      label: 'Daily electricity bill',
      hint: 'All homes together',
      cell: id => {
        const cost = m[id].total_cost_inr_per_day
        const pct = baseCost > 0 ? (1 - cost / baseCost) * 100 : 0
        const sub =
          id === 'unmanaged' ? 'baseline'
          : Math.abs(pct) < 0.5 ? 'same as today'
          : pct > 0 ? `${pct.toFixed(0)}% less` : `${Math.abs(pct).toFixed(0)}% more`
        return { text: `₹${INR(cost)}`, sub }
      },
    },
    {
      label: 'CO₂ per day',
      hint: 'Illustrative grid carbon model',
      cell: id => ({ text: `${INR(m[id].total_co2_kg_per_day)} kg` }),
    },
    {
      label: 'How spiky demand is',
      hint: 'Peak divided by average. Lower is flatter',
      cell: id => ({ text: `${m[id].peak_to_avg_ratio.toFixed(1)}×` }),
    },
    {
      label: 'Homes with cold water',
      hint: 'Geyser thermal model, at the usual bath time',
      cell: id => {
        const k = m[id].cold_water_homes ?? 0
        return { text: `${k}`, tone: k > 0 ? 'bad' : null }
      },
    },
    {
      label: 'Could not be scheduled',
      hint: 'Appliances with no time that fits every limit',
      cell: id => {
        if (id !== 'coordinated') return { text: 'n/a', muted: true }
        const k = m[id].infeasible_appliances
        return { text: `${k}`, tone: k > 0 ? 'warn' : null }
      },
    },
    ...(shedding
      ? [
          {
            label: 'Switched off to protect the grid',
            hint: 'Strict capacity mode',
            cell: id => {
              if (id !== 'coordinated') return { text: 'n/a', muted: true }
              const k = m[id].comfort_violations
              return { text: `${k} appliances`, tone: k > 0 ? 'warn' : null }
            },
          },
          {
            label: 'Energy not delivered',
            cell: id => {
              const kwh = m.unmanaged.total_energy_kwh - m[id].total_energy_kwh
              return { text: `${Math.max(0, kwh).toFixed(0)} kWh`, tone: kwh > 0.5 ? 'bad' : null }
            },
          },
        ]
      : []),
  ]

  const toneColor = { bad: '#F16C75', warn: '#F4B860' }

  return (
    <div
      className="rounded-xl overflow-x-auto"
      style={{ background: '#0A0A0A', border: '1px solid #1A1A1A' }}
    >
      {/* On a phone the hints and sub-headings are dropped so all three columns fit. */}
      <table className="w-full text-sm table-fixed sm:table-auto">
        <thead>
          <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
            <th className="text-left font-medium text-xs text-[#A3A3A3] px-2 sm:px-4 py-3 w-[26%] sm:w-[34%]">
              <span className="hidden sm:inline">Same homes, same day, three ways to run it</span>
            </th>
            {COLUMNS.map(c => (
              <th key={c.id} className="text-left px-1.5 sm:px-3 py-3 align-top">
                <span
                  className="block w-5 mb-1 sm:hidden"
                  style={{ borderTop: `2px ${c.dashed ? 'dashed' : 'solid'} ${c.swatch}` }}
                />
                <div className="flex items-center gap-2">
                  <span
                    className="hidden sm:inline-block w-5"
                    style={{ borderTop: `2px ${c.dashed ? 'dashed' : 'solid'} ${c.swatch}` }}
                  />
                  <span className="font-semibold text-[#FFFFFF]">{c.label}</span>
                </div>
                <div className="hidden sm:block text-xs font-normal text-[#A3A3A3] mt-0.5">{c.sub}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} style={{ borderBottom: '1px solid #1A1A1A' }}>
              <td className="px-2 sm:px-4 py-2.5 align-top">
                <div className="text-[#FFFFFF]">{row.label}</div>
                {row.hint && <div className="hidden sm:block text-xs text-[#A3A3A3]">{row.hint}</div>}
              </td>
              {COLUMNS.map(c => {
                const v = row.cell(c.id)
                return (
                  <td key={c.id} className="px-1.5 sm:px-3 py-2.5 align-top tabular-nums">
                    <span
                      className="font-semibold"
                      style={{ color: v.muted ? '#525252' : toneColor[v.tone] || '#FFFFFF' }}
                    >
                      {v.text}
                    </span>
                    {v.tone === 'bad' && <span className="sr-only"> (problem)</span>}
                    {v.sub && <span className="block sm:inline text-xs text-[#A3A3A3] sm:ml-1.5">{v.sub}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
