import { format, subDays, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns'

const iso = dt => format(dt, 'yyyy-MM-dd')

// Presets are anchored to the newest day that HAS data, not to the wall clock.
// Anchoring to today silently excluded the most recent months whenever the loaded
// statements ran past today, and produced empty windows for older datasets.
//
// The month presets are calendar-aligned: pages derive startMonth/endMonth with
// slice(0,7), so "3 months back from the 25th" used to span 4 partial months.
const PRESETS = [
  { label: '7D',  fn: a => [iso(subDays(parseISO(a), 6)),  a] },
  { label: '30D', fn: a => [iso(subDays(parseISO(a), 29)), a] },
  { label: '1M',  fn: a => [iso(startOfMonth(parseISO(a))),                iso(endOfMonth(parseISO(a)))] },
  { label: '3M',  fn: a => [iso(startOfMonth(subMonths(parseISO(a), 2))),  iso(endOfMonth(parseISO(a)))] },
  { label: '6M',  fn: a => [iso(startOfMonth(subMonths(parseISO(a), 5))),  iso(endOfMonth(parseISO(a)))] },
  { label: '1Y',  fn: a => [iso(startOfMonth(subMonths(parseISO(a), 11))), iso(endOfMonth(parseISO(a)))] },
  { label: 'All', fn: (a, min) => [min, iso(endOfMonth(parseISO(a)))] },
]

const inputStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 8,
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  colorScheme: 'dark',
  cursor: 'pointer',
}

export default function DateRangePicker({ startDate, endDate, minDate, maxDate, onChange }) {
  const anchor = maxDate || format(new Date(), 'yyyy-MM-dd')
  const effectiveMin = minDate || anchor

  const activePreset = PRESETS.find(p => {
    const [s, e] = p.fn(anchor, effectiveMin)
    return s === startDate && e === endDate
  })

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        {PRESETS.map(p => (
          <button key={p.label}
            onClick={() => {
              const [s, e] = p.fn(anchor, effectiveMin)
              onChange({ startDate: s, endDate: e })
            }}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
            style={activePreset?.label === p.label
              ? { background: 'var(--brand)', color: 'white', boxShadow: '0 0 10px rgba(77,142,255,0.3)' }
              : { background: 'transparent', color: 'var(--text-3)' }}>
            {p.label}
          </button>
        ))}
      </div>

      <input type="date" value={startDate} min={minDate} max={endDate || maxDate}
        onChange={e => onChange({ startDate: e.target.value, endDate })}
        style={inputStyle} />

      <span className="text-xs" style={{ color: 'var(--text-3)' }}>→</span>

      <input type="date" value={endDate} min={startDate} max={maxDate}
        onChange={e => onChange({ startDate, endDate: e.target.value })}
        style={inputStyle} />
    </div>
  )
}
