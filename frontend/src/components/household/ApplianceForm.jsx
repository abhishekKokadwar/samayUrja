/**
 * ApplianceForm — Add/edit appliances for the household optimizer.
 *
 * Displays quick-add template buttons and a list of current appliances
 * with edit-in-place rows.
 */
import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { APPLIANCE_TEMPLATES } from '../../sample.js'

const TEMPLATE_ICONS = {
  'EV charger': '⚡',
  'Geyser': '🚿',
  'Air conditioner': '❄️',
  'Washing machine': '🌀',
  'Dishwasher': '🍽️',
  'Water pump': '💧',
}

function TimeInput({ id, value, onChange, label }) {
  // Only allow HH:00 or HH:30 values
  const steps = []
  for (let h = 0; h < 24; h++) {
    steps.push(`${String(h).padStart(2, '0')}:00`)
    steps.push(`${String(h).padStart(2, '0')}:30`)
  }
  return (
    <div>
      <label className="form-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="form-input text-xs"
        style={{ paddingTop: 6, paddingBottom: 6 }}
      >
        {steps.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  )
}

function ApplianceRow({ app, index, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  const set = (key, val) => onChange(index, { ...app, [key]: val })

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: '#151F2A', border: '1px solid rgba(148,163,184,0.12)' }}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center gap-2 text-left"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${app.name}`}
        >
          <span className="text-sm">{TEMPLATE_ICONS[app.name] || '🔌'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.8rem] font-medium text-[#EDF4F7] truncate">{app.name}</p>
            <p className="text-[0.65rem] text-[#94A3B8] tabular-nums">
              {app.power_kw} kW · {app.duration_min} min · {app.days_per_week}d/wk · starts {app.current_start}
            </p>
          </div>
          {expanded
            ? <ChevronUp size={14} color="#94A3B8" className="flex-shrink-0" />
            : <ChevronDown size={14} color="#94A3B8" className="flex-shrink-0" />
          }
        </button>
        <button
          onClick={() => onDelete(index)}
          className="btn-icon text-[#F16C75] hover:bg-[rgba(241,108,117,0.1)]"
          aria-label={`Remove ${app.name}`}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-3 border-t" style={{ borderColor: 'rgba(148,163,184,0.1)' }}>
          <div>
            <label className="form-label" htmlFor={`name-${index}`}>Name</label>
            <input id={`name-${index}`} className="form-input" value={app.name}
              onChange={e => set('name', e.target.value)} maxLength={50} />
          </div>
          <div>
            <label className="form-label" htmlFor={`power-${index}`}>Power (kW)</label>
            <input id={`power-${index}`} className="form-input" type="number" min={0.05} max={25} step={0.1}
              value={app.power_kw} onChange={e => set('power_kw', parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="form-label" htmlFor={`dur-${index}`}>Duration (min)</label>
            <select id={`dur-${index}`} className="form-input"
              value={app.duration_min} onChange={e => set('duration_min', parseInt(e.target.value))}>
              {[30, 60, 90, 120, 150, 180, 240, 300, 360, 480].map(d =>
                <option key={d} value={d}>{d} min</option>
              )}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor={`days-${index}`}>Days / week</label>
            <select id={`days-${index}`} className="form-input"
              value={app.days_per_week} onChange={e => set('days_per_week', parseInt(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map(d =>
                <option key={d} value={d}>{d}</option>
              )}
            </select>
          </div>
          <TimeInput id={`start-${index}`} label="Usually starts" value={app.current_start}
            onChange={v => set('current_start', v)} />
          <TimeInput id={`early-${index}`} label="Earliest start" value={app.earliest_start}
            onChange={v => set('earliest_start', v)} />
          <TimeInput id={`end-${index}`} label="Latest finish" value={app.latest_end}
            onChange={v => set('latest_end', v)} />
          <div className="flex items-center gap-2 pt-4">
            <input id={`shift-${index}`} type="checkbox" checked={app.shiftable}
              onChange={e => set('shiftable', e.target.checked)} className="accent-[#43D9A3]" />
            <label htmlFor={`shift-${index}`} className="text-xs text-[#94A3B8] cursor-pointer">
              Can be shifted
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export function ApplianceForm({ appliances, onChange }) {
  const addTemplate = (template) => {
    onChange([...appliances, { ...template }])
  }

  const updateAppliance = (index, updated) => {
    const next = [...appliances]
    next[index] = updated
    onChange(next)
  }

  const deleteAppliance = (index) => {
    onChange(appliances.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      {/* Template chips */}
      <div>
        <p className="form-label mb-2">Quick add</p>
        <div className="flex flex-wrap gap-2">
          {APPLIANCE_TEMPLATES.map(t => (
            <button
              key={t.name}
              onClick={() => addTemplate(t)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'rgba(67,217,163,0.06)',
                border: '1px solid rgba(67,217,163,0.18)',
                color: '#43D9A3',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(67,217,163,0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(67,217,163,0.06)' }}
            >
              <span>{TEMPLATE_ICONS[t.name] || '🔌'}</span>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Appliance list */}
      {appliances.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-8 rounded-xl text-center"
          style={{ border: '1px dashed rgba(148,163,184,0.2)' }}
        >
          <Plus size={24} color="#94A3B8" className="mb-2 opacity-50" />
          <p className="text-[#94A3B8] text-sm">No appliances yet</p>
          <p className="text-[#94A3B8] text-xs mt-1">Use the quick-add buttons above or add manually.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appliances.map((app, i) => (
            <ApplianceRow
              key={i}
              app={app}
              index={i}
              onChange={updateAppliance}
              onDelete={deleteAppliance}
            />
          ))}
        </div>
      )}
    </div>
  )
}
