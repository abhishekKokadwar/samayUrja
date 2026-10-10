/**
 * DecisionLog — FlockShield scheduling decision log.
 *
 * Displays decisions from the backend in a readable format.
 * All entries come from actual backend scheduler output — never hard-coded.
 */
import { CheckCircle, XCircle, ArrowRight, Zap, AlertTriangle } from 'lucide-react'

const CONSTRAINT_LABELS = {
  tariff: { label: 'Cost optimisation', color: '#43D9A3' },
  transformer_capacity: { label: 'Transformer capacity', color: '#F4B860' },
  sanctioned_load: { label: 'Sanctioned load', color: '#58BFE8' },
  fixed: { label: 'Fixed load', color: '#94A3B8' },
  infeasible: { label: 'Infeasible', color: '#F16C75' },
}

function DecisionRow({ d, index }) {
  const { label: cLabel, color: cColor } = CONSTRAINT_LABELS[d.constraint] || { label: d.constraint, color: '#94A3B8' }
  const moved = d.prev_time !== d.new_time

  return (
    <div
      className="flex flex-col gap-1.5 py-3 border-b animate-fade-in"
      style={{ borderColor: 'rgba(148,163,184,0.08)', animationDelay: `${index * 20}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {d.passed_validation ? (
            <CheckCircle size={13} color="#43D9A3" className="flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle size={13} color="#F16C75" className="flex-shrink-0 mt-0.5" />
          )}
          <span className="text-[0.75rem] font-medium text-[#EDF4F7] truncate">
            Home {d.home_id + 1} · {d.appliance_name}
          </span>
        </div>
        <span
          className="text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: `${cColor}18`, color: cColor, border: `1px solid ${cColor}25` }}
        >
          {cLabel}
        </span>
      </div>

      {moved && (
        <div className="flex items-center gap-1.5 pl-5 text-[0.7rem]">
          <span className="text-[#94A3B8] tabular-nums font-medium">{d.prev_time}</span>
          <ArrowRight size={11} color="#94A3B8" />
          <span className="tabular-nums font-semibold" style={{ color: moved ? '#43D9A3' : '#94A3B8' }}>
            {d.new_time}
          </span>
        </div>
      )}

      <p className="pl-5 text-[0.68rem] text-[#94A3B8] leading-snug">{d.reason}</p>
    </div>
  )
}

export function DecisionLog({ decisions, loading }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!decisions?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Zap size={28} color="#94A3B8" className="mb-2 opacity-40" />
        <p className="text-[#94A3B8] text-sm">No decisions yet.</p>
        <p className="text-[#94A3B8] text-xs mt-1">Run a simulation to see FlockShield's scheduling log.</p>
      </div>
    )
  }

  const transformerDecisions = decisions.filter(d => d.constraint === 'transformer_capacity')
  const otherDecisions = decisions.filter(d => d.constraint !== 'transformer_capacity')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[0.65rem] text-[#94A3B8] uppercase tracking-wider font-semibold">
          FlockShield Decisions
        </p>
        <span className="text-[0.65rem] text-[#94A3B8]">
          {decisions.length} entries shown
        </span>
      </div>

      {transformerDecisions.length > 0 && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-[0.68rem] flex items-start gap-2"
          style={{ background: 'rgba(244,184,96,0.08)', border: '1px solid rgba(244,184,96,0.15)' }}
        >
          <AlertTriangle size={12} color="#F4B860" className="mt-0.5 flex-shrink-0" />
          <span className="text-[#F4B860]">
            {transformerDecisions.length} appliances were redirected due to transformer capacity constraints.
          </span>
        </div>
      )}

      <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
        {decisions.map((d, i) => (
          <DecisionRow key={`${d.home_id}-${d.appliance_name}-${i}`} d={d} index={i} />
        ))}
      </div>
    </div>
  )
}
