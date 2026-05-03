import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTimeFilter } from '../hooks/useTimeFilter'
import DateRangePicker from './DateRangePicker'
import { LogOut } from 'lucide-react'

const PAGE_LABELS = {
  '/':             'Dashboard',
  '/upload':       'Upload Data',
  '/story':        'My Story',
  '/chat':         'Ask Fiana',
  '/coach':        'Weekly Coach',
  '/savings':      'Savings Planner',
  '/transactions': 'Transactions',
  '/anomalies':    'Anomalies',
  '/forecast':     'Forecast',
  '/budget':       'Budget',
  '/compare':      'Compare Months',
}

// Pages where the global range picker is shown in the top bar
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

  return (
    <div className="flex items-center gap-4 px-7 flex-shrink-0"
      style={{
        height: 54,
        background: 'var(--surface)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>

      {/* Page label */}
      <span className="text-sm font-semibold flex-shrink-0 w-36"
        style={{ color: 'var(--text-3)' }}>
        {PAGE_LABELS[location.pathname] ?? ''}
      </span>

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
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: 'rgba(77,142,255,0.2)', color: '#adc6ff' }}>
          {user?.firstName?.[0]?.toUpperCase()}
        </div>
        <span className="text-sm font-medium" style={{ color: '#e1e2ec' }}>
          {user?.firstName}
        </span>
        <button
          onClick={handleLogout}
          title="Logout"
          className="p-1.5 rounded-lg transition-colors ml-1"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e1e2ec' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent';             e.currentTarget.style.color = 'var(--text-3)' }}>
          <LogOut size={14} />
        </button>
      </div>
    </div>
  )
}
