import { useState, useEffect } from 'react'
import { txnApi, reportApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid } from 'recharts'
import AiLoader from '../components/AiLoader'

const COLORS = ['#6366F1','#8B5CF6','#0EA5E9','#F59E0B','#10B981']

const TOOLTIP_STYLE = {
  background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  color: '#F1F5F9', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
}

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
      ...selected.map(m => txnApi.list(m, m)),
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

          <div className="card">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Daily spending by day of month</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Each line shows how much was spent on each day</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}`} interval={2} />
                <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} width={44} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: '#F1F5F9' }}
                  labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                  labelFormatter={v => `Day ${v}`}
                  formatter={(v, name) => [`$${v.toFixed(2)}`, name]} />
                <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
                {selected.map((m, i) => (
                  <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Monthly totals</h3>
            <div className="flex gap-4 flex-wrap">
              {reports.map((r, i) => {
                const color = COLORS[i % COLORS.length]
                return (
                  <div key={r.month} className="flex-1 min-w-[120px] p-4 rounded-xl"
                    style={{ background: `${color}0D`, border: `1px solid ${color}30` }}>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{r.month}</p>
                    <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--text)' }}>
                      ${r.total?.toFixed(0)}
                    </p>
                  </div>
                )
              })}
            </div>
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
