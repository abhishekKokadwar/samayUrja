/**
 * HouseholdPage — single-household appliance optimizer.
 *
 * Layout:
 *   Left column (lg:col-span-2): Profile settings + appliance editor
 *   Right column (lg:col-span-3): KPIs + analytics (demand, tariff, energy, log) + weekly grid
 *
 * Household ID stored in ?h= URL parameter for shareable links.
 * Profile can be saved to/loaded from DynamoDB (when backend is configured).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Home, Settings2, Zap, Save, Link, RefreshCw, AlertTriangle, CheckCircle,
  Calendar,
} from 'lucide-react'
import { ApplianceForm } from '../components/household/ApplianceForm.jsx'
import { WeekGrid } from '../components/household/WeekGrid.jsx'
import { SavingsPanel } from '../components/household/SavingsPanel.jsx'
import { api } from '../api.js'
import { SAMPLE_PROFILE } from '../sample.js'

const TARIFF_OPTIONS = [
  { id: 'tod-domestic-illustrative', label: 'ToD Domestic (Illustrative)' },
  { id: 'tod-ev-illustrative',       label: 'ToD EV Charging (Illustrative)' },
  { id: 'flat-domestic-illustrative', label: 'Flat Rate (Illustrative)' },
]

function getHouseholdId() {
  const params = new URLSearchParams(window.location.search)
  return params.get('h')
}

function setHouseholdId(id) {
  const url = new URL(window.location.href)
  url.searchParams.set('h', id)
  window.history.replaceState({}, '', url.toString())
}

function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ loading, error, result }) {
  const status = loading ? 'optimizing' : error ? 'error' : result ? 'ready' : 'idle'
  const cfg = {
    optimizing: { label: 'Optimizing…', bg: 'rgba(244,184,96,0.1)',  fg: '#F4B860', dot: '#F4B860'  },
    error:      { label: 'Error',       bg: 'rgba(241,108,117,0.1)', fg: '#F16C75', dot: '#F16C75'  },
    ready:      { label: 'Ready',       bg: 'rgba(67,217,163,0.08)', fg: '#43D9A3', dot: '#43D9A3'  },
    idle:       { label: 'Idle',        bg: 'rgba(148,163,184,0.06)',fg: '#94A3B8', dot: '#94A3B8'  },
  }[status]

  return (
    <span className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5"
      style={{ background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.dot}30` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HouseholdPage() {
  const [profile, setProfile] = useState({
    tariff_id: SAMPLE_PROFILE.tariff_id,
    sanctioned_load_kw: SAMPLE_PROFILE.sanctioned_load_kw,
    appliances: [...SAMPLE_PROFILE.appliances],
  })
  const [tariff, setTariff]         = useState(null)
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved' | 'error' | 'copied'
  const [error, setError]           = useState(null)
  const [gridOpen, setGridOpen]     = useState(false)
  const debounceRef = useRef(null)

  // Load tariff data whenever tariff_id changes
  useEffect(() => {
    api.getTariffs()
      .then(tariffs => {
        const t = tariffs.find(t => t.id === profile.tariff_id)
        if (t) setTariff(t)
      })
      .catch(() => {})
  }, [profile.tariff_id])

  // Auto-optimize on mount; also load saved household if ?h= present
  useEffect(() => {
    const hid = getHouseholdId()
    if (hid) {
      loadHousehold(hid)
    } else {
      runOptimize(profile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runOptimize = useCallback(async (p) => {
    if (!p.appliances.length) { setResult(null); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.optimize(p)
      setResult(res)
    } catch (err) {
      setError(err.message || 'Optimization failed — is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce: re-optimize 800 ms after last change
  const scheduleOptimize = useCallback((p) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runOptimize(p), 800)
  }, [runOptimize])

  const updateProfile = (key, val) => {
    const next = { ...profile, [key]: val }
    setProfile(next)
    scheduleOptimize(next)
  }

  const updateAppliances = (apps) => {
    const next = { ...profile, appliances: apps }
    setProfile(next)
    scheduleOptimize(next)
  }

  const saveProfile = async () => {
    setSaveStatus('saving')
    let hid = getHouseholdId()
    if (!hid) {
      hid = generateUUID()
      setHouseholdId(hid)
    }
    try {
      await api.saveHousehold(hid, profile)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(null), 4000)
    }
  }

  const loadHousehold = async (hid) => {
    setError(null)
    setLoading(true)
    try {
      const item = await api.loadHousehold(hid)
      if (item?.profile) {
        setProfile(item.profile)
        runOptimize(item.profile)
      } else {
        setError('Saved profile not found.')
        setLoading(false)
      }
    } catch (err) {
      setError(err.message || 'Failed to load saved profile.')
      setResult(null)
      setLoading(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => setSaveStatus('copied'))
      .catch(() => {})
    setTimeout(() => setSaveStatus(null), 2000)
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1600px] mx-auto">

      {/* ── A. Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-bold text-[#EDF4F7] tracking-tight flex-shrink-0">
            Household Energy
          </h1>
          <StatusPill loading={loading} error={error} result={result} />
          {result && !loading && (
            <span className="text-[0.65rem] text-[#94A3B8] tabular-nums hidden sm:inline">
              {profile.appliances.length} appliance{profile.appliances.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0 ml-auto">
          <button
            onClick={saveProfile}
            disabled={saveStatus === 'saving'}
            className="btn-secondary text-xs"
            title="Save profile"
          >
            <Save size={13} />
            {saveStatus === 'saving' ? 'Saving…'
              : saveStatus === 'saved'  ? 'Saved!'
              : saveStatus === 'error'  ? 'Error'
              : saveStatus === 'copied' ? 'Copied!'
              : 'Save'}
          </button>
          <button onClick={copyLink} className="btn-secondary text-xs" title="Copy shareable link">
            <Link size={13} />
          </button>
          <button
            onClick={() => runOptimize(profile)}
            disabled={loading}
            className="btn-primary text-xs"
          >
            {loading ? (
              <span className="w-3 h-3 border-2 border-[#080D12] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Zap size={13} />
            )}
            Optimize
          </button>
        </div>
      </div>

      {/* Optimization or Load error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: 'rgba(241,108,117,0.08)', border: '1px solid rgba(241,108,117,0.2)' }}>
          <AlertTriangle size={14} color="#F16C75" className="flex-shrink-0" />
          <span className="text-[#F16C75] text-xs">{error}</span>
          <button onClick={() => runOptimize(profile)} className="btn-icon ml-auto flex-shrink-0" title="Retry">
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {/* ── B. Configuration Area (Top) ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Profile settings */}
        <div className="card lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 size={14} color="#58BFE8" />
            <h2 className="text-sm font-semibold text-[#EDF4F7]">Profile Settings</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="form-label" htmlFor="tariff-select">Electricity tariff</label>
              <select
                id="tariff-select"
                className="form-input"
                value={profile.tariff_id}
                onChange={e => updateProfile('tariff_id', e.target.value)}
              >
                {TARIFF_OPTIONS.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <p className="text-[0.63rem] text-[#94A3B8] mt-1">
                Illustrative tariff — not a real DISCOM tariff.
              </p>
            </div>
            <div>
              <label className="form-label" htmlFor="load-input">Sanctioned load (kW)</label>
              <input
                id="load-input"
                type="number"
                min={1} max={50} step={0.5}
                className="form-input"
                value={profile.sanctioned_load_kw}
                onChange={e => updateProfile('sanctioned_load_kw', parseFloat(e.target.value) || 1)}
              />
            </div>
          </div>
        </div>

        {/* Appliances */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} color="#43D9A3" />
            <h2 className="text-sm font-semibold text-[#EDF4F7]">Appliances</h2>
            <span className="text-[0.65rem] text-[#94A3B8] ml-auto">
              {profile.appliances.length} / 20
            </span>
          </div>
          <ApplianceForm appliances={profile.appliances} onChange={updateAppliances} />
        </div>
      </div>

      {/* ── C. Analytics Area (Full width below) ─────────────────────── */}
      <div className="space-y-5">
        <div className="card">
          <SavingsPanel result={result} loading={loading} tariff={tariff} isStale={!!error} />
        </div>

        <div className="card">
          <button
            className="w-full flex items-center justify-between gap-2"
            onClick={() => setGridOpen(o => !o)}
            aria-expanded={gridOpen}
          >
            <div className="flex items-center gap-2">
              <Calendar size={14} color="#94A3B8" />
              <h2 className="text-sm font-semibold text-[#EDF4F7]">Weekly Schedule</h2>
              {result?.runs && (
                <span className="text-[0.62rem] text-[#94A3B8]">
                  {result.runs.filter(r => r.new_start !== r.current_start).length} runs moved
                </span>
              )}
            </div>
            <span className="text-[0.65rem] text-[#94A3B8]">{gridOpen ? '▲' : '▼'}</span>
          </button>
          {gridOpen && (
            <div className="mt-4">
              <WeekGrid runs={result?.runs} tariff={tariff} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
