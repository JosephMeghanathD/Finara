import { format, subDays, subMonths, parseISO } from 'date-fns'

const PRESETS = [
  { label: 'Today', fn: today => [today, today] },
  { label: '7D',    fn: today => [format(subDays(new Date(today), 6),  'yyyy-MM-dd'), today] },
  { label: '30D',   fn: today => [format(subDays(new Date(today), 29), 'yyyy-MM-dd'), today] },
  { label: '3M',    fn: today => [format(subMonths(new Date(today), 3),  'yyyy-MM-dd'), today] },
  { label: '6M',    fn: today => [format(subMonths(new Date(today), 6),  'yyyy-MM-dd'), today] },
  { label: '1Y',    fn: today => [format(subMonths(new Date(today), 12), 'yyyy-MM-dd'), today] },
  { label: 'All',   fn: (today, min) => [min, today] },
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
  const today = format(new Date(), 'yyyy-MM-dd')
  const effectiveMin = minDate || today

  const activePreset = PRESETS.find(p => {
    const [s, e] = p.fn(today, effectiveMin)
    return s === startDate && e === endDate
  })

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg border"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        {PRESETS.map(p => (
          <button key={p.label}
            onClick={() => {
              const [s, e] = p.fn(today, effectiveMin)
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
