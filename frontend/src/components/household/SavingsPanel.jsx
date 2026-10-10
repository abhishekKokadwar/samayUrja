/**
 * SavingsPanel — Cost/carbon before–after charts and per-appliance change list.
 */
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from 'recharts'
import { ArrowRight, TrendingDown, Leaf, Info } from 'lucide-react'

const INR = v => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)}`
const FMT = (v, d = 1) => Number(v).toFixed(d)

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="p-2 rounded-lg text-xs"
      style={{ background: '#151F2A', border: '1px solid rgba(148,163,184,0.18)' }}>
      <p className="text-[#EDF4F7] font-semibold">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

function BeforeAfterBar({ monthly }) {
  if (!monthly) return null
  const costData = [
    { name: 'Cost', before: Math.round(monthly.cost_before_inr), after: Math.round(monthly.cost_after_inr) },
  ]
  const co2Data = [
    { name: 'CO₂', before: Math.round(monthly.co2_before_kg * 10) / 10, after: Math.round(monthly.co2_after_kg * 10) / 10 },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Cost chart */}
      <div>
        <p className="text-[0.65rem] text-[#94A3B8] uppercase tracking-wider font-semibold mb-2">
          Monthly cost (INR)
        </p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={costData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.08)" />
            <XAxis dataKey="name" tick={false} axisLine={false} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="before" name="Before" radius={[4, 4, 0, 0]}>
              <Cell fill="rgba(241,108,117,0.7)" />
            </Bar>
            <Bar dataKey="after" name="After" radius={[4, 4, 0, 0]}>
              <Cell fill="#43D9A3" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-3 mt-1">
          <span className="text-[0.6rem] flex items-center gap-1 text-[#94A3B8]">
            <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(241,108,117,0.7)' }} />Before
          </span>
          <span className="text-[0.6rem] flex items-center gap-1 text-[#94A3B8]">
            <span className="w-2 h-2 rounded-sm" style={{ background: '#43D9A3' }} />After
          </span>
        </div>
      </div>

      {/* CO2 chart */}
      <div>
        <p className="text-[0.65rem] text-[#94A3B8] uppercase tracking-wider font-semibold mb-2">
          Monthly CO₂ (kg)
        </p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={co2Data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.08)" />
            <XAxis dataKey="name" tick={false} axisLine={false} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="before" name="Before" radius={[4, 4, 0, 0]}>
              <Cell fill="rgba(241,108,117,0.7)" />
            </Bar>
            <Bar dataKey="after" name="After" radius={[4, 4, 0, 0]}>
              <Cell fill="#43D9A3" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-3 mt-1">
          <span className="text-[0.6rem] flex items-center gap-1 text-[#94A3B8]">
            <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(241,108,117,0.7)' }} />Before
          </span>
          <span className="text-[0.6rem] flex items-center gap-1 text-[#94A3B8]">
            <span className="w-2 h-2 rounded-sm" style={{ background: '#43D9A3' }} />After
          </span>
        </div>
      </div>
    </div>
  )
}

function ChangeRow({ run }) {
  const moved = run.new_start !== run.current_start
  const saving = run.monthly_saving_inr || 0
  const co2 = run.monthly_saving_kg || 0
  const hasSaving = saving > 0.1 || co2 > 0.01

  return (
    <div
      className="py-3 border-b"
      style={{ borderColor: 'rgba(148,163,184,0.08)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[0.75rem] font-medium text-[#EDF4F7]">{run.name}</span>
        {hasSaving && (
          <div className="flex items-center gap-2">
            <span className="text-[0.7rem] font-semibold tabular-nums" style={{ color: '#43D9A3' }}>
              {INR(saving)}/mo
            </span>
            <span className="text-[0.65rem] text-[#94A3B8] tabular-nums">
              {FMT(co2)} kg CO₂
            </span>
          </div>
        )}
      </div>

      {moved ? (
        <div className="flex items-center gap-1.5 text-[0.7rem]">
          <span className="text-[#94A3B8] tabular-nums">{run.current_start}</span>
          <ArrowRight size={11} color="#94A3B8" />
          <span className="font-semibold tabular-nums" style={{ color: '#43D9A3' }}>{run.new_start}</span>
        </div>
      ) : (
        <p className="text-[0.68rem] text-[#94A3B8]">{run.note || 'Already in optimal slot.'}</p>
      )}

      {run.note && moved && (
        <p className="text-[0.65rem] text-[#94A3B8] mt-0.5">{run.note}</p>
      )}
    </div>
  )
}

export function SavingsPanel({ result, loading }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 rounded-lg w-48" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-40 rounded-xl" />
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <TrendingDown size={32} color="#94A3B8" className="mb-3 opacity-40" />
        <p className="text-[#94A3B8] text-sm">Add appliances and optimise to see your savings.</p>
      </div>
    )
  }

  const { runs, monthly } = result
  const totalSaving = monthly.cost_before_inr - monthly.cost_after_inr
  const totalCO2 = monthly.co2_before_kg - monthly.co2_after_kg
  const shifted = runs.filter(r => r.new_start !== r.current_start).length

  return (
    <div className="space-y-5">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: '#151F2A', border: '1px solid rgba(148,163,184,0.12)' }}>
          <p className="text-[0.65rem] text-[#94A3B8] mb-1">Monthly savings</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: totalSaving > 0 ? '#43D9A3' : '#94A3B8' }}>
            {totalSaving > 0 ? INR(totalSaving) : '₹0'}
          </p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: '#151F2A', border: '1px solid rgba(148,163,184,0.12)' }}>
          <p className="text-[0.65rem] text-[#94A3B8] mb-1">CO₂ avoided</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: totalCO2 > 0 ? '#43D9A3' : '#94A3B8' }}>
            {totalCO2 > 0 ? `${FMT(totalCO2)} kg` : '0 kg'}
          </p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: '#151F2A', border: '1px solid rgba(148,163,184,0.12)' }}>
          <p className="text-[0.65rem] text-[#94A3B8] mb-1">Moved</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: shifted > 0 ? '#58BFE8' : '#94A3B8' }}>
            {shifted} / {runs.length}
          </p>
        </div>
      </div>

      {/* Before/after chart */}
      <div className="rounded-xl p-4" style={{ background: '#151F2A', border: '1px solid rgba(148,163,184,0.12)' }}>
        <BeforeAfterBar monthly={monthly} />
      </div>

      {/* Change list */}
      <div>
        <p className="text-[0.65rem] text-[#94A3B8] uppercase tracking-wider font-semibold mb-2">
          Appliance schedule changes
        </p>
        {runs.map(run => (
          <ChangeRow key={run.name} run={run} />
        ))}
      </div>

      {/* Disclaimer */}
      <div
        className="rounded-lg px-3 py-2 text-[0.65rem] flex items-start gap-2"
        style={{ background: 'rgba(148,163,184,0.04)', border: '1px solid rgba(148,163,184,0.1)' }}
      >
        <Info size={11} color="#94A3B8" className="flex-shrink-0 mt-0.5" />
        <p className="text-[#94A3B8]">
          Tariff and carbon figures are illustrative, modelled on India's ToD tariff rules.
          Savings are from shifting runs to cheaper time slots — total kWh consumed does not change.
        </p>
      </div>
    </div>
  )
}
