/**
 * KPICard — Metric display card for the neighbourhood dashboard.
 */
export function KPICard({ label, value, unit, icon: Icon, color = '#43D9A3', comparison, loading }) {
  return (
    <div className="card animate-fade-in" style={{ padding: '20px' }}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-[#94A3B8] font-medium uppercase tracking-wider leading-tight max-w-[70%]">
          {label}
        </span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}28` }}
          >
            <Icon size={15} color={color} strokeWidth={2} />
          </div>
        )}
      </div>
      {loading ? (
        <div className="skeleton h-9 w-28 mb-1" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="kpi-value" style={{ color }}>
            {value}
          </span>
          {unit && <span className="kpi-unit">{unit}</span>}
        </div>
      )}
      {comparison && !loading && (
        <p className="text-[0.68rem] text-[#94A3B8] mt-2 leading-snug">{comparison}</p>
      )}
    </div>
  )
}
