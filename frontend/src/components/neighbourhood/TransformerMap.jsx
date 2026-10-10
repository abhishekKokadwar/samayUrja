/**
 * TransformerMap — SVG schematic neighbourhood map.
 *
 * Shows homes (house SVG icons) connected to transformer nodes.
 * Transformers are coloured by utilization.
 * Clicking a transformer reveals its detail panel.
 *
 * Layout is derived from simulation data — not a static decoration.
 * Transformer count, homes per transformer, and utilization all come from the backend.
 *
 * Colors:
 *   emerald  (<70%)  — safe
 *   amber    (70–90%) — approaching capacity
 *   red      (>90%)  — overloaded or critical
 */
import { useState, useMemo } from 'react'
import { Zap } from 'lucide-react'

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
function HouseIcon({ x, y, size = 12, color = '#94A3B8', opacity = 0.75 }) {
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
function TransformerNode({ x, y, transformer, strategy, selected, onClick }) {
  const stData = transformer[strategy] || {}
  const util = stData.max_utilization_pct || 0
  const color = utilizationColor(util)
  const r = 18

  return (
    <g onClick={() => onClick(transformer.id)} style={{ cursor: 'pointer' }}>
      {selected && (
        <circle cx={x} cy={y} r={r + 7} fill="none"
          stroke={color} strokeWidth={1} opacity={0.35} />
      )}
      <circle cx={x} cy={y} r={r}
        fill={selected ? `${color}1A` : '#101922'}
        stroke={color} strokeWidth={selected ? 2 : 1.5} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fill={color}>⚡</text>
      <text x={x} y={y + r + 12} textAnchor="middle"
        fontSize={8.5} fill={color} fontWeight="600">
        {transformer.id}
      </text>
      <text x={x} y={y + r + 22} textAnchor="middle"
        fontSize={7.5} fill={color} opacity={0.8}>
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

function TransformerDetail({ transformer, strategy }) {
  if (!transformer) return null
  const stData = transformer[strategy] || {}
  const util = stData.max_utilization_pct || 0
  const color = utilizationColor(util)

  return (
    <div className="rounded-xl p-4 animate-fade-in mt-3"
      style={{ background: '#151F2A', border: `1px solid ${color}35` }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <Zap size={14} color={color} />
        </div>
        <div>
          <p className="font-semibold text-[#EDF4F7] text-sm">Transformer {transformer.id}</p>
          <p className="text-[0.68rem] text-[#94A3B8]">{transformer.n_homes} connected homes</p>
        </div>
        <span className="ml-auto text-[0.62rem] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${color}18`, color, border: `1px solid ${color}28` }}>
          {utilizationLabel(util)}
        </span>
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
 * Returns deterministic layout based on transformer array.
 */
function buildLayout(transformers, strategy) {
  const SVG_W = 320
  const HOME_SIZE = 11
  const HOME_GAP = 4
  const COLS = 8
  const tY = 38

  const n = transformers.length
  if (n === 0) return { homeGroups: [], svgHeight: 80 }

  const tSpacing = SVG_W / (n + 1)

  let maxHomeRows = 0
  const homeGroups = transformers.map((t, ti) => {
    const tx = tSpacing * (ti + 1)
    const nHomes = Math.min(t.n_homes, 40)
    const cols = Math.min(COLS, nHomes)
    const rows = Math.ceil(nHomes / cols)
    maxHomeRows = Math.max(maxHomeRows, rows)

    const util = t[strategy]?.max_utilization_pct || 0
    const color = utilizationColor(util)
    const homeW = cols * (HOME_SIZE + HOME_GAP)
    const startX = tx - homeW / 2

    const homes = Array.from({ length: nHomes }, (_, hi) => ({
      x: startX + (hi % cols) * (HOME_SIZE + HOME_GAP) + HOME_SIZE / 2,
      y: tY + 52 + Math.floor(hi / cols) * (HOME_SIZE + 4),
      color,
    }))

    return { transformer: t, tx, ty: tY, homes, color }
  })

  const svgHeight = tY + 52 + maxHomeRows * (HOME_SIZE + 4) + 18
  return { homeGroups, svgHeight }
}

export function TransformerMap({ transformerSummary, strategy = 'coordinated', loading }) {
  const [selectedId, setSelectedId] = useState(null)

  const { homeGroups, svgHeight } = useMemo(
    () => buildLayout(transformerSummary || [], strategy),
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
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Zap size={28} color="#94A3B8" className="mb-2 opacity-40" />
        <p className="text-[#94A3B8] text-sm">Run a simulation to see the neighbourhood map.</p>
      </div>
    )
  }

  const selected = transformerSummary.find(t => t.id === selectedId) || null
  const handleClick = (id) => setSelectedId(prev => prev === id ? null : id)

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {[
          { label: 'Safe (<70%)', color: '#43D9A3' },
          { label: 'High (70–90%)', color: '#F4B860' },
          { label: 'Overloaded (>90%)', color: '#F16C75' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-[0.62rem] text-[#94A3B8]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* SVG schematic map */}
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 320 ${svgHeight}`}
          style={{ minWidth: 220, display: 'block' }}
          role="img"
          aria-label="Schematic neighbourhood map. Synthetic simulation data.">

          {/* Grid lines */}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={i} x1={0} y1={i * 44} x2={320} y2={i * 44}
              stroke="rgba(148,163,184,0.04)" strokeWidth={1} />
          ))}

          {/* Home → transformer connection lines */}
          {homeGroups.map(({ homes, tx, ty, color }) =>
            homes.map((h, hi) => (
              <line key={hi}
                x1={h.x} y1={h.y - 5}
                x2={tx} y2={ty + 18}
                stroke={color} strokeWidth={0.5} opacity={0.28} />
            ))
          )}

          {/* Home icons */}
          {homeGroups.map(({ homes }) =>
            homes.map((h, hi) => (
              <HouseIcon key={hi} x={h.x} y={h.y} size={11} color={h.color} />
            ))
          )}

          {/* Transformer nodes — rendered last so they sit on top */}
          {homeGroups.map(({ transformer, tx, ty }) => (
            <TransformerNode
              key={transformer.id}
              x={tx} y={ty}
              transformer={transformer}
              strategy={strategy}
              selected={selectedId === transformer.id}
              onClick={handleClick}
            />
          ))}
        </svg>
      </div>

      <p className="text-[0.6rem] text-[#94A3B8] mt-1">
        Up to 40 homes shown per transformer. Click a node for details.
      </p>

      {/* Detail panel */}
      {selected && <TransformerDetail transformer={selected} strategy={strategy} />}
    </div>
  )
}
