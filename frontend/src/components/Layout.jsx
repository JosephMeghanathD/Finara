import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Upload, BookOpen, List, AlertTriangle,
  TrendingUp, Target, BarChart2, PiggyBank, MessageSquare,
  Lightbulb, Sparkles,
} from 'lucide-react'
import FianaLogo from './FinaraLogo'
import TopBar from './TopBar'
import HealthIndicator from './HealthIndicator'

const NAV_SECTIONS = [
  {
    items: [
      { to: '/',             icon: LayoutDashboard, label: 'Dashboard',     color: '#4d8eff' },
      { to: '/upload',       icon: Upload,          label: 'Upload Data',   color: '#06b6d4' },
    ]
  },
  {
    label: 'AI Features',
    items: [
      { to: '/story',        icon: BookOpen,        label: 'My Story',      color: '#8b5cf6' },
      { to: '/chat',         icon: MessageSquare,   label: 'Ask Fiana',     color: '#6366f1' },
      { to: '/coach',        icon: Lightbulb,       label: 'Weekly Coach',  color: '#f59e0b' },
      { to: '/savings',      icon: PiggyBank,       label: 'Savings Plan',  color: '#10b981' },
    ]
  },
  {
    label: 'Analytics',
    items: [
      { to: '/transactions', icon: List,            label: 'Transactions',  color: '#94a3b8' },
      { to: '/anomalies',    icon: AlertTriangle,   label: 'Anomalies',     color: '#f97316' },
      { to: '/forecast',     icon: TrendingUp,      label: 'Forecast',      color: '#22d3ee' },
      { to: '/budget',       icon: Target,          label: 'Budget',        color: '#a78bfa' },
      { to: '/compare',      icon: BarChart2,       label: 'Compare',       color: '#ec4899' },
    ]
  },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #0b0e18 0%, #090c14 100%)',
          borderRight: '1px solid rgba(255,255,255,0.055)',
        }}>

        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <FianaLogo size={30} />
            <div>
              <span className="font-bold text-base tracking-tight block" style={{ color: '#e1e2ec', lineHeight: 1.1 }}>
                Fiana
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <Sparkles size={9} style={{ color: 'var(--brand)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--brand)', letterSpacing: '0.04em', fontSize: '0.65rem' }}>
                  AI Finance
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              {section.label && (
                <div className="section-divider mx-1 mb-2">
                  <span>{section.label}</span>
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map(({ to, icon: Icon, label, color }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                  >
                    {({ isActive }) => (
                      <div
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer"
                        style={{
                          background: isActive
                            ? `linear-gradient(100deg, ${color}22 0%, ${color}08 100%)`
                            : 'transparent',
                          color: isActive ? '#e1e2ec' : '#6b7194',
                          borderLeft: `2px solid ${isActive ? color : 'transparent'}`,
                          paddingLeft: isActive ? 8 : 10,
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                      >
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            background: isActive ? `${color}28` : 'transparent',
                          }}
                        >
                          <Icon size={14} style={{ color: isActive ? color : 'currentColor' }} />
                        </div>
                        <span>{label}</span>
                        {isActive && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                        )}
                      </div>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Health indicator */}
        <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.055)' }}>
          <HealthIndicator />
        </div>

      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="px-7 py-6" style={{ maxWidth: 1600, margin: '0 auto' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
