/**
 * ScenarioControls — Neighbourhood simulation configuration panel.
 *
 * Sliders and inputs for all scenario parameters.
 * Simulation only runs when user clicks "Run Simulation" (not on every slider change).
 */
import { useState, useEffect } from 'react'
import { Play, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'

const DEFAULT_SCENARIO = {
  n_homes: 100,
  n_transformers: 5,
  transformer_capacity_kw: 200,
  ev_adoption_rate: 0.30,
  ac_adoption_rate: 0.40,
  geyser_adoption_rate: 0.70,
  solar_adoption_rate: 0.10,
  tariff_id: 'tod-domestic-illustrative',
  sanctioned_load_kw: 5,
  seed: 42,
}

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
        <label className="text-xs text-[#94A3B8] font-medium" htmlFor={`slider-${name}`}>
          {label}
        </label>
        <div className="flex items-center justify-end">
          <input
            type="number"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className="text-xs font-semibold tabular-nums text-right bg-transparent border border-transparent hover:border-[rgba(67,217,163,0.3)] focus:border-[#43D9A3] focus:bg-[#151F2A] focus:outline-none rounded px-1 py-0.5 transition-all no-spinners"
            style={{ color: '#43D9A3', width: '3.5rem', MozAppearance: 'textfield' }}
          />
          {unit.label && (
            <span className="text-xs font-semibold ml-0.5" style={{ color: '#43D9A3' }}>
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
        style={{ accentColor: '#43D9A3' }}
        aria-label={label}
      />
      <div className="flex justify-between text-[0.6rem] text-[#94A3B8]">
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

export function ScenarioControls({ onRun, loading }) {
  const [params, setParams] = useState(DEFAULT_SCENARIO)
  const [open, setOpen] = useState(true)

  const set = (name, val) => setParams(prev => ({ ...prev, [name]: val }))

  const reset = () => setParams(DEFAULT_SCENARIO)

  const handleRun = () => onRun(params)

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.14)' }}
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
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#151F2A] transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[#EDF4F7]">Scenario Controls</span>
        {open ? <ChevronDown size={15} color="#94A3B8" /> : <ChevronRight size={15} color="#94A3B8" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 animate-fade-in">
          {/* Population */}
          <section>
            <p className="text-[0.65rem] text-[#94A3B8] uppercase tracking-wider font-semibold mb-3">
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
            <p className="text-[0.65rem] text-[#94A3B8] uppercase tracking-wider font-semibold mb-3">
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
            <p className="text-[0.65rem] text-[#94A3B8] uppercase tracking-wider font-semibold mb-2">
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
                    className="accent-[#43D9A3]"
                  />
                  <span className={`text-xs ${params.tariff_id === t.id ? 'text-[#43D9A3] font-medium' : 'text-[#94A3B8]'}`}>
                    {t.label}
                  </span>
                </label>
              ))}
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

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleRun}
              disabled={loading}
              className="btn-primary flex-1 justify-center"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-[#080D12] border-t-transparent rounded-full animate-spin" />
                  Simulating…
                </>
              ) : (
                <>
                  <Play size={14} />
                  Run Simulation
                </>
              )}
            </button>
            <button onClick={reset} className="btn-secondary" title="Reset to defaults" disabled={loading}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

