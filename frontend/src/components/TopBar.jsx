import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTimeFilter } from '../hooks/useTimeFilter'
import DateRangePicker from './DateRangePicker'
import {
  LogOut, LayoutDashboard, Upload, BookOpen, MessageSquare,
  Lightbulb, PiggyBank, List, AlertTriangle, TrendingUp,
  Target, BarChart2, Menu, PieChart, Building2,
} from 'lucide-react'

const PAGE_META = {
  '/':             { label: 'Dashboard',       icon: LayoutDashboard, color: '#4d8eff' },
  '/upload':       { label: 'Upload Data',     icon: Upload,          color: '#06b6d4' },
  '/story':        { label: 'My Story',        icon: BookOpen,        color: '#8b5cf6' },
  '/chat':         { label: 'Ask Fiana',       icon: MessageSquare,   color: '#6366f1' },
  '/coach':        { label: 'Weekly Coach',    icon: Lightbulb,       color: '#f59e0b' },
  '/savings':      { label: 'Savings Planner', icon: PiggyBank,       color: '#10b981' },
  '/transactions': { label: 'Transactions',    icon: List,            color: '#94a3b8' },
  '/anomalies':    { label: 'Anomalies',       icon: AlertTriangle,   color: '#f97316' },
  '/forecast':     { label: 'Forecast',        icon: TrendingUp,      color: '#22d3ee' },
  '/budget':       { label: 'Budget',          icon: Target,          color: '#a78bfa' },
  '/compare':      { label: 'Compare Months',  icon: BarChart2,       color: '#ec4899' },
  '/insights':     { label: 'Spending Insights', icon: PieChart,      color: '#f59e0b' },
  '/stocks':       { label: 'Invest Instead',  icon: Building2,       color: '#34d399' },
}

// Every page that reads the global range from useTimeFilter gets the picker.
// Excluded on purpose: /upload has no time dimension, /coach is week-keyed
// (?week=YYYY-Www), and /forecast + /compare drive their own month selectors.
const RANGE_PAGES = new Set([
  '/', '/story', '/transactions', '/anomalies', '/chat', '/savings', '/budget',
  '/insights', '/stocks',
])

export default function TopBar({ onMenuOpen }) {
  const { user, logout }                        = useAuth()
  const { startDate, endDate, minDate, maxDate, setRange } = useTimeFilter()
  const navigate   = useNavigate()
  const location   = useLocation()

  const handleLogout = () => { logout(); navigate('/login') }
  const showPicker   = RANGE_PAGES.has(location.pathname) && !!minDate

  const meta = PAGE_META[location.pathname]
  const Icon = meta?.icon
  const color = meta?.color ?? 'var(--brand)'

  const initials = user?.firstName?.[0]?.toUpperCase() ?? '?'
  const firstName = user?.firstName ?? ''

  return (
    <div
      className="flex items-center flex-shrink-0"
      style={{
        height: 56, minHeight: 56,
        background: 'var(--surface)',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        padding: '0 12px',
        gap: 8,
      }}
    >
      {/* ── Hamburger (mobile only) ── */}
      <button
        onClick={onMenuOpen}
        className="md:hidden flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
        aria-label="Open menu"
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Menu size={16} />
      </button>

      {/* ── Page label (hidden on very small screens) ── */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0" style={{ minWidth: 140 }}>
        {Icon && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}20` }}>
            <Icon size={14} style={{ color }} />
          </div>
        )}
        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
          {meta?.label ?? ''}
        </span>
      </div>

      {/* ── Global time filter — centred, collapses on mobile ── */}
      <div className="flex-1 flex justify-center min-w-0 overflow-hidden">
        {showPicker && (
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            minDate={minDate}
            maxDate={maxDate}
            onChange={setRange}
          />
        )}
      </div>

      {/* ── User + logout ── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #4d8eff40, #8b5cf640)',
            color: '#c4ceff',
            border: '1px solid rgba(77,142,255,0.2)',
          }}>
          {initials}
        </div>
        <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--text-2)' }}>
          {firstName}
        </span>
        <button
          onClick={handleLogout}
          title="Logout"
          className="p-1.5 rounded-lg transition-all"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
            e.currentTarget.style.color = '#f87171'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-3)'
          }}>
          <LogOut size={14} />
        </button>
      </div>
    </div>
  )
}
