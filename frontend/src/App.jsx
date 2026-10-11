import { useState, useEffect } from 'react'
import { LayoutGrid, Home, Zap, FlaskConical, Menu, X, Activity } from 'lucide-react'
import NeighbourhoodPage from './pages/NeighbourhoodPage.jsx'
import HouseholdPage from './pages/HouseholdPage.jsx'

const NAV_ITEMS = [
  { id: 'neighbourhood', label: 'Neighbourhood', Icon: LayoutGrid },
  { id: 'household', label: 'Household', Icon: Home },
]

function SidebarLink({ item, active, onClick }) {
  const { id, label, Icon } = item
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-[rgba(255,255,255,0.12)] text-[#FFFFFF]'
          : 'text-[#A3A3A3] hover:bg-[#141414] hover:text-[#FFFFFF]'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </button>
  )
}

export default function App() {
  const [page, setPage] = useState('neighbourhood')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Handle URL hash for bookmarkable navigation
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (NAV_ITEMS.find(n => n.id === hash)) setPage(hash)
  }, [])

  const navigate = (id) => {
    setPage(id)
    setMobileNavOpen(false)
    window.location.hash = id
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#000000' }}>
      {/* Sidebar — desktop */}
      <aside
        className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r"
        style={{ background: '#000000', borderColor: 'rgba(255,255,255,0.1)' }}
      >
        {/* Brand */}
        <div className="px-4 pt-6 pb-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="flex items-center gap-2.5 mb-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
            >
              <Activity size={16} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-[#FFFFFF] text-base tracking-tight">samayUrja</span>
          </div>
          <p className="text-xs text-[#A3A3A3] leading-tight pl-10">
            Many homes. One intelligent grid.
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1" aria-label="Main navigation">
          {NAV_ITEMS.map(item => (
            <SidebarLink
              key={item.id}
              item={item}
              active={page === item.id}
              onClick={navigate}
            />
          ))}
        </nav>

        {/* Simulation disclaimer */}
        <div className="px-3 pb-4">
          <div
            className="rounded-lg px-3 py-2.5 text-xs text-[#A3A3A3] leading-snug"
            style={{ background: 'rgba(244,184,96,0.06)', border: '1px solid rgba(244,184,96,0.12)' }}
          >
            <span className="font-semibold text-[#F4B860]">SIMULATION</span>
            <br />
            Synthetic data only. Not real meter readings.
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 border-b"
        style={{ background: '#000000', borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Activity size={14} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-[#FFFFFF] text-sm">samayUrja</span>
        </div>
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="btn-icon"
          aria-label="Toggle menu"
        >
          {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.8)' }} />
          <aside
            className="absolute top-14 left-0 bottom-0 w-64 flex flex-col p-4 gap-2"
            style={{ background: '#000000', borderRight: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            {NAV_ITEMS.map(item => (
              <SidebarLink
                key={item.id}
                item={item}
                active={page === item.id}
                onClick={navigate}
              />
            ))}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto lg:pt-0 pt-14">
        {page === 'neighbourhood' && <NeighbourhoodPage />}
        {page === 'household' && <HouseholdPage />}
      </main>
    </div>
  )
}
