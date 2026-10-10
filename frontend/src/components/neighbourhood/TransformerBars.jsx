/**
 * TransformerBars: one row per transformer, one bar per strategy, against capacity.
 * "Overloaded" here means above 100% of capacity, the same rule the engine uses.
 */

const STRATEGIES = [
  { id: 'unmanaged', label: 'Today', color: '#737373' },
  { id: 'independent', label: 'Each home alone', color: '#F4B860' },
  { id: 'coordinated', label: 'FlockShield', color: '#FFFFFF' },
]

export function TransformerBars({ transformerSummary }) {
  if (!transformerSummary?.length) return <div className="skeleton h-48 rounded-lg" />

  const worst = Math.max(
    ...transformerSummary.flatMap(t => STRATEGIES.map(s => t[s.id]?.max_utilization_pct ?? 0)),
  )
  // Bars share one scale that always has room for the 100% capacity mark.
  const scale = Math.max(120, Math.ceil(worst / 10) * 10 + 10)
  const capacityLeft = `${(100 / scale) * 100}%`

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {STRATEGIES.map(s => (
          <span key={s.id} className="flex items-center gap-1.5 text-xs text-[#A3A3A3]">
            <span className="inline-block w-3 h-1.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {transformerSummary.map(t => (
          <div key={t.id}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-semibold text-[#FFFFFF]">{t.id}</span>
              <span className="text-xs text-[#A3A3A3]">
                {t.n_homes} homes · {t.capacity_kw} kW
              </span>
            </div>
            <div className="space-y-1">
              {STRATEGIES.map(s => {
                const pct = t[s.id]?.max_utilization_pct ?? 0
                const over = pct > 100
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2"
                    title={`${t.id}, ${s.label}: peak ${Math.round(pct)}% of capacity`}
                  >
                    <div className="relative flex-1 h-2 rounded-sm" style={{ background: '#141414' }}>
                      <div
                        className="h-2 rounded-sm"
                        style={{ width: `${Math.min(100, (pct / scale) * 100)}%`, background: s.color }}
                      />
                      {/* 100% capacity mark */}
                      <div
                        className="absolute"
                        style={{ left: capacityLeft, top: -3, bottom: -3, borderLeft: '1px dashed #F16C75' }}
                        aria-hidden="true"
                      />
                    </div>
                    <span
                      className="text-xs tabular-nums w-20 text-right"
                      style={{ color: over ? '#F16C75' : '#A3A3A3', fontWeight: over ? 600 : 400 }}
                    >
                      {Math.round(pct)}%{over ? ' over' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-[#A3A3A3]">
        Dashed red line: 100% of the transformer's capacity. Anything past it is overloaded.
      </p>
    </div>
  )
}
