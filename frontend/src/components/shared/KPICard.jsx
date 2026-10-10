/**
 * KPICard — Metric display card for the neighbourhood dashboard.
 * Supports primary and secondary variants.
 */
export function KPICard({ label, value, unit, icon: Icon, color = '#43D9A3', comparison, loading, secondary }) {
  if (secondary) {
    // Compact secondary variant — used for CO₂, overloaded slots, diagnostics
    return (
      <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={13} color={color} strokeWidth={2} className="flex-shrink-0" />}
          <span className="text-xs text-[#94A3B8] truncate">{label}</span>
        </div>
        {loading ? (
          <div className="skeleton h-4 w-16 rounded" />
        ) : (
          <div className="flex items-baseline gap-1 flex-shrink-0 ml-3">
            <span className="text-sm font-semibold tabular-nums" style={{ color }}>{value}</span>
            {unit && <span className="text-[0.65rem] text-[#94A3B8]">{unit}</span>}
          </div>
        )}
      </div>
    )
  }

  // Primary variant
  return (
    <div className="card animate-fade-in" style={{ padding: '16px' }}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[0.68rem] text-[#94A3B8] font-medium uppercase tracking-wider leading-tight max-w-[70%]">
          {label}
        </span>
        {Icon && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}28` }}
          >
            <Icon size={13} color={color} strokeWidth={2} />
          </div>
        )}
      </div>
      {loading ? (
        <div className="skeleton h-8 w-24 mb-1" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="kpi-value" style={{ color }}>
            {value}
          </span>
          {unit && <span className="kpi-unit">{unit}</span>}
        </div>
      )}
      {comparison && !loading && (
        <p className="text-[0.65rem] text-[#94A3B8] mt-2 leading-snug">{comparison}</p>
      )}
    </div>
  )
}
