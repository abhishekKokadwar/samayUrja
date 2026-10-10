/**
 * TransformerMap — SVG schematic neighbourhood map with fullscreen support.
 *
 * Shows homes (house SVG icons) connected to transformer nodes.
 * Transformers are coloured by utilization.
 * Clicking a transformer reveals its detail panel.
 * The Expand button opens a fullscreen overlay for readability at large scales.
 *
 * Layout is derived from simulation data — not a static decoration.
 * Transformer count, homes per transformer, and utilization all come from the backend.
 *
 * Colors:
 *   emerald  (<70%)  — safe
 *   amber    (70–90%) — approaching capacity
 *   red      (>90%)  — overloaded or critical
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Zap, Maximize2, X } from 'lucide-react'

function utilizationColor(pct) {
  if (pct > 90) return '#F16C75'
  if (pct > 70) return '#F4B860'
  return '#43D9A3'
}

function utilizationLabel(pct) {
  if (pct > 90) return 'Overloaded'
  if (pct > 70) return 'High load'
  return 'Safe'
}

/** SVG house icon — roof + body + door */
function HouseIcon({ x, y, size = 10, color = '#94A3B8', opacity = 0.75 }) {
  const w = size * 0.9
  const h = size
  return (
    <g transform={`translate(${x - w / 2},${y - h / 2})`} opacity={opacity}>
      <polygon points={`${w / 2},0 ${w},${h * 0.44} 0,${h * 0.44}`} fill={color} />
      <rect x={w * 0.1} y={h * 0.44} width={w * 0.8} height={h * 0.56} fill={color} rx={1} />
      <rect x={w * 0.37} y={h * 0.68} width={w * 0.26} height={h * 0.32}
        fill="rgba(8,13,18,0.55)" rx={1} />
    </g>
  )
}

/** SVG transformer circle node */
function TransformerNode({ x, y, transformer, strategy, selected, onClick, compact }) {
  const stData = transformer[strategy] || {}
  const util = stData.max_utilization_pct || 0
  const color = utilizationColor(util)
  const r = compact ? 14 : 18

  return (
    <g
      onClick={() => onClick(transformer.id)}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label={`Transformer ${transformer.id}, ${util.toFixed(0)}% utilized`}
    >
      {selected && (
        <circle cx={x} cy={y} r={r + 6} fill="none"
          stroke={color} strokeWidth={1} opacity={0.35} />
      )}
      <circle cx={x} cy={y} r={r}
        fill={selected ? `${color}1A` : '#101922'}
        stroke={color} strokeWidth={selected ? 2 : 1.5} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={compact ? 10 : 12} fill={color}>⚡</text>
      <text x={x} y={y + r + 11} textAnchor="middle"
        fontSize={compact ? 7 : 8.5} fill={color} fontWeight="600">
        {transformer.id}
      </text>
      <text x={x} y={y + r + 21} textAnchor="middle"
        fontSize={compact ? 6.5 : 7.5} fill={color} opacity={0.8}>
        {util.toFixed(0)}%
      </text>
    </g>
  )
}

function UtilizationBar({ pct }) {
  const color = utilizationColor(pct)
  return (
    <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(148,163,184,0.12)' }}>
      <div className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

function TransformerDetail({ transformer, strategy, onClose }) {
  if (!transformer) return null
  const stData = transformer[strategy] || {}
  const util = stData.max_utilization_pct || 0
  const color = utilizationColor(util)

  return (
    <div className="rounded-xl p-4 animate-fade-in mt-3"
      style={{ background: '#151F2A', border: `1px solid ${color}35` }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18` }}>
          <Zap size={13} color={color} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[#EDF4F7] text-sm">Transformer {transformer.id}</p>
          <p className="text-[0.65rem] text-[#94A3B8]">{transformer.n_homes} homes</p>
        </div>
        <span className="ml-auto text-[0.6rem] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: `${color}18`, color, border: `1px solid ${color}28` }}>
          {utilizationLabel(util)}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close transformer detail"
            className="btn-icon ml-1"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="space-y-2 text-xs">
        {[
          ['Rated capacity', `${transformer.capacity_kw} kW`, '#EDF4F7'],
          ['Peak load', stData.peak_load_kw != null ? `${stData.peak_load_kw.toFixed(1)} kW` : '—', color],
          ['Avg load', stData.avg_load_kw != null ? `${stData.avg_load_kw.toFixed(1)} kW` : '—', '#EDF4F7'],
          ['Peak utilization', `${util.toFixed(1)}%`, color],
          ['Overloaded slots', `${stData.overloaded_slots ?? 0} / 48`,
            stData.overloaded_slots > 0 ? '#F16C75' : '#43D9A3'],
        ].map(([label, val, valColor]) => (
          <div key={label} className="flex justify-between">
            <span className="text-[#94A3B8]">{label}</span>
            <span className="tabular-nums font-medium" style={{ color: valColor }}>{val}</span>
          </div>
        ))}
        <UtilizationBar pct={util} />
      </div>
    </div>
  )
}

/**
 * Build SVG positions for transformers and their home icons.
 * Adapts grid density based on available width and home count.
 */
function buildLayout(transformers, strategy, svgWidth = 320, maxHomes = 40) {
  const HOME_SIZE = 10
  const HOME_GAP = 3
  const COLS = 7
  const tY = 42

  const n = transformers.length
  if (n === 0) return { homeGroups: [], svgHeight: 80 }

  const tSpacing = svgWidth / (n + 1)

  let maxHomeRows = 0
  const homeGroups = transformers.map((t, ti) => {
    const tx = tSpacing * (ti + 1)
    const nHomes = Math.min(t.n_homes, maxHomes)
    const cols = Math.min(COLS, nHomes)
    const rows = Math.ceil(nHomes / cols)
    maxHomeRows = Math.max(maxHomeRows, rows)

    const util = t[strategy]?.max_utilization_pct || 0
    const color = utilizationColor(util)
    const homeW = cols * (HOME_SIZE + HOME_GAP)
    const startX = tx - homeW / 2

    const homes = Array.from({ length: nHomes }, (_, hi) => ({
      x: startX + (hi % cols) * (HOME_SIZE + HOME_GAP) + HOME_SIZE / 2,
      y: tY + 50 + Math.floor(hi / cols) * (HOME_SIZE + 3),
      color,
    }))

    return { transformer: t, tx, ty: tY, homes, color }
  })

  const svgHeight = tY + 50 + maxHomeRows * (HOME_SIZE + 3) + 20
  return { homeGroups, svgHeight }
}

/** Inner map SVG, used in both inline and fullscreen views */
function MapSVG({ homeGroups, svgHeight, svgWidth, selectedId, onNodeClick, strategy, compact }) {
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      style={{ minWidth: Math.min(220, svgWidth), display: 'block' }}
      role="img"
      aria-label="Schematic neighbourhood map. Synthetic simulation data."
    >
      {/* Subtle grid lines */}
      {Array.from({ length: 4 }, (_, i) => (
        <line key={i} x1={0} y1={i * 55} x2={svgWidth} y2={i * 55}
          stroke="rgba(148,163,184,0.04)" strokeWidth={1} />
      ))}

      {/* Connection lines: home → transformer */}
      {homeGroups.map(({ homes, tx, ty, color }) =>
        homes.map((h, hi) => (
          <line key={hi}
            x1={h.x} y1={h.y - 5}
            x2={tx} y2={ty + (compact ? 14 : 18)}
            stroke={color} strokeWidth={0.5} opacity={0.22} />
        ))
      )}

      {/* Home icons */}
      {homeGroups.map(({ homes }) =>
        homes.map((h, hi) => (
          <HouseIcon key={hi} x={h.x} y={h.y} size={compact ? 9 : 10} color={h.color} />
        ))
      )}

      {/* Transformer nodes — on top */}
      {homeGroups.map(({ transformer, tx, ty }) => (
        <TransformerNode
          key={transformer.id}
          x={tx} y={ty}
          transformer={transformer}
          strategy={strategy}
          selected={selectedId === transformer.id}
          onClick={onNodeClick}
          compact={compact}
        />
      ))}
    </svg>
  )
}

/** Legend row */
function MapLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {[
        { label: 'Safe (<70%)', color: '#43D9A3' },
        { label: 'High (70–90%)', color: '#F4B860' },
        { label: 'Overloaded (>90%)', color: '#F16C75' },
      ].map(s => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
          <span className="text-[0.62rem] text-[#94A3B8]">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

export function TransformerMap({ transformerSummary, strategy = 'coordinated', loading }) {
  const [selectedId, setSelectedId] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const overlayRef = useRef(null)

  const handleClick = useCallback((id) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const openFullscreen = useCallback(() => setFullscreen(true), [])
  const closeFullscreen = useCallback(() => setFullscreen(false), [])

  // Escape closes fullscreen
  useEffect(() => {
    if (!fullscreen) return
    const handler = (e) => { if (e.key === 'Escape') closeFullscreen() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [fullscreen, closeFullscreen])

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [fullscreen])

  // Inline layout — compact (max 30 homes shown per transformer for readability)
  const INLINE_SVG_W = 320
  const INLINE_MAX_HOMES = 24
  const { homeGroups: inlineGroups, svgHeight: inlineSvgH } = useMemo(
    () => buildLayout(transformerSummary || [], strategy, INLINE_SVG_W, INLINE_MAX_HOMES),
    [transformerSummary, strategy]
  )

  // Fullscreen layout — show more homes
  const FS_SVG_W = 700
  const FS_MAX_HOMES = 60
  const { homeGroups: fsGroups, svgHeight: fsSvgH } = useMemo(
    () => buildLayout(transformerSummary || [], strategy, FS_SVG_W, FS_MAX_HOMES),
    [transformerSummary, strategy]
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-36 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
      </div>
    )
  }

  if (!transformerSummary?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Zap size={24} color="#94A3B8" className="mb-2 opacity-40" />
        <p className="text-[#94A3B8] text-sm">Run a simulation to see the neighbourhood map.</p>
      </div>
    )
  }

  const selected = transformerSummary.find(t => t.id === selectedId) || null

  return (
    <>
      {/* ── Inline view ─────────────────────────────────────────── */}
      <div>
        <MapLegend />

        <div className="overflow-x-auto mt-3">
          <MapSVG
            homeGroups={inlineGroups}
            svgHeight={inlineSvgH}
            svgWidth={INLINE_SVG_W}
            selectedId={selectedId}
            onNodeClick={handleClick}
            strategy={strategy}
            compact={false}
          />
        </div>

        <p className="text-[0.6rem] text-[#94A3B8] mt-1">
          Up to {INLINE_MAX_HOMES} homes shown per transformer · Click a node for details
        </p>

        {selected && (
          <TransformerDetail
            transformer={selected}
            strategy={strategy}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* ── Fullscreen overlay ──────────────────────────────────── */}
      {fullscreen && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Transformer view fullscreen"
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: '#080D12' }}
          onClick={(e) => { if (e.target === overlayRef.current) closeFullscreen() }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b"
            style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
            <div className="flex items-center gap-3">
              <Zap size={16} color="#58BFE8" />
              <span className="text-sm font-semibold text-[#EDF4F7]">Transformer Health — Fullscreen</span>
              <span className="text-[0.65rem] text-[#94A3B8] capitalize">{strategy} strategy</span>
            </div>
            <button
              onClick={closeFullscreen}
              aria-label="Close transformer view"
              className="btn-icon"
              autoFocus
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="max-w-4xl mx-auto">
              <MapLegend />

              <div className="mt-4 overflow-x-auto">
                <MapSVG
                  homeGroups={fsGroups}
                  svgHeight={fsSvgH}
                  svgWidth={FS_SVG_W}
                  selectedId={selectedId}
                  onNodeClick={handleClick}
                  strategy={strategy}
                  compact={false}
                />
              </div>

              <p className="text-[0.65rem] text-[#94A3B8] mt-2">
                Up to {FS_MAX_HOMES} homes shown per transformer · Click a node for details
              </p>

              {/* Detail panel in fullscreen */}
              {selected ? (
                <TransformerDetail
                  transformer={selected}
                  strategy={strategy}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {transformerSummary.map(t => {
                    const stData = t[strategy] || {}
                    const util = stData.max_utilization_pct || 0
                    const color = utilizationColor(util)
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleClick(t.id)}
                        className="text-left rounded-xl p-4 transition-all hover:opacity-90"
                        style={{ background: '#101922', border: `1px solid ${color}30` }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-[#EDF4F7]">Transformer {t.id}</span>
                          <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: `${color}18`, color, border: `1px solid ${color}28` }}>
                            {utilizationLabel(util)}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[#94A3B8]">Homes</span>
                            <span className="text-[#EDF4F7] tabular-nums">{t.n_homes}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#94A3B8]">Peak load</span>
                            <span className="tabular-nums" style={{ color }}>
                              {stData.peak_load_kw != null ? `${stData.peak_load_kw.toFixed(1)} kW` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#94A3B8]">Utilization</span>
                            <span className="tabular-nums font-semibold" style={{ color }}>{util.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="mt-2 h-1 rounded-full" style={{ background: 'rgba(148,163,184,0.12)' }}>
                          <div className="h-1 rounded-full" style={{ width: `${Math.min(util, 100)}%`, background: color }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expand button — rendered in the parent card header via prop, but exposed here
          as a portal-friendly trigger so the parent just renders <TransformerMap> */}
      <div className="mt-2 flex justify-end">
        <button
          onClick={openFullscreen}
          aria-label="Expand transformer view"
          className="btn-icon"
          title="Expand transformer view"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </>
  )
}
