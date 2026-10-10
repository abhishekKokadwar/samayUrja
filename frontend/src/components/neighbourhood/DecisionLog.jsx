/**
 * DecisionLog — FlockShield scheduling decision log.
 *
 * Two view modes:
 *   "all"     — flat list of individual appliance decisions (paginated)
 *   "grouped" — decisions grouped by household, each expandable
 *
 * All data is derived from the existing `decisions` prop.
 * No additional API calls are made when switching modes.
 * All entries come from actual backend scheduler output — never hard-coded.
 */
import { useState, useMemo } from 'react'
import {
  CheckCircle, XCircle, ArrowRight, Zap, AlertTriangle,
  ChevronDown, ChevronUp, ChevronRight, Home,
} from 'lucide-react'

// ── Shared constants ──────────────────────────────────────────────────────

const CONSTRAINT_LABELS = {
  tariff:               { label: 'Cost opt.',   color: '#43D9A3' },
  transformer_capacity: { label: 'Transformer', color: '#F4B860' },
  sanctioned_load:      { label: 'Sanctioned',  color: '#58BFE8' },
  fixed:                { label: 'Fixed',        color: '#94A3B8' },
  infeasible:           { label: 'Infeasible',  color: '#F16C75' },
}

const PAGE_SIZE = 25

// ── Single appliance decision row ─────────────────────────────────────────

function DecisionRow({ d, index, indent }) {
  const { label: cLabel, color: cColor } =
    CONSTRAINT_LABELS[d.constraint] || { label: d.constraint, color: '#94A3B8' }
  const moved = d.prev_time !== d.new_time

  return (
    <div
      className="flex flex-col gap-1 py-2 border-b"
      style={{
        borderColor: 'rgba(148,163,184,0.07)',
        paddingLeft: indent ? '1.25rem' : 0,
        animationDelay: `${Math.min(index, 15) * 15}ms`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {d.passed_validation ? (
            <CheckCircle size={12} color="#43D9A3" className="flex-shrink-0" />
          ) : (
            <XCircle size={12} color="#F16C75" className="flex-shrink-0" />
          )}
          <span className="text-[0.72rem] font-medium text-[#EDF4F7] truncate">
            {indent ? d.appliance_name : `Home ${d.home_id + 1} · ${d.appliance_name}`}
          </span>
          {moved && (
            <div className="flex items-center gap-1 text-[0.63rem] flex-shrink-0">
              <span className="text-[#94A3B8] tabular-nums">{d.prev_time}</span>
              <ArrowRight size={10} color="#94A3B8" />
              <span className="tabular-nums font-semibold" style={{ color: '#43D9A3' }}>{d.new_time}</span>
            </div>
          )}
        </div>
        <span
          className="text-[0.58rem] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: `${cColor}18`, color: cColor, border: `1px solid ${cColor}22` }}
        >
          {cLabel}
        </span>
      </div>
      <p className="text-[0.63rem] text-[#94A3B8] leading-snug line-clamp-1" style={{ paddingLeft: '1.1rem' }}>
        {d.reason}
      </p>
    </div>
  )
}

// ── Grouped mode ──────────────────────────────────────────────────────────

function HomeGroup({ homeId, decisions, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)

  const total    = decisions.length
  const passed   = decisions.filter(d => d.passed_validation).length
  const failed   = total - passed
  const redirects = decisions.filter(d => d.constraint === 'transformer_capacity').length
  const infeasible = decisions.filter(d => d.constraint === 'infeasible').length

  return (
    <div className="border-b" style={{ borderColor: 'rgba(148,163,184,0.1)' }}>
      {/* Summary row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-[rgba(148,163,184,0.04)] transition-colors rounded"
        aria-expanded={open}
      >
        <Home size={12} color="#94A3B8" className="flex-shrink-0" />
        <span className="text-[0.72rem] font-semibold text-[#EDF4F7] flex-1">
          Home {homeId + 1}
        </span>

        {/* Concise status pills — only when non-trivial */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[0.62rem] tabular-nums text-[#94A3B8]">
            {total} {total === 1 ? 'appliance' : 'appliances'}
          </span>
          {passed > 0 && (
            <span className="text-[0.58rem] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(67,217,163,0.1)', color: '#43D9A3', border: '1px solid rgba(67,217,163,0.2)' }}>
              {passed} placed
            </span>
          )}
          {redirects > 0 && (
            <span className="text-[0.58rem] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(244,184,96,0.1)', color: '#F4B860', border: '1px solid rgba(244,184,96,0.2)' }}>
              {redirects} redirected
            </span>
          )}
          {infeasible > 0 && (
            <span className="text-[0.58rem] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(241,108,117,0.1)', color: '#F16C75', border: '1px solid rgba(241,108,117,0.2)' }}>
              {infeasible} shed
            </span>
          )}
        </div>

        {open
          ? <ChevronDown size={13} color="#94A3B8" className="flex-shrink-0" />
          : <ChevronRight size={13} color="#94A3B8" className="flex-shrink-0" />}
      </button>

      {/* Expanded appliance rows */}
      {open && (
        <div className="pb-1">
          {decisions.map((d, i) => (
            <DecisionRow
              key={`${d.appliance_name}-${i}`}
              d={d}
              index={i}
              indent
            />
          ))}
        </div>
      )}
    </div>
  )
}

function GroupedView({ decisions }) {
  // Group decisions by home_id, preserving original order within each group
  const groups = useMemo(() => {
    const map = new Map()
    for (const d of decisions) {
      if (!map.has(d.home_id)) map.set(d.home_id, [])
      map.get(d.home_id).push(d)
    }
    // Sort groups by home_id ascending for a consistent order
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [decisions])

  // Only auto-expand if there are few enough groups that it stays compact
  const defaultOpen = groups.length <= 5

  return (
    <div>
      {groups.map(([homeId, homeDecs]) => (
        <HomeGroup
          key={homeId}
          homeId={homeId}
          decisions={homeDecs}
          defaultOpen={defaultOpen}
        />
      ))}
    </div>
  )
}

// ── All-decisions flat view ───────────────────────────────────────────────

function AllView({ decisions }) {
  const [page, setPage] = useState(1)
  const visible = decisions.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < decisions.length

  return (
    <div>
      <div>
        {visible.map((d, i) => (
          <DecisionRow
            key={`${d.home_id}-${d.appliance_name}-${i}`}
            d={d}
            index={i}
            indent={false}
          />
        ))}
      </div>

      {decisions.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center gap-2">
          {hasMore ? (
            <button
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1.5 text-[0.7rem] text-[#94A3B8] hover:text-[#EDF4F7] transition-colors"
            >
              <ChevronDown size={13} />
              Show more ({decisions.length - visible.length} remaining)
            </button>
          ) : (
            <button
              onClick={() => setPage(1)}
              className="flex items-center gap-1.5 text-[0.7rem] text-[#94A3B8] hover:text-[#EDF4F7] transition-colors"
            >
              <ChevronUp size={13} />
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────

export function DecisionLog({ decisions, loading }) {
  const [mode, setMode] = useState('grouped') // 'grouped' | 'all'

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-10 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!decisions?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Zap size={24} color="#94A3B8" className="mb-2 opacity-40" />
        <p className="text-[#94A3B8] text-sm">No decisions yet.</p>
        <p className="text-[#94A3B8] text-xs mt-1">Run a simulation to see scheduling decisions.</p>
      </div>
    )
  }

  const transformerCount = decisions.filter(d => d.constraint === 'transformer_capacity').length
  const infeasibleCount  = decisions.filter(d => d.constraint === 'infeasible').length
  const homeCount        = new Set(decisions.map(d => d.home_id)).size

  return (
    <div>
      {/* Header: summary pills + mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {/* Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.65rem] text-[#94A3B8] tabular-nums">
            {decisions.length} decisions · {homeCount} homes
          </span>
          {transformerCount > 0 && (
            <span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(244,184,96,0.1)', color: '#F4B860', border: '1px solid rgba(244,184,96,0.2)' }}>
              {transformerCount} redirected
            </span>
          )}
          {infeasibleCount > 0 && (
            <span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(241,108,117,0.1)', color: '#F16C75', border: '1px solid rgba(241,108,117,0.2)' }}>
              {infeasibleCount} infeasible
            </span>
          )}
        </div>

        {/* Segmented view toggle */}
        <div
          className="flex rounded-lg p-0.5 flex-shrink-0"
          style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.12)' }}
          role="group"
          aria-label="Decision log view"
        >
          {[
            { id: 'grouped', label: 'By home' },
            { id: 'all',     label: 'All' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              aria-pressed={mode === opt.id}
              className="px-2.5 py-1 rounded-md text-[0.65rem] font-semibold transition-all"
              style={{
                background: mode === opt.id ? '#151F2A' : 'transparent',
                color:      mode === opt.id ? '#EDF4F7' : '#94A3B8',
                border:     mode === opt.id ? '1px solid rgba(148,163,184,0.18)' : '1px solid transparent',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* View */}
      {mode === 'grouped'
        ? <GroupedView decisions={decisions} />
        : <AllView decisions={decisions} />
      }
    </div>
  )
}
