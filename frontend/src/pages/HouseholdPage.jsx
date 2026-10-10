/**
 * HouseholdPage — single-household appliance optimizer.
 *
 * Left column: profile settings + appliance editor
 * Right column: optimization results, weekly grid, savings
 *
 * Household ID stored in ?h= URL parameter for shareable links.
 * Profile can be saved to/loaded from DynamoDB (when backend is configured).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Home, Settings2, Zap, Save, Link, RefreshCw, AlertTriangle, CheckCircle
} from 'lucide-react'
import { ApplianceForm } from '../components/household/ApplianceForm.jsx'
import { WeekGrid } from '../components/household/WeekGrid.jsx'
import { SavingsPanel } from '../components/household/SavingsPanel.jsx'
import { api } from '../api.js'
import { SAMPLE_PROFILE } from '../sample.js'

const TARIFF_OPTIONS = [
  { id: 'tod-domestic-illustrative', label: 'ToD Domestic (Illustrative)' },
  { id: 'tod-ev-illustrative', label: 'ToD EV Charging (Illustrative)' },
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

export default function HouseholdPage() {
  const [profile, setProfile] = useState({
    tariff_id: SAMPLE_PROFILE.tariff_id,
    sanctioned_load_kw: SAMPLE_PROFILE.sanctioned_load_kw,
    appliances: [...SAMPLE_PROFILE.appliances],
  })
  const [tariff, setTariff] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved' | 'error'
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('results') // 'results' | 'grid'
  const debounceRef = useRef(null)

  // Load tariff details on mount/tariff change
  useEffect(() => {
    api.getTariffs()
      .then(tariffs => {
        const t = tariffs.find(t => t.id === profile.tariff_id)
        if (t) setTariff(t)
      })
      .catch(() => {})
  }, [profile.tariff_id])

  // Auto-optimize on load with sample profile
  useEffect(() => {
    runOptimize(profile)
    // Load saved household if ?h= in URL
    const hid = getHouseholdId()
    if (hid) loadHousehold(hid)
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
      setError(err.message)
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
    try {
      const item = await api.loadHousehold(hid)
      if (item?.profile) {
        setProfile(item.profile)
        runOptimize(item.profile)
      }
    } catch (_) {}
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => setSaveStatus('copied'))
      .catch(() => {})
    setTimeout(() => setSaveStatus(null), 2000)
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#EDF4F7] tracking-tight flex items-center gap-2">
            <Home size={18} color="#58BFE8" />
            Household Optimizer
          </h1>
          <p className="text-sm text-[#94A3B8] mt-0.5">
            Schedule your appliances to minimise cost and carbon emissions.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={saveProfile}
            disabled={saveStatus === 'saving'}
            className="btn-secondary text-xs"
            title="Save profile"
          >
            <Save size={13} />
            {saveStatus === 'saving' ? 'Saving…' :
              saveStatus === 'saved' ? 'Saved!' :
              saveStatus === 'error' ? 'Error' :
              saveStatus === 'copied' ? 'Copied!' :
              'Save'}
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

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: 'rgba(241,108,117,0.08)', border: '1px solid rgba(241,108,117,0.2)' }}>
          <AlertTriangle size={14} color="#F16C75" />
          <span className="text-[#F16C75]">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── Left: Profile + Appliances ──────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Profile settings */}
          <div className="card">
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
                <p className="text-[0.65rem] text-[#94A3B8] mt-1">
                  Illustrative tariff — not a real DISCOM tariff.
                </p>
              </div>

              <div>
                <label className="form-label" htmlFor="load-input">
                  Sanctioned load (kW)
                </label>
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
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} color="#43D9A3" />
              <h2 className="text-sm font-semibold text-[#EDF4F7]">Appliances</h2>
              <span className="text-[0.65rem] text-[#94A3B8] ml-auto">
                {profile.appliances.length} / 20
              </span>
            </div>
            <ApplianceForm
              appliances={profile.appliances}
              onChange={updateAppliances}
            />
          </div>
        </div>

        {/* ── Right: Results ──────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Tab bar */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#101922', border: '1px solid rgba(148,163,184,0.12)' }}>
            {[
              { id: 'results', label: 'Savings & Changes' },
              { id: 'grid', label: 'Weekly Schedule' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#151F2A] text-[#EDF4F7]'
                    : 'text-[#94A3B8] hover:text-[#EDF4F7]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="card">
            {activeTab === 'results' && (
              <SavingsPanel result={result} loading={loading} />
            )}
            {activeTab === 'grid' && (
              <WeekGrid runs={result?.runs} tariff={tariff} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
