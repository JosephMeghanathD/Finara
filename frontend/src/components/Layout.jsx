import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Upload, BookOpen, List, AlertTriangle,
  TrendingUp, Target, BarChart2, PiggyBank, MessageSquare,
  Lightbulb, Sparkles,
} from 'lucide-react'
import FinaraLogo from './FinaraLogo'
import TopBar from './TopBar'

const NAV_SECTIONS = [
  {
    items: [
      { to: '/',             icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/upload',       icon: Upload,          label: 'Upload Data' },
    ]
  },
  {
    label: 'AI Features',
    items: [
      { to: '/story',        icon: BookOpen,        label: 'My Story' },
      { to: '/chat',         icon: MessageSquare,   label: 'Ask Finara' },
      { to: '/coach',        icon: Lightbulb,       label: 'Weekly Coach' },
      { to: '/savings',      icon: PiggyBank,       label: 'Savings Plan' },
    ]
  },
  {
    label: 'Analytics',
    items: [
      { to: '/transactions', icon: List,            label: 'Transactions' },
      { to: '/anomalies',    icon: AlertTriangle,   label: 'Anomalies' },
      { to: '/forecast',     icon: TrendingUp,      label: 'Forecast' },
      { to: '/budget',       icon: Target,          label: 'Budget' },
      { to: '/compare',      icon: BarChart2,       label: 'Compare' },
    ]
  },
]

const SIDEBAR_BG    = '#0b0e15'
const ACTIVE_BG     = 'rgba(77,142,255,0.12)'
const ACTIVE_COLOR  = '#adc6ff'
const INACTIVE_COLOR= '#8c909f'
const LABEL_COLOR   = '#424754'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 flex flex-col"
        style={{ background: SIDEBAR_BG, borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Logo */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <FinaraLogo size={28} />
            <span className="font-bold text-base tracking-tight" style={{ color: '#e1e2ec' }}>
              Finara
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 ml-9">
            <Sparkles size={9} style={{ color: 'var(--brand)' }} />
            <p className="text-xs font-medium" style={{ color: 'var(--brand)', letterSpacing: '0.03em' }}>
              AI Finance
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              {section.label && (
                <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: LABEL_COLOR }}>
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all"
                    style={({ isActive }) => isActive ? {
                      background: ACTIVE_BG,
                      color: ACTIVE_COLOR,
                      borderLeft: '2.5px solid var(--brand)',
                      paddingLeft: 9,
                    } : {
                      background: 'transparent',
                      color: INACTIVE_COLOR,
                    }}
                    onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon size={15} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-7 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
