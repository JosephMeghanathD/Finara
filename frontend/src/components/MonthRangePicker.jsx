import { ChevronDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'

function fmtMonth(m) {
  try { return format(parseISO(m + '-01'), 'MMM yyyy') } catch { return m }
}

const PRESETS = [
  { label: '1M', count: 1 },
  { label: '3M', count: 3 },
  { label: '6M', count: 6 },
  { label: '1Y', count: 12 },
  { label: 'All', count: Infinity },
]

export default function MonthRangePicker({ months, startMonth, endMonth, onChange }) {
  if (!months.length) return null

  const newest = months[0]

  const activePreset = PRESETS.find(p => {
    const expectedStart = months[Math.min(p.count - 1, months.length - 1)]
    return startMonth === expectedStart && endMonth === newest
  })

  const setPreset = (count) => {
    const end   = newest
    const start = months[Math.min(count - 1, months.length - 1)]
    onChange({ startMonth: start, endMonth: end })
  }

  const fromOptions = [...months].reverse().filter(m => m <= endMonth)
  const toOptions   = months.filter(m => m >= startMonth)

  const selStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    fontSize: 12,
    padding: '5px 24px 5px 10px',
    outline: 'none',
    appearance: 'none',
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => setPreset(p.count)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
            style={activePreset?.label === p.label
              ? { background: 'var(--brand)', color: 'white', boxShadow: '0 0 10px rgba(77,142,255,0.3)' }
              : { background: 'transparent', color: 'var(--text-3)' }}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <select value={startMonth}
          onChange={e => onChange({ startMonth: e.target.value, endMonth })}
          style={selStyle}>
          {fromOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-3)' }} />
      </div>

      <span className="text-xs" style={{ color: 'var(--text-3)' }}>→</span>

      <div className="relative">
        <select value={endMonth}
          onChange={e => onChange({ startMonth, endMonth: e.target.value })}
          style={selStyle}>
          {toOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-3)' }} />
      </div>
    </div>
  )
}
