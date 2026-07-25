import { Fragment, useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { aiApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { Send, MessageSquare, Sparkles, TrendingUp, TrendingDown } from 'lucide-react'
import AiText from '../components/AiText'
import { format, parseISO } from 'date-fns'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ComposedChart, Area,
  Treemap, Sankey, Layer, Rectangle,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ZAxis,
  RadialBarChart, RadialBar,
} from 'recharts'

const CAT_COLORS = {
  'Food & Drink': '#6366F1', 'Groceries': '#8B5CF6', 'Transport': '#0EA5E9',
  'Shopping': '#F59E0B', 'Entertainment': '#10B981', 'Healthcare': '#EF4444',
  'Utilities': '#6B7280', 'Rent & Housing': '#84CC16', 'Travel': '#F97316',
  'Financial': '#64748B', 'Subscriptions': '#A78BFA', 'Personal Care': '#EC4899',
}
const FALLBACK_COLORS = ['#6366F1','#8B5CF6','#0EA5E9','#F59E0B','#10B981','#EF4444','#F97316','#84CC16','#A78BFA','#EC4899']

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' },
  itemStyle: { color: 'var(--text)' },
  labelStyle: { color: 'var(--text-2)' },
}

const PHASES = [
  { id: 1, label: 'Understanding your question…', dots: 1, color: '#8b5cf6' },
  { id: 2, label: 'Fetching your data…',          dots: 2, color: '#5b9bff' },
  { id: 3, label: 'Generating response…',          dots: 3, color: '#10b981' },
]
const PHASE_THRESHOLDS = [3500, 8000] // ms → switch to phase 2 at 3.5s, phase 3 at 8s

const DEFAULT_SUGGESTIONS = [
  'Where did I spend the most?',
  'Show my spending breakdown chart',
  'What can I cut back on?',
  'Create a savings plan for me',
  'Show income vs spending trend',
  'What were my biggest purchases?',
]

function fmtRange(s, e) {
  if (!s) return ''
  const fmt = m => { try { return format(parseISO(m + '-01'), 'MMM yyyy') } catch { return m } }
  return s === e ? fmt(s) : `${fmt(s)} – ${fmt(e)}`
}

function fmt$(n) {
  const num = typeof n === 'number' && isFinite(n) ? n : 0
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── Inline chart rendered inside assistant messages ─────────────────────────

function InlineChart({ chart }) {
  if (!chart || !chart.data?.length) return null
  const total = chart.data.reduce((s, d) => s + (d.value || 0), 0)

  const wrapper = (children, height = 220) => (
    <div className="mt-4 rounded-xl overflow-hidden"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold px-4 pt-3 pb-1" style={{ color: 'var(--text-2)' }}>
        {chart.title}
      </p>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  )

  if (chart.type === 'line') {
    const fmtMonth = m => { try { return format(parseISO(m + '-01'), 'MMM yy') } catch { return m } }
    // Use pre-built label (e.g. "May 2023") if available (YOY charts), else format YYYY-MM
    const lineData = chart.data.map(d => ({
      ...d,
      _x: d.label || (d.month ? fmtMonth(d.month) : String(d.month)),
    }))
    const hasIncome = lineData.some(d => d.income != null)
    return wrapper(
      <LineChart data={lineData} margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="_x" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={42} />
        <Tooltip formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name === 'total' ? 'Spent' : 'Income']} {...TOOLTIP_STYLE} />
        {hasIncome && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={v => v === 'total' ? 'Spent' : 'Income'} />}
        <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: '#6366F1' }} activeDot={{ r: 5 }} name="total" />
        {hasIncome && <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: '#10B981' }} activeDot={{ r: 5 }} name="income" />}
      </LineChart>
    )
  }

  if (chart.type === 'multi_line') {
    const xKey   = chart.x_key || 'day'
    const series = chart.series || []
    const MLINE_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#f87171', '#8B5CF6', '#0EA5E9']
    return wrapper(
      <LineChart data={chart.data} margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={xKey}
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          tickFormatter={v => xKey === 'day' ? `Day ${v}` : v}
          axisLine={false} tickLine={false}
          interval={Math.floor(chart.data.length / 8)} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
          axisLine={false} tickLine={false} width={42} />
        <Tooltip
          formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name]}
          labelFormatter={v => xKey === 'day' ? `Day ${v}` : v}
          {...TOOLTIP_STYLE} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {series.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key} name={key}
            stroke={MLINE_COLORS[i % MLINE_COLORS.length]} strokeWidth={2}
            dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>,
      260
    )
  }

  if (chart.type === 'bar') {
    const barHeight = Math.max(200, chart.data.length * 34 + 60)
    return wrapper(
      <BarChart data={chart.data} layout="vertical" margin={{ left: 8, right: 32, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} width={115} axisLine={false} tickLine={false} />
        <Tooltip formatter={v => [`$${Number(v).toLocaleString()}`]} {...TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {chart.data.map((entry, i) => (
            <Cell key={i} fill={CAT_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>,
      barHeight,
    )
  }

  return wrapper(
    <PieChart>
      <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%"
        innerRadius={55} outerRadius={85} paddingAngle={2}>
        {chart.data.map((entry, i) => (
          <Cell key={i} fill={CAT_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(v, name) => [
        `$${Number(v).toLocaleString()} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`, name
      ]} {...TOOLTIP_STYLE} />
      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
    </PieChart>
  )
}

// ─── Inline transaction table ─────────────────────────────────────────────────

function InlineTable({ chart }) {
  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  if (!chart?.rows?.length) return null

  const rows = [...chart.rows].sort((a, b) => {
    if (sortCol === 'amount') return sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount
    const va = String(a[sortCol] ?? ''), vb = String(b[sortCol] ?? '')
    return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
  })

  const cols = [
    { key: 'date',        label: 'Date',        w: '78px' },
    { key: 'description', label: 'Merchant',     w: '1fr'  },
    { key: 'amount',      label: 'Amount',       w: '76px' },
    { key: 'category',    label: 'Category',     w: '108px'},
  ]

  const toggle = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  return (
    <div className="mt-4 rounded-xl overflow-hidden"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold px-4 pt-3 pb-2" style={{ color: 'var(--text-2)' }}>
        {chart.title}
        <span className="ml-1.5 font-normal" style={{ color: 'var(--text-3)' }}>({rows.length})</span>
      </p>

      {/* Header */}
      <div className="grid px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ gridTemplateColumns: '78px 1fr 76px 108px', borderTop: '1px solid var(--border)' }}>
        {cols.map(c => (
          <button key={c.key} onClick={() => toggle(c.key)}
            className="text-left flex items-center gap-1 transition-colors"
            style={{ color: sortCol === c.key ? 'var(--brand)' : 'var(--text-3)' }}>
            {c.label}
            {sortCol === c.key && <span style={{ fontSize: 10 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="overflow-y-auto" style={{ maxHeight: 288 }}>
        {rows.map((row, i) => {
          const color = CAT_COLORS[row.category] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
          return (
            <div key={row.id ?? i}
              className="grid px-4 py-2 text-xs"
              style={{
                gridTemplateColumns: '78px 1fr 76px 108px',
                borderTop: '1px solid var(--border)',
                background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(91,155,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent'}>
              <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {row.date?.slice(5)}
              </span>
              <span className="truncate pr-2" style={{ color: 'var(--text-2)' }}>{row.description}</span>
              <span style={{ color: 'var(--text)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                ${Number(row.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="truncate text-[10px] px-1.5 py-0.5 rounded-full self-center"
                style={{ background: color + '22', color, border: `1px solid ${color}44`, maxWidth: 100 }}>
                {row.category || 'Other'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Month-over-years heatmap (2D grid: years × days) ────────────────────────

function MonthHeatmap({ chart }) {
  const [tooltip, setTooltip] = useState(null)
  if (!chart?.data?.length || !chart?.years?.length) return null

  const years = chart.years
  const data  = chart.data  // [{day:1, "2023":X, "2024":Y}, ...]

  let maxAmt = 0
  for (const row of data) {
    for (const yr of years) {
      const v = row[yr] || 0
      if (v > maxAmt) maxAmt = v
    }
  }

  const getColor = (amount) => {
    if (!amount) return 'rgba(91,155,255,0.07)'
    const r = maxAmt > 0 ? amount / maxAmt : 0
    if (r < 0.2) return 'rgba(91,155,255,0.18)'
    if (r < 0.4) return 'rgba(91,155,255,0.38)'
    if (r < 0.6) return 'rgba(91,155,255,0.58)'
    if (r < 0.8) return '#5b9bff'
    return 'rgba(220,235,255,0.95)'
  }

  const CELL = 14
  const GAP  = 2

  return (
    <div className="mt-4 rounded-xl p-4"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>{chart.title}</p>

      <div className="overflow-x-auto">
        <div style={{ display: 'inline-block' }}>
          {/* Day labels */}
          <div style={{ display: 'flex', marginLeft: 36, marginBottom: 4, gap: GAP }}>
            {data.map((row) => (
              <div key={row.day} style={{
                width: CELL, fontSize: 8, textAlign: 'center',
                color: 'var(--text-3)', lineHeight: `${CELL}px`, flexShrink: 0,
              }}>
                {row.day === 1 || row.day % 5 === 0 ? row.day : ''}
              </div>
            ))}
          </div>

          {/* Year rows */}
          {years.map((yr) => (
            <div key={yr} style={{ display: 'flex', alignItems: 'center', gap: GAP, marginBottom: GAP }}>
              <div style={{ width: 32, fontSize: 9, color: 'var(--text-3)', textAlign: 'right', paddingRight: 4, flexShrink: 0 }}>
                {yr}
              </div>
              {data.map((row) => {
                const amt = row[yr] || 0
                return (
                  <div key={row.day}
                    style={{
                      width: CELL, height: CELL, borderRadius: 3,
                      background: getColor(amt),
                      cursor: amt ? 'crosshair' : 'default',
                      flexShrink: 0,
                    }}
                    onMouseEnter={amt ? (e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setTooltip({ day: row.day, year: yr, amount: amt, x: r.left + r.width / 2, y: r.top - 6 })
                    } : undefined}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}
            </div>
          ))}

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 36 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>Less</span>
            {['rgba(91,155,255,0.07)','rgba(91,155,255,0.18)','rgba(91,155,255,0.38)','rgba(91,155,255,0.58)','#5b9bff','rgba(220,235,255,0.95)'].map((bg, i) => (
              <div key={i} style={{ width: CELL, height: CELL, borderRadius: 3, background: bg }} />
            ))}
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>More</span>
          </div>
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          transform: 'translateX(-50%) translateY(-100%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text)',
          pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          {tooltip.year} · Day {tooltip.day}: ${Number(tooltip.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      )}
    </div>
  )
}

// ─── Calendar heatmap ─────────────────────────────────────────────────────────

function CalendarHeatmap({ chart }) {
  const [tooltip, setTooltip] = useState(null)

  if (!chart?.data) return null

  const year     = parseInt(chart.year) || new Date().getFullYear()
  const byDate   = {}
  let   maxAmt   = 0
  for (const row of chart.data) {
    byDate[row.date] = row.amount
    if (row.amount > maxAmt) maxAmt = row.amount
  }

  // Build 53-week × 7-day grid
  const jan1   = new Date(year, 0, 1)
  const offset = jan1.getDay()
  const weeks  = []
  let   week   = Array(offset).fill(null)

  for (let d = 0; d < 366; d++) {
    const date = new Date(year, 0, d + 1)
    if (date.getFullYear() !== year) break
    const iso = date.toISOString().slice(0, 10)
    week.push({ date: iso, amount: byDate[iso] || 0, day: date.getDate(), month: date.getMonth() })
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week) }

  const getColor = (amount) => {
    if (!amount) return 'rgba(91,155,255,0.07)'
    const r = maxAmt > 0 ? amount / maxAmt : 0
    if (r < 0.25) return 'rgba(91,155,255,0.22)'
    if (r < 0.5)  return 'rgba(91,155,255,0.48)'
    if (r < 0.75) return '#5b9bff'
    return 'rgba(220,235,255,0.92)'
  }

  const total  = chart.data.reduce((s, r) => s + r.amount, 0)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const DAYS   = ['S','M','T','W','T','F','S']

  // Month label positions
  const monthLabels = []
  weeks.forEach((wk, wi) => {
    const first = wk.find(d => d !== null)
    if (first && first.day <= 7) monthLabels.push({ wi, label: MONTHS[first.month] })
  })

  return (
    <div className="mt-4 rounded-xl p-4"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{chart.title}</p>
        <p className="text-xs" style={{ color: 'var(--text-3)', fontFamily: '"JetBrains Mono", monospace' }}>
          ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div style={{ position: 'relative', minWidth: 580 }}>
          {/* Month labels */}
          <div style={{ display: 'flex', position: 'relative', height: 14, marginLeft: 20, marginBottom: 2 }}>
            {monthLabels.map(({ wi, label }) => (
              <div key={label} style={{ position: 'absolute', left: wi * 11, fontSize: 9, color: 'var(--text-3)', fontWeight: 500 }}>
                {label}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 2 }}>
            {/* Day-of-week labels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 2 }}>
              {DAYS.map((d, i) => (
                <div key={i} style={{ width: 9, height: 9, fontSize: 7, color: 'var(--text-3)', lineHeight: '9px', textAlign: 'center' }}>
                  {i % 2 === 1 ? d : ''}
                </div>
              ))}
            </div>

            {/* Week columns */}
            {weeks.map((wk, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {wk.map((day, di) => (
                  <div key={di}
                    style={{
                      width: 9, height: 9, borderRadius: 2,
                      background: day !== null ? getColor(day.amount) : 'transparent',
                      cursor: day?.amount ? 'crosshair' : 'default',
                    }}
                    onMouseEnter={day?.amount ? (e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setTooltip({ date: day.date, amount: day.amount, x: r.left + r.width / 2, y: r.top - 6 })
                    } : undefined}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 20 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>Less</span>
            {['rgba(91,155,255,0.07)', 'rgba(91,155,255,0.22)', 'rgba(91,155,255,0.48)', '#5b9bff', 'rgba(220,235,255,0.92)'].map((bg, i) => (
              <div key={i} style={{ width: 9, height: 9, borderRadius: 2, background: bg }} />
            ))}
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>More</span>
          </div>
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          transform: 'translateX(-50%) translateY(-100%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text)',
          pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          {tooltip.date}: ${Number(tooltip.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      )}
    </div>
  )
}

// ─── Shared helpers for the extended chart library ────────────────────────────

const colorFor = (name, i) => CAT_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
const fmtMonthShort = m => { try { return format(parseISO(m + '-01'), 'MMM yy') } catch { return m } }

function ChartCard({ title, children }) {
  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      {title && <p className="text-xs font-semibold px-4 pt-3 pb-1" style={{ color: 'var(--text-2)' }}>{title}</p>}
      <div className="px-2 pb-3">{children}</div>
    </div>
  )
}

function StackedBar({ chart }) {
  const cats = chart.categories || []
  if (!chart.data?.length || !cats.length) return null
  return (
    <ChartCard title={chart.title}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chart.data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonthShort} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => '$' + Math.round(v / 1000) + 'k'} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt$(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {cats.map((c, i) => <Bar key={c} dataKey={c} stackId="a" fill={colorFor(c, i)} maxBarSize={44} />)}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function StackedArea({ chart }) {
  const cats = chart.categories || []
  if (!chart.data?.length || !cats.length) return null
  return (
    <ChartCard title={chart.title}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chart.data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonthShort} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => '$' + Math.round(v / 1000) + 'k'} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt$(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {cats.map((c, i) => <Area key={c} type="monotone" dataKey={c} stackId="a" stroke={colorFor(c, i)} fill={colorFor(c, i)} fillOpacity={0.5} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function MatrixHeatmap({ chart }) {
  const [tip, setTip] = useState(null)
  const cats = chart.categories || []
  const months = chart.months || []
  if (!chart.data?.length || !cats.length) return null

  const byMonth = {}
  let max = 0
  for (const row of chart.data) {
    byMonth[row.month] = row
    for (const c of cats) { const v = row[c] || 0; if (v > max) max = v }
  }
  const color = v => {
    if (!v) return 'rgba(91,155,255,0.06)'
    const r = max > 0 ? v / max : 0
    if (r < 0.2) return 'rgba(91,155,255,0.20)'
    if (r < 0.4) return 'rgba(91,155,255,0.40)'
    if (r < 0.6) return 'rgba(91,155,255,0.60)'
    if (r < 0.8) return '#5b9bff'
    return 'rgba(220,235,255,0.95)'
  }
  const CELL = 26
  return (
    <ChartCard title={chart.title}>
      <div className="overflow-x-auto px-2 pb-2">
        <div style={{ display: 'inline-block' }}>
          <div style={{ display: 'flex', marginLeft: 96, gap: 3, marginBottom: 3 }}>
            {months.map(m => (
              <div key={m} style={{ width: CELL, fontSize: 8, textAlign: 'center', color: 'var(--text-3)', flexShrink: 0 }}>{fmtMonthShort(m).split(' ')[0]}</div>
            ))}
          </div>
          {cats.map(c => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
              <div style={{ width: 92, fontSize: 10, color: 'var(--text-2)', textAlign: 'right', paddingRight: 4, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</div>
              {months.map(m => {
                const v = (byMonth[m] || {})[c] || 0
                return <div key={m} style={{ width: CELL, height: CELL, borderRadius: 4, background: color(v), flexShrink: 0, cursor: v ? 'crosshair' : 'default' }}
                  onMouseEnter={v ? e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ c, m, v, x: r.left + r.width / 2, y: r.top - 6 }) } : undefined}
                  onMouseLeave={() => setTip(null)} />
              })}
            </div>
          ))}
        </div>
      </div>
      {tip && (
        <div style={{ position: 'fixed', left: tip.x, top: tip.y, transform: 'translateX(-50%) translateY(-100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text)', pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap' }}>
          {tip.c} · {fmtMonthShort(tip.m)}: {fmt$(tip.v)}
        </div>
      )}
    </ChartCard>
  )
}

function TreemapContent({ x, y, width, height, name, value, index }) {
  if (width < 4 || height < 4) return null
  const fill = colorFor(name, index || 0)
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={3} style={{ fill, stroke: 'var(--surface)', strokeWidth: 2 }} />
      {width > 54 && height > 22 && (
        <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} fontWeight={600}>{name}</text>
      )}
      {width > 54 && height > 36 && (
        <text x={x + 6} y={y + 30} fill="rgba(255,255,255,0.85)" fontSize={10}>{fmt$(value)}</text>
      )}
    </g>
  )
}

function TreemapChart({ chart }) {
  if (!chart.data?.length) return null
  return (
    <ChartCard title={chart.title}>
      <ResponsiveContainer width="100%" height={260}>
        <Treemap data={chart.data} dataKey="value" nameKey="name" aspectRatio={4 / 3} content={<TreemapContent />} isAnimationActive={false}>
          <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt$(v)} />
        </Treemap>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function SankeyNode({ x, y, width, height, index, payload }) {
  const isOut = x > 200
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill="#6366F1" fillOpacity={0.9} radius={2} />
      <text x={isOut ? x - 6 : x + width + 6} y={y + height / 2} textAnchor={isOut ? 'end' : 'start'} dominantBaseline="middle" fontSize={10} fill="var(--text-2)">
        {payload.name}
      </text>
    </Layer>
  )
}

function SankeyChart({ chart }) {
  if (!chart.links?.length || !chart.nodes?.length) return null
  return (
    <ChartCard title={chart.title}>
      <ResponsiveContainer width="100%" height={Math.max(260, chart.nodes.length * 22)}>
        <Sankey data={{ nodes: chart.nodes, links: chart.links }} nodePadding={16} nodeWidth={10}
          link={{ stroke: '#5b9bff', strokeOpacity: 0.25 }} node={<SankeyNode />}
          margin={{ left: 8, right: 140, top: 8, bottom: 8 }}>
          <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt$(v)} />
        </Sankey>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function Waterfall({ chart }) {
  if (!chart.data?.length) return null
  let cum = 0
  const bars = chart.data.map(d => {
    if (d.kind === 'total') { cum = d.value; return { name: d.name, base: 0, delta: d.value, color: '#6366F1' } }
    if (d.kind === 'net')   { return { name: d.name, base: 0, delta: d.value, color: d.value >= 0 ? '#10B981' : '#EF4444' } }
    const amt = -d.value; const bottom = cum - amt; cum = bottom
    return { name: d.name, base: bottom, delta: amt, color: '#F59E0B' }
  })
  return (
    <ChartCard title={chart.title}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={bars} margin={{ left: 8, right: 16, top: 8, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-3)' }} angle={-30} textAnchor="end" interval={0} height={50} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => '$' + Math.round(v / 1000) + 'k'} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => n === 'delta' ? fmt$(v) : null} />
          <Bar dataKey="base" stackId="w" fill="transparent" />
          <Bar dataKey="delta" stackId="w" maxBarSize={44}>
            {bars.map((b, i) => <Cell key={i} fill={b.color} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function RadarProfile({ chart }) {
  if (!chart.data?.length) return null
  return (
    <ChartCard title={chart.title}>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={chart.data} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: 'var(--text-3)' }} tickFormatter={v => '$' + Math.round(v / 1000) + 'k'} />
          <Radar dataKey="amount" stroke="#6366F1" fill="#6366F1" fillOpacity={0.4} />
          <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt$(v)} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function ScatterTxns({ chart }) {
  if (!chart.data?.length) return null
  const pts = chart.data.map(d => ({ ...d, t: (() => { try { return parseISO(d.date).getTime() } catch { return 0 } })() }))
  const normal = pts.filter(p => !p.anomaly)
  const anomalies = pts.filter(p => p.anomaly)
  return (
    <ChartCard title={chart.title}>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={t => { try { return format(new Date(t), 'MMM yy') } catch { return '' } }} tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
          <YAxis dataKey="amount" tickFormatter={v => '$' + Math.round(v / 1000) + 'k'} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={44} />
          <ZAxis range={[36, 36]} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => n === 'amount' ? fmt$(v) : null} labelFormatter={() => ''} />
          <Scatter data={normal} fill="#6366F1" fillOpacity={0.6} />
          <Scatter data={anomalies} fill="#EF4444" />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function Gauge({ chart }) {
  const value = chart.value || 0
  const max = chart.max || 1
  const pct = Math.min(100, Math.round((value / max) * 100))
  const color = pct < 70 ? '#10B981' : pct < 100 ? '#F59E0B' : '#EF4444'
  return (
    <ChartCard title={chart.title}>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={180}>
          <RadialBarChart innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0} data={[{ value: pct, fill: color }]}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={10} background={{ fill: 'var(--border)' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, top: '38%', textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{pct}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{chart.label || ''}</div>
        </div>
      </div>
    </ChartCard>
  )
}

// ─── Chart dispatcher ─────────────────────────────────────────────────────────

function renderChart(chart) {
  if (!chart) return null
  if (chart.type === 'table')         return <InlineTable chart={chart} />
  if (chart.type === 'heatmap')       return <CalendarHeatmap chart={chart} />
  if (chart.type === 'month_heatmap') return <MonthHeatmap chart={chart} />
  if (chart.type === 'matrix_heatmap') return <MatrixHeatmap chart={chart} />
  if (chart.type === 'stacked_bar')   return <StackedBar chart={chart} />
  if (chart.type === 'stacked_area')  return <StackedArea chart={chart} />
  if (chart.type === 'treemap')       return <TreemapChart chart={chart} />
  if (chart.type === 'sankey')        return <SankeyChart chart={chart} />
  if (chart.type === 'waterfall')     return <Waterfall chart={chart} />
  if (chart.type === 'radar')         return <RadarProfile chart={chart} />
  if (chart.type === 'scatter')       return <ScatterTxns chart={chart} />
  if (chart.type === 'gauge')         return <Gauge chart={chart} />
  if (!chart.data?.length)      return null
  return <InlineChart chart={chart} />
}

// An answer can carry several charts. Stack them full-width — these are dense
// (heatmaps, sankeys, tables) and don't survive being halved. Each chart card
// brings its own top margin, so no extra gap is needed here.
function renderCharts(charts, chart) {
  const list = (charts?.length ? charts : chart ? [chart] : []).filter(Boolean)
  if (!list.length) return null
  return list.map((c, i) => {
    const node = renderChart(c)
    return node ? <Fragment key={`${c.type}-${i}`}>{node}</Fragment> : null
  })
}

// ─── Message bubbles ──────────────────────────────────────────────────────────

function ThinkingBubble() {
  const [phaseIdx, setPhaseIdx] = useState(0)
  const startMs = useRef(Date.now())

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startMs.current
      if (elapsed >= PHASE_THRESHOLDS[1]) { setPhaseIdx(2); return }
      if (elapsed >= PHASE_THRESHOLDS[0]) { setPhaseIdx(1) }
    }
    const t = setInterval(tick, 400)
    return () => clearInterval(t)
  }, [])

  const phase = PHASES[phaseIdx]

  return (
    <div className="flex items-start gap-3 chat-message">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--brand-light)', border: '1px solid rgba(91,155,255,0.2)' }}>
        <Sparkles size={13} className="ai-pulse-icon" style={{ color: 'var(--brand)' }} />
      </div>
      <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm flex flex-col gap-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 220 }}>

        {/* Phase steps */}
        <div className="flex flex-col gap-1.5">
          {PHASES.map((p, i) => {
            const done    = i < phaseIdx
            const active  = i === phaseIdx
            const pending = i > phaseIdx
            return (
              <div key={p.id} className="flex items-center gap-2">
                {/* Step indicator */}
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: done ? '#34d399' : active ? p.color : 'rgba(255,255,255,0.06)',
                    border: pending ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    boxShadow: active ? `0 0 8px ${p.color}55` : 'none',
                  }}>
                  {done && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  )}
                  {active && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'white' }} />
                  )}
                </div>
                <span className="text-xs transition-all"
                  style={{
                    color: done ? '#34d399' : active ? 'var(--text)' : 'var(--text-3)',
                    fontWeight: active ? 500 : 400,
                  }}>
                  {p.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Animated dots for active phase */}
        <div className="flex gap-1.5">
          {Array.from({ length: phase.dots }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full thinking-dot"
              style={{ background: phase.color, animationDelay: `${i * 0.18}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AssistantBubble({ content, chart, charts, error, timestamp }) {
  return (
    <div className="flex items-start gap-3 chat-message">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: error ? 'rgba(239,68,68,0.1)' : 'var(--brand-light)',
          border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(91,155,255,0.2)'}`,
        }}>
        <Sparkles size={13} style={{ color: error ? '#f87171' : 'var(--brand)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm"
          style={{
            background: error ? 'rgba(239,68,68,0.06)' : 'var(--surface)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
          }}>
          {error
            ? <p className="text-sm" style={{ color: '#f87171' }}>{content}</p>
            : <><AiText content={content} compact />{renderCharts(charts, chart)}</>
          }
        </div>
        {timestamp && (
          <p className="text-[10px] mt-1 ml-1" style={{ color: 'var(--text-3)' }}>
            Fiana · {timestamp}
          </p>
        )}
      </div>
    </div>
  )
}

function UserBubble({ content, timestamp }) {
  return (
    <div className="flex flex-col items-end gap-1 chat-message">
      <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
        style={{ background: 'var(--brand)', color: 'white' }}>
        {content}
      </div>
      {timestamp && (
        <p className="text-[10px] mr-1" style={{ color: 'var(--text-3)' }}>{timestamp}</p>
      )}
    </div>
  )
}

// ─── Context sidebar ──────────────────────────────────────────────────────────

function ContextSidebar({ contextData, startMonth, endMonth, loading }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[80, 64, 64, 140].map((h, i) => (
          <div key={i} className="skeleton rounded-xl" style={{ height: h }} />
        ))}
      </div>
    )
  }

  if (!contextData) return (
    <p className="text-xs text-center mt-8" style={{ color: 'var(--text-3)' }}>No data loaded</p>
  )

  const { total_spent = 0, income = 0, net_cash_flow = 0, categories = {} } = contextData
  const surplus = net_cash_flow >= 0
  const topCats = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxCat  = topCats[0]?.[1] || 1

  return (
    <div className="flex flex-col gap-2.5">
      {/* Period */}
      <div className="rounded-xl px-3.5 py-2.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-3)' }}>
          Period
        </p>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {fmtRange(startMonth, endMonth) || '—'}
        </p>
      </div>

      {/* Stats */}
      {[
        { label: 'Income',      value: fmt$(income),      color: '#34d399', icon: null },
        { label: 'Total Spent', value: fmt$(total_spent),  color: 'var(--text)', icon: null },
      ].map(({ label, value, color }) => (
        <div key={label} className="rounded-xl px-3.5 py-2.5"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-3)' }}>
            {label}
          </p>
          <p className="text-sm font-bold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
        </div>
      ))}

      {/* Net cash flow */}
      <div className="rounded-xl px-3.5 py-2.5"
        style={{
          background: 'var(--surface-2)',
          border: `1px solid ${surplus ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'}`,
        }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-3)' }}>
          Net Cash Flow
        </p>
        <div className="flex items-center gap-1.5">
          {surplus
            ? <TrendingUp size={12} style={{ color: '#34d399' }} />
            : <TrendingDown size={12} style={{ color: '#f87171' }} />}
          <p className="text-sm font-bold" style={{ color: surplus ? '#34d399' : '#f87171', fontVariantNumeric: 'tabular-nums' }}>
            {surplus ? '+' : '-'}{fmt$(Math.abs(net_cash_flow))}
          </p>
        </div>
      </div>

      {/* Top spending categories */}
      {topCats.length > 0 && (
        <div className="rounded-xl px-3.5 py-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>
            Top Spending
          </p>
          <div className="flex flex-col gap-2.5">
            {topCats.map(([cat, amt], i) => {
              const color = CAT_COLORS[cat] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
              return (
                <div key={cat}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] truncate" style={{ color: 'var(--text-2)', maxWidth: '62%' }}>{cat}</span>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt$(amt)}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${(amt / maxCat) * 100}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const location   = useLocation()
  const storyCtx   = location.state?.storyContext
  const prefillMsg = location.state?.prefillMessage || ''
  const { startMonth: globalStart, endMonth: globalEnd } = useTimeFilter()

  const startMonth = storyCtx?.startMonth || globalStart
  const endMonth   = storyCtx?.endMonth   || globalEnd

  const [messages, setMessages] = useState(() => {
    if (!storyCtx?.story) return []
    return [{
      role: 'assistant',
      content: `I've just read your financial story for **${fmtRange(storyCtx.startMonth, storyCtx.endMonth)}**. I have full context of your spending for that period — ask me anything about it, or pick one of the suggestions below.`,
      timestamp: format(new Date(), 'h:mm a'),
    }]
  })

  const [suggestions,    setSuggestions]    = useState(DEFAULT_SUGGESTIONS)
  const [input,          setInput]          = useState(prefillMsg)
  const [loading,        setLoading]        = useState(false)
  const [contextData,    setContextData]    = useState(null)
  const [ctxLoading,     setCtxLoading]     = useState(true)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (!startMonth) { setCtxLoading(false); return }
    setCtxLoading(true)
    aiApi.storyData(startMonth, endMonth)
      .then(r => setContextData(r.data))
      .catch(() => {})
      .finally(() => setCtxLoading(false))
  }, [startMonth, endMonth])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const now = () => format(new Date(), 'h:mm a')

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: now() }])
    setLoading(true)
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const { data } = await aiApi.chat({ message: msg, startMonth, endMonth, history })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        chart: data.chart || null,
        charts: data.charts?.length ? data.charts : (data.chart ? [data.chart] : []),
        timestamp: now(),
      }])
      if (data.suggestions?.length) setSuggestions(data.suggestions)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Fiana's having a moment — make sure Ollama is running and try again.",
        error: true,
        timestamp: now(),
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-80px)]">

      {/* ── Main chat column ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Ask Fiana</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
              Powered by Gemma 3 · {startMonth ? fmtRange(startMonth, endMonth) : 'all time'}
            </p>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
            style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid rgba(91,155,255,0.2)' }}>
            <Sparkles size={11} /> Fiana AI
          </span>
        </div>

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-5 pb-16">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--brand-light)', border: '1px solid rgba(91,155,255,0.2)' }}>
                  <MessageSquare size={32} style={{ color: 'var(--brand)' }} />
                </div>
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--brand)' }}>
                  <Sparkles size={11} style={{ color: 'white' }} />
                </div>
              </div>
              <div className="text-center max-w-xs">
                <p className="font-semibold text-base mb-2" style={{ color: 'var(--text)' }}>
                  What do you want to know?
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
                  Fiana has full context of your {startMonth ? fmtRange(startMonth, endMonth) : ''} transactions.
                  Ask about spending, patterns, savings, or anything financial.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) =>
            msg.role === 'user'
              ? <UserBubble key={i} content={msg.content} timestamp={msg.timestamp} />
              : <AssistantBubble key={i} content={msg.content} chart={msg.chart} charts={msg.charts} error={msg.error} timestamp={msg.timestamp} />
          )}

          {loading && <ThinkingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* Bottom: suggestion chips + input */}
        <div className="flex-shrink-0 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="pb-3">
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {suggestions.map((s, i) => (
                <button key={s + i} onClick={() => send(s)} disabled={loading}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)',
                    border: '1px solid var(--border)', opacity: loading ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor='var(--brand)'; e.currentTarget.style.color='var(--brand)'; e.currentTarget.style.background='var(--brand-light)' }}}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-2)'; e.currentTarget.style.background='var(--surface-2)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pb-4">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask about your spending, savings, or patterns…"
              className="flex-1 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="btn-primary rounded-xl"
              style={{ padding: '12px 16px', flexShrink: 0 }}>
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Context sidebar ──────────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 overflow-y-auto pb-4 hidden lg:block"
        style={{ scrollbarWidth: 'none' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3 pt-0.5"
          style={{ color: 'var(--text-3)' }}>
          Financial Context
        </p>
        <ContextSidebar
          contextData={contextData}
          startMonth={startMonth}
          endMonth={endMonth}
          loading={ctxLoading}
        />
      </div>

    </div>
  )
}
