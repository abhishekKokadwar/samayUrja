/**
 * WeekGrid — 7-column × 48-row schedule grid.
 *
 * Columns: Mon – Sun
 * Rows: 00:00 – 24:00 (48 half-hour slots)
 * Background: tinted by tariff band
 * Blocks: solid colored run; faint outlined block = original position
 *
 * Scrolls vertically inside its own container.
 * Scrolls horizontally on narrow screens.
 */

import { useMemo } from 'react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SLOT_H_PX = 14  // pixels per half-hour slot
const COLORS = ['#FFFFFF', '#FFFFFF', '#F4B860', '#A3A3A3', '#F16C75', '#A3A3A3', '#A3A3A3']

function slotLabel(s) {
  const h = Math.floor(s / 2)
  const m = (s % 2) * 30
  if (h % 2 === 0 && m === 0) return `${String(h).padStart(2, '0')}:00`
  return ''
}

function getBandColor(slot, tariff) {
  if (!tariff) return 'transparent'
  const priceSlots = tariff.price_slots || []
  const carbonSlots = tariff.carbon_slots || []
  if (!priceSlots.length) return 'transparent'
  const price = priceSlots[slot] || 0
  const maxP = Math.max(...priceSlots)
  const minP = Math.min(...priceSlots)
  if (price >= maxP * 0.95) return 'rgba(241,108,117,0.06)'  // peak
  if (price <= minP * 1.05) return 'rgba(255,255,255,0.06)'   // solar/cheap
  return 'rgba(255,255,255,0.03)'                             // normal
}

export function WeekGrid({ runs, tariff }) {
  const appColors = useMemo(() => {
    const map = {}
    ;(runs || []).forEach((r, i) => {
      map[r.name] = COLORS[i % COLORS.length]
    })
    return map
  }, [runs])

  if (!runs || runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-center">
        <div>
          <p className="text-[#A3A3A3] text-sm">No schedule to display</p>
          <p className="text-[#A3A3A3] text-xs mt-1">Add appliances and run the optimizer.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 520 }}>
        {/* Header row */}
        <div className="flex" style={{ marginLeft: 36 }}>
          {DAYS.map(d => (
            <div key={d} className="flex-1 text-center text-xs text-[#A3A3A3] font-semibold pb-1.5">
              {d}
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="flex overflow-y-auto" style={{ maxHeight: 400 }}>
          {/* Time labels */}
          <div className="flex flex-col flex-shrink-0" style={{ width: 36 }}>
            {Array.from({ length: 48 }, (_, s) => (
              <div
                key={s}
                className="text-right pr-1.5 text-xs text-[#A3A3A3] leading-none"
                style={{ height: SLOT_H_PX, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
              >
                {slotLabel(s)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex-1 relative border-l" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {/* Slot backgrounds */}
              {Array.from({ length: 48 }, (_, s) => (
                <div
                  key={s}
                  style={{
                    height: SLOT_H_PX,
                    background: getBandColor(s, tariff),
                    borderBottom: s % 2 === 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}
                />
              ))}

              {/* Run blocks — positioned absolutely */}
              {runs.map(run => {
                if (!run.days.includes(dayIdx)) return null
                const color = appColors[run.name] || '#FFFFFF'

                // Original block (faint, outlined)
                const origSlot = run.current_start
                  ? parseInt(run.current_start.split(':')[0]) * 2 + (run.current_start.split(':')[1] === '30' ? 1 : 0)
                  : 0

                // New block (solid)
                const newSlot = run.new_start
                  ? parseInt(run.new_start.split(':')[0]) * 2 + (run.new_start.split(':')[1] === '30' ? 1 : 0)
                  : origSlot

                const n = run.duration_slots

                return (
                  <div key={run.name}>
                    {/* Original position (if moved) */}
                    {run.new_start !== run.current_start && (
                      <div
                        title={`${run.name} original: ${run.current_start}`}
                        style={{
                          position: 'absolute',
                          top: origSlot * SLOT_H_PX,
                          left: 1,
                          right: 1,
                          height: n * SLOT_H_PX,
                          border: `1px dashed ${color}60`,
                          borderRadius: 3,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    {/* Optimized position */}
                    <div
                      title={`${run.name}: ${run.new_start} (${run.duration_slots * 30} min)`}
                      style={{
                        position: 'absolute',
                        top: newSlot * SLOT_H_PX,
                        left: 1,
                        right: 1,
                        height: n * SLOT_H_PX,
                        background: color,
                        borderRadius: 3,
                        opacity: 0.88,
                        display: 'flex',
                        alignItems: 'flex-start',
                        overflow: 'hidden',
                      }}
                    >
                      {n >= 2 && (
                        <span
                          className="text-xs font-semibold truncate leading-tight"
                          style={{ color: '#000000', padding: '1px 3px' }}
                        >
                          {run.name.length > 8 ? run.name.split(' ')[0] : run.name}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 pl-9">
          {runs.map(run => (
            <div key={run.name} className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm" style={{ background: appColors[run.name] }} />
              <span className="text-xs text-[#A3A3A3]">{run.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm border border-dashed border-[#A3A3A3]" style={{ background: 'transparent' }} />
            <span className="text-xs text-[#A3A3A3]">Original position</span>
          </div>
        </div>
      </div>
    </div>
  )
}
