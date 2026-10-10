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
  tariff:               { label: 'Cheapest time',     color: '#FFFFFF' },
  transformer_capacity: { label: 'Transformer limit', color: '#F4B860' },
  sanctioned_load:      { label: 'Home load limit',   color: '#F4B860' },
  fixed:                { label: 'Never shifted',     color: '#A3A3A3' },
  infeasible:           { label: 'Not scheduled',     color: '#F16C75' },
}

const PAGE_SIZE = 10

// ── Single appliance decision row ─────────────────────────────────────────

function DecisionRow({ d, index, indent }) {
  const { label: cLabel, color: cColor } =
    CONSTRAINT_LABELS[d.constraint] || { label: d.constraint, color: '#A3A3A3' }
  const moved = d.prev_time !== d.new_time

  return (
    <div
      className="flex flex-col gap-1 py-2 border-b"
      style={{
        borderColor: 'rgba(255,255,255,0.07)',
        paddingLeft: indent ? '1.25rem' : 0,
        animationDelay: `${Math.min(index, 15) * 15}ms`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {d.passed_validation ? (
            <CheckCircle size={12} color="#FFFFFF" className="flex-shrink-0" />
          ) : (
            <XCircle size={12} color="#F16C75" className="flex-shrink-0" />
          )}
          <span className="text-xs font-medium text-[#FFFFFF] truncate">
            {indent ? d.appliance_name : `Home ${d.home_id + 1} · ${d.appliance_name}`}
          </span>
          {moved && (
            <div className="flex items-center gap-1 text-xs flex-shrink-0">
              <span className="text-[#A3A3A3] tabular-nums">{d.prev_time}</span>
              <ArrowRight size={10} color="#A3A3A3" />
              <span className="tabular-nums font-semibold" style={{ color: '#FFFFFF' }}>{d.new_time}</span>
            </div>
          )}
        </div>
        <span
          className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: `${cColor}18`, color: cColor, border: `1px solid ${cColor}22` }}
        >
          {cLabel}
        </span>
      </div>
      <p className="text-xs text-[#A3A3A3] leading-snug line-clamp-2" style={{ paddingLeft: '1.1rem' }}>
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
    <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
      {/* Summary row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-[rgba(255,255,255,0.04)] transition-colors rounded"
        aria-expanded={open}
      >
        <Home size={12} color="#A3A3A3" className="flex-shrink-0" />
        <span className="text-xs font-semibold text-[#FFFFFF] flex-1">
          Home {homeId + 1}
        </span>

        {/* Concise status pills — only when non-trivial */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs tabular-nums text-[#A3A3A3]">
            {total} {total === 1 ? 'appliance' : 'appliances'}
          </span>
          {passed > 0 && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>
              {passed} placed
            </span>
          )}
          {redirects > 0 && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(244,184,96,0.1)', color: '#F4B860', border: '1px solid rgba(244,184,96,0.2)' }}>
              {redirects} redirected
            </span>
          )}
          {infeasible > 0 && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(241,108,117,0.1)', color: '#F16C75', border: '1px solid rgba(241,108,117,0.2)' }}>
              {infeasible} shed
            </span>
          )}
        </div>

        {open
          ? <ChevronDown size={13} color="#A3A3A3" className="flex-shrink-0" />
          : <ChevronRight size={13} color="#A3A3A3" className="flex-shrink-0" />}
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
              className="flex items-center gap-1.5 text-xs text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors"
            >
              <ChevronDown size={13} />
              Show more ({decisions.length - visible.length} remaining)
            </button>
          ) : (
            <button
              onClick={() => setPage(1)}
              className="flex items-center gap-1.5 text-xs text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors"
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

// A decision counts as limited when a transformer or home limit shaped it,
// or when it could not be scheduled at all.
const isLimited = d =>
  !d.passed_validation || d.constraint === 'transformer_capacity' || d.constraint === 'sanctioned_load'

export function DecisionLog({ decisions, summary, loading }) {
  const [mode, setMode] = useState('all') // 'grouped' | 'all'
  const [onlyLimited, setOnlyLimited] = useState(false)

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
        <Zap size={24} color="#A3A3A3" className="mb-2 opacity-40" />
        <p className="text-[#A3A3A3] text-sm">No decisions yet.</p>
        <p className="text-[#A3A3A3] text-xs mt-1">Run a simulation to see scheduling decisions.</p>
      </div>
    )
  }

  const shown = onlyLimited ? decisions.filter(isLimited) : decisions
  const limitedCount = decisions.filter(isLimited).length
  const n = v => Number(v ?? 0).toLocaleString('en-IN')

  return (
    <div>
      {/* Summary of every decision, not only the sample listed below */}
      {summary?.total > 0 && (
        <p className="text-sm text-[#FFFFFF] mb-1">
          <span className="font-semibold">{n(summary.moved)}</span> moved to a better time ·{' '}
          <span className="font-semibold">{n(summary.unchanged)}</span> already at the best time ·{' '}
          <span className="font-semibold">{n(summary.fixed)}</span> never shifted (air conditioners) ·{' '}
          <span className="font-semibold" style={{ color: summary.redirected > 0 ? '#F4B860' : undefined }}>
            {n(summary.redirected)}
          </span>{' '}redirected by a limit ·{' '}
          <span className="font-semibold" style={{ color: summary.unplaced > 0 ? '#F16C75' : undefined }}>
            {n(summary.unplaced)}
          </span>{' '}could not be scheduled
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-[#A3A3A3] tabular-nums">
            Showing a sample of {decisions.length}
            {summary?.total ? ` of ${n(summary.total)}` : ''} decisions
          </span>
          <label className="flex items-center gap-1.5 text-xs text-[#A3A3A3] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyLimited}
              onChange={e => setOnlyLimited(e.target.checked)}
              className="accent-[#FFFFFF]"
            />
            Only those shaped by a limit ({limitedCount})
          </label>
        </div>

        {/* Segmented view toggle */}
        <div
          className="flex rounded-lg p-0.5 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
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
              className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
              style={{
                background: mode === opt.id ? '#141414' : 'transparent',
                color:      mode === opt.id ? '#FFFFFF' : '#A3A3A3',
                border:     mode === opt.id ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* View */}
      {shown.length === 0 ? (
        <p className="text-sm text-[#A3A3A3] py-3">
          No decision in this sample was shaped by a transformer or home load limit.
        </p>
      ) : mode === 'grouped'
        ? <GroupedView decisions={shown} />
        : <AllView decisions={shown} />
      }
    </div>
  )
}
