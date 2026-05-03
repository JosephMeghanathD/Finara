import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTimeFilter } from '../hooks/useTimeFilter'
import DateRangePicker from './DateRangePicker'
import {
  LogOut, LayoutDashboard, Upload, BookOpen, MessageSquare,
  Lightbulb, PiggyBank, List, AlertTriangle, TrendingUp,
  Target, BarChart2,
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
}

const RANGE_PAGES = new Set([
  '/', '/story', '/transactions', '/anomalies', '/chat', '/savings', '/budget',
])

export default function TopBar() {
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
    <div className="flex items-center gap-4 px-7 flex-shrink-0"
      style={{
        height: 56,
        background: 'var(--surface)',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>

      {/* Page label with colored icon */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ minWidth: 160 }}>
        {Icon && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}20` }}>
            <Icon size={14} style={{ color }} />
          </div>
        )}
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {meta?.label ?? ''}
        </span>
      </div>

      {/* Global time filter — centred */}
      <div className="flex-1 flex justify-center">
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

      {/* User + logout */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #4d8eff40, #8b5cf640)',
            color: '#c4ceff',
            border: '1px solid rgba(77,142,255,0.2)',
          }}>
          {initials}
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
          {firstName}
        </span>
        <button
          onClick={handleLogout}
          title="Logout"
          className="p-1.5 rounded-lg transition-all ml-0.5"
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
