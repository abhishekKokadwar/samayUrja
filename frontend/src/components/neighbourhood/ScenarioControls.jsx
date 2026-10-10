/**
 * ScenarioControls — Neighbourhood simulation configuration panel.
 *
 * Presets for the common cases, with every individual control under "Advanced".
 * The page owns the parameters and reruns the simulation whenever they change.
 */
import { useState, useEffect } from 'react'
import { RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'

export const DEFAULT_SCENARIO = {
  n_homes: 500,
  n_transformers: 5,
  transformer_capacity_kw: 200,
  ev_adoption_rate: 0.30,
  ac_adoption_rate: 0.40,
  geyser_adoption_rate: 0.70,
  solar_adoption_rate: 0.10,
  tariff_id: 'tod-ev-illustrative',
  sanctioned_load_kw: 5,
  seed: 42,
}

// Each preset is the default scenario with a few values changed.
export const PRESETS = [
  { id: 'today', label: 'Today', hint: 'Flat tariff, 10% of homes own an EV',
    params: { tariff_id: 'flat-domestic-illustrative', ev_adoption_rate: 0.10 } },
  { id: 'ev-tariff', label: 'EV night tariff', hint: 'Cheap power after midnight, 30% EVs',
    params: {} },
  { id: 'high-ev', label: 'High EV adoption', hint: 'EV night tariff, 60% EVs',
    params: { ev_adoption_rate: 0.60 } },
  { id: 'day-tod', label: 'Daytime ToD tariff', hint: 'Cheap solar hours, costly evenings',
    params: { tariff_id: 'tod-domestic-illustrative' } },
  { id: 'flat', label: 'Flat tariff', hint: 'Same price all day, 30% EVs',
    params: { tariff_id: 'flat-domestic-illustrative' } },
]

export const presetParams = preset => ({ ...DEFAULT_SCENARIO, ...preset.params })

// The preset whose values match the current parameters exactly, if any.
export const activePresetId = params =>
  PRESETS.find(p => {
    const target = presetParams(p)
    return Object.keys(target).every(k => target[k] === params[k]) && !params.enable_load_shedding
  })?.id ?? null

const UNIT_PCT = { type: 'pct', label: '%' }
const UNIT_KW = { type: 'kw', label: 'kW' }
const UNIT_NONE = { type: 'none', label: '' }

function SliderRow({ label, name, value, min, max, step, unit = UNIT_NONE, onChange }) {
  const isPct = unit.type === 'pct';
  const displayMin = isPct ? Math.round(min * 100) : min;
  const displayMax = isPct ? Math.round(max * 100) : max;
  
  const [inputValue, setInputValue] = useState(() => isPct ? Math.round(value * 100) : value)

  useEffect(() => {
    setInputValue(isPct ? Math.round(value * 100) : value)
  }, [value, isPct])

  const handleInputChange = (e) => {
    setInputValue(e.target.value)
    const parsed = parseFloat(e.target.value)
    if (!isNaN(parsed)) {
      let raw = isPct ? parsed / 100 : parsed
      onChange(name, raw)
    }
  }

  const handleInputBlur = () => {
    let parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      parsed = isPct ? Math.round(value * 100) : value;
    } else {
      // Clamp to min/max
      if (parsed < displayMin) parsed = displayMin;
      if (parsed > displayMax) parsed = displayMax;
    }
    setInputValue(parsed);
    let raw = isPct ? parsed / 100 : parsed;
    onChange(name, raw);
  }

  const handleSliderChange = (e) => {
    const val = parseFloat(e.target.value)
    setInputValue(val)
    let raw = isPct ? val / 100 : val
    onChange(name, raw)
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs text-[#A3A3A3] font-medium" htmlFor={`slider-${name}`}>
          {label}
        </label>
        <div className="flex items-center justify-end">
          <input
            type="number"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className="text-xs font-semibold tabular-nums text-right bg-transparent border border-transparent hover:border-[rgba(255,255,255,0.3)] focus:border-[#FFFFFF] focus:bg-[#141414] focus:outline-none rounded px-1 py-0.5 transition-all no-spinners"
            style={{ color: '#FFFFFF', width: '3.5rem', MozAppearance: 'textfield' }}
          />
          {unit.label && (
            <span className="text-xs font-semibold ml-0.5" style={{ color: '#FFFFFF' }}>
              {unit.label}
            </span>
          )}
        </div>
      </div>
      <input
        id={`slider-${name}`}
        type="range"
        min={displayMin}
        max={displayMax}
        step={isPct ? step * 100 : step}
        value={isPct ? Math.round(value * 100) : value}
        onChange={handleSliderChange}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: '#FFFFFF' }}
        aria-label={label}
      />
      <div className="flex justify-between text-xs text-[#A3A3A3]">
        <span>{displayMin}{unit.label && ` ${unit.label}`}</span>
        <span>{displayMax}{unit.label && ` ${unit.label}`}</span>
      </div>
    </div>
  )
}

const TARIFF_OPTIONS = [
  { id: 'tod-domestic-illustrative', label: 'ToD Domestic' },
  { id: 'tod-ev-illustrative', label: 'ToD EV Charging' },
  { id: 'flat-domestic-illustrative', label: 'Flat Rate' },
]

export function ScenarioControls({ params, onChange }) {
  const [open, setOpen] = useState(false)

  const set = (name, val) => onChange({ ...params, [name]: val })

  const reset = () => onChange(DEFAULT_SCENARIO)

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.14)' }}
    >
      <style>{`
        .no-spinners::-webkit-inner-spin-button,
        .no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
      
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#141414] transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[#FFFFFF]">Advanced controls</span>
        {open ? <ChevronDown size={15} color="#A3A3A3" /> : <ChevronRight size={15} color="#A3A3A3" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 animate-fade-in">
          {/* Population */}
          <section>
            <p className="text-xs text-[#A3A3A3] uppercase tracking-wider font-semibold mb-3">
              Population
            </p>
            <div className="space-y-4">
              <SliderRow label="Number of homes" name="n_homes" value={params.n_homes}
                min={20} max={500} step={10} onChange={set} />
              <SliderRow label="Number of transformers" name="n_transformers" value={params.n_transformers}
                min={1} max={25} step={1} onChange={set} />
              <SliderRow label="Transformer capacity" name="transformer_capacity_kw"
                value={params.transformer_capacity_kw} min={50} max={1000} step={50}
                unit={UNIT_KW} onChange={set} />
              <SliderRow label="Sanctioned load / home" name="sanctioned_load_kw"
                value={params.sanctioned_load_kw} min={2} max={15} step={0.5}
                unit={UNIT_KW} onChange={set} />
            </div>
          </section>

          {/* Adoption rates */}
          <section>
            <p className="text-xs text-[#A3A3A3] uppercase tracking-wider font-semibold mb-3">
              Adoption Rates
            </p>
            <div className="space-y-4">
              <SliderRow label="EV adoption" name="ev_adoption_rate" value={params.ev_adoption_rate}
                min={0} max={1} step={0.05} unit={UNIT_PCT} onChange={set} />
              <SliderRow label="AC adoption" name="ac_adoption_rate" value={params.ac_adoption_rate}
                min={0} max={1} step={0.05} unit={UNIT_PCT} onChange={set} />
              <SliderRow label="Geyser adoption" name="geyser_adoption_rate" value={params.geyser_adoption_rate}
                min={0} max={1} step={0.05} unit={UNIT_PCT} onChange={set} />
              <SliderRow label="Rooftop solar" name="solar_adoption_rate" value={params.solar_adoption_rate}
                min={0} max={1} step={0.05} unit={UNIT_PCT} onChange={set} />
            </div>
          </section>

          {/* Tariff */}
          <section>
            <p className="text-xs text-[#A3A3A3] uppercase tracking-wider font-semibold mb-2">
              Tariff
            </p>
            <div className="space-y-1.5">
              {TARIFF_OPTIONS.map(t => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tariff_id"
                    value={t.id}
                    checked={params.tariff_id === t.id}
                    onChange={() => set('tariff_id', t.id)}
                    className="accent-[#FFFFFF]"
                  />
                  <span className={`text-xs ${params.tariff_id === t.id ? 'text-[#FFFFFF] font-medium' : 'text-[#A3A3A3]'}`}>
                    {t.label}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Constraints */}
          <section>
            <p className="text-xs text-[#A3A3A3] uppercase tracking-wider font-semibold mb-2">
              Constraints
            </p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.enable_load_shedding || false}
                  onChange={(e) => set('enable_load_shedding', e.target.checked)}
                  className="accent-[#FFFFFF]"
                />
                <span className={`text-xs ${params.enable_load_shedding ? 'text-[#FFFFFF] font-medium' : 'text-[#A3A3A3]'}`}>
                  Strict Capacity Limits (Load Shedding)
                </span>
              </label>
            </div>
          </section>

          {/* Seed */}
          <div>
            <label className="form-label" htmlFor="seed-input">Random seed (reproducibility)</label>
            <input
              id="seed-input"
              type="number"
              min={0} max={999999}
              value={params.seed}
              onChange={e => set('seed', parseInt(e.target.value) || 0)}
              className="form-input"
            />
          </div>

          <button onClick={reset} className="btn-secondary" title="Reset to defaults">
            <RotateCcw size={14} />
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  )
}

