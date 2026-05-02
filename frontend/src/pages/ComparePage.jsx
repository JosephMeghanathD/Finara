import { useState, useEffect } from 'react'
import { txnApi, reportApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { format, endOfMonth, parseISO } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, CartesianGrid, ReferenceLine, Cell,
} from 'recharts'
import AiLoader from '../components/AiLoader'

const COLORS = ['#6366F1','#8B5CF6','#0EA5E9','#F59E0B','#10B981']

const TOOLTIP_STYLE = {
  background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  color: '#F1F5F9', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
}

const fmtDollar = v => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function ComparePage() {
  const { months } = useTimeFilter()
  const [selected, setSelected]   = useState([])
  const [reports, setReports]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [dailyData, setDailyData] = useState([])

  useEffect(() => {
    if (months.length > 0 && selected.length === 0) setSelected(months.slice(0, 3))
  }, [months])

  useEffect(() => {
    if (selected.length < 2) return
    setLoading(true)
    Promise.all([
      reportApi.list(selected.join(',')),
      ...selected.map(m => txnApi.list(m + '-01', format(endOfMonth(parseISO(m + '-01')), 'yyyy-MM-dd'))),
    ]).then(([rep, ...txnResults]) => {
      setReports(rep.data)

      const byMonth = {}
      txnResults.forEach((r, i) => {
        const m = selected[i]
        byMonth[m] = {}
        r.data.forEach(txn => {
          if (txn.transactionType === 'CREDIT') return
          const day = parseInt(txn.transactionDate.split('-')[2], 10)
          byMonth[m][day] = (byMonth[m][day] || 0) + parseFloat(txn.amount)
        })
      })

      const maxDay = Math.max(...Object.values(byMonth).flatMap(d => Object.keys(d).map(Number)), 1)
      const data = Array.from({ length: maxDay }, (_, i) => {
        const day = i + 1
        const entry = { day }
        selected.forEach(m => { entry[m] = parseFloat((byMonth[m]?.[day] || 0).toFixed(2)) })
        return entry
      })
      setDailyData(data)
    }).finally(() => setLoading(false))
  }, [selected])

  const allCats = [...new Set(reports.flatMap(r => Object.keys(r.categories || {})))]
  const chartData = allCats.map(cat => {
    const entry = { category: cat.length > 10 ? cat.slice(0,10)+'…' : cat }
    reports.forEach(r => { entry[r.month] = r.categories?.[cat] || 0 })
    return entry
  })

  // Total spending trend across selected months
  const trendData = reports.map((r, i) => ({
    month: r.month,
    total: parseFloat(r.total?.toFixed(2) || 0),
    color: COLORS[i % COLORS.length],
  }))

  // Cumulative daily spend — running sum per month
  const cumulativeData = dailyData.map(row => {
    const entry = { day: row.day }
    selected.forEach(m => {
      const prev = entry[`_prev_${m}`] ?? 0
      entry[m] = parseFloat(((prev) + (row[m] || 0)).toFixed(2))
    })
    return entry
  })
  // Actually compute running sum properly
  const cumData = (() => {
    const running = {}
    selected.forEach(m => { running[m] = 0 })
    return dailyData.map(row => {
      const entry = { day: row.day }
      selected.forEach(m => {
        running[m] = parseFloat((running[m] + (row[m] || 0)).toFixed(2))
        entry[m] = running[m]
      })
      return entry
    })
  })()

  // Biggest category movers between first and last selected month
  const moversData = (() => {
    if (reports.length < 2) return []
    const first = reports[0]
    const last  = reports[reports.length - 1]
    return allCats.map(cat => {
      const before = first.categories?.[cat] || 0
      const after  = last.categories?.[cat]  || 0
      const delta  = parseFloat((after - before).toFixed(2))
      return { category: cat.length > 14 ? cat.slice(0,14)+'…' : cat, delta, before, after }
    })
      .filter(d => d.before > 0 || d.after > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8)
  })()

  const toggle = m => setSelected(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m].slice(-4))

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Compare Months</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Track how your spending habits change over time</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {months.map(m => (
          <button key={m} onClick={() => toggle(m)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={selected.includes(m)
              ? { background: 'var(--brand)', color: 'white' }
              : { background: 'var(--surface)', color: 'var(--text-2)',
                  border: '1px solid var(--border)' }}>
            {m}
          </button>
        ))}
      </div>

      {loading && <AiLoader type="compare" title="Month Comparison" />}

      {!loading && reports.length >= 2 && (
        <>
          {/* ── Monthly totals + trend ───────────────────────────────── */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Total spending trend</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>How much you spent each month overall</p>
            <div className="flex gap-3 flex-wrap mb-5">
              {reports.map((r, i) => {
                const color = COLORS[i % COLORS.length]
                const prev  = reports[i - 1]
                const pct   = prev ? ((r.total - prev.total) / prev.total * 100) : null
                return (
                  <div key={r.month} className="flex-1 min-w-[110px] p-3.5 rounded-xl"
                    style={{ background: `${color}0D`, border: `1px solid ${color}30` }}>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{r.month}</p>
                    <p className="text-xl font-semibold mt-0.5" style={{ color: 'var(--text)' }}>
                      {fmtDollar(r.total)}
                    </p>
                    {pct !== null && (
                      <p className="text-xs mt-1 font-medium" style={{ color: pct > 0 ? '#f87171' : '#4ade80' }}>
                        {pct > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs prior
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={44} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                  labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                  formatter={v => [fmtDollar(v), 'Total spent']} />
                <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2.5}
                  dot={(props) => {
                    const { cx, cy, index } = props
                    return <circle key={index} cx={cx} cy={cy} r={4} fill={COLORS[index % COLORS.length]} stroke="none" />
                  }}
                  activeDot={{ r: 6, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Spending by category (grouped bar) ──────────────────── */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Spending by category</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barGap={4}>
                <XAxis dataKey="category"
                  tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v}`} />
                <Tooltip
                  formatter={v => `$${v.toFixed(2)}`}
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: '#F1F5F9' }}
                  labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                  cursor={{ fill: 'rgba(77,142,255,0.06)' }} />
                <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
                {reports.map((r, i) => (
                  <Bar key={r.month} dataKey={r.month} fill={COLORS[i % COLORS.length]}
                    radius={[4,4,0,0]} barSize={20} fillOpacity={0.85} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Biggest category movers ──────────────────────────────── */}
          {moversData.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Biggest category movers</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                $ change from {reports[0]?.month} → {reports[reports.length - 1]?.month}
              </p>
              <ResponsiveContainer width="100%" height={Math.max(180, moversData.length * 36 + 40)}>
                <BarChart data={moversData} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${v >= 0 ? '+' : ''}${v}`} />
                  <YAxis type="category" dataKey="category" tick={{ fill: '#94A3B8', fontSize: 11 }}
                    width={110} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                    labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                    formatter={(v, _name, props) => {
                      const { before, after } = props.payload
                      return [`${fmtDollar(before)} → ${fmtDollar(after)} (${v >= 0 ? '+' : ''}${fmtDollar(v)})`, 'Change']
                    }} />
                  <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
                  <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {moversData.map((entry, i) => (
                      <Cell key={i} fill={entry.delta > 0 ? '#f87171' : '#4ade80'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Daily spending by day of month ───────────────────────── */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Daily spending by day of month</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Each line shows how much was spent on each day</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                  interval={2} />
                <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} width={44} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                  labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                  labelFormatter={v => `Day ${v}`}
                  formatter={(v, name) => [`$${v.toFixed(2)}`, name]} />
                <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
                {selected.map((m, i) => (
                  <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Cumulative daily spend ───────────────────────────────── */}
          <div className="card">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Cumulative spend through the month</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Running total — shows if spending is front-loaded or spread evenly</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cumData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                  interval={2} />
                <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} width={48} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                  labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                  labelFormatter={v => `By day ${v}`}
                  formatter={(v, name) => [fmtDollar(v), name]} />
                <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
                {selected.map((m, i) => (
                  <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!loading && selected.length < 2 && months.length > 0 && (
        <div className="card text-center py-12">
          <p className="text-3xl mb-3">📊</p>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Select at least 2 months</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Click month buttons above to compare</p>
        </div>
      )}
    </div>
  )
}
