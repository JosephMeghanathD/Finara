import { useState, useEffect } from 'react'
import { reportApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import AiLoader from '../components/AiLoader'

const TOOLTIP_STYLE = {
  background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  color: '#F1F5F9', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
}

const TrendIcon = ({ trend }) => {
  if (trend === 'increasing') return <TrendingUp size={14} style={{ color: '#EF4444' }} />
  if (trend === 'decreasing') return <TrendingDown size={14} style={{ color: '#34d399' }} />
  return <Minus size={14} style={{ color: '#94A3B8' }} />
}

export default function ForecastPage() {
  const { months } = useTimeFilter()
  const [month, setMonth]         = useState('')
  const [forecast, setForecast]   = useState(null)
  const [loading, setLoading]     = useState(false)
  const [historyLine, setHistoryLine] = useState([])

  useEffect(() => {
    if (months.length === 0) return
    if (!month && months[0]) {
      const [y, m] = months[0].split('-').map(Number)
      const next = m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`
      setMonth(next)
    }
    if (months.length >= 2) {
      reportApi.list(months.slice(0, 8).join(','))
        .then(rep => setHistoryLine(
          (rep.data || []).map(m => ({ month: m.month.slice(5), total: Math.round(m.total || 0) })).reverse()
        ))
        .catch(() => {})
    }
  }, [months])

  useEffect(() => {
    if (!month || months.length === 0) return
    setLoading(true)
    reportApi.forecast(month)
      .then(r => setForecast(r.data))
      .catch(() => setForecast(null))
      .finally(() => setLoading(false))
  }, [month])

  const forecasts  = forecast?.forecasts || {}
  const categories = Object.entries(forecasts).filter(([k]) => k !== '_total')
  const total      = forecasts._total?.forecast?.[0]

  const chartData = categories.map(([name, data]) => ({
    name: name.length > 12 ? name.slice(0, 12) + '…' : name,
    amount: data.forecast?.[0] || 0,
    trend: data.trend,
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Spending Forecast</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            ML-powered prediction based on your historical patterns
          </p>
        </div>
      </div>

      {loading && <AiLoader type="forecast" title="ML Forecast" />}

      {!loading && forecast && (
        <>
          {total && (
            <div className="card" style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'var(--brand-light)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>Projected total for {month}</p>
              <p className="text-4xl font-bold mt-1" style={{ color: 'var(--text)' }}>${total.toFixed(2)}</p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
                Trend: {forecasts._total?.trend || 'stable'} · Based on last {months.length} months
              </p>
            </div>
          )}

          {historyLine.length >= 2 && (
            <div className="card">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Historical spending + forecast</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Dotted line shows projected total for {month}</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={[...historyLine, { month: month.slice(5), total: Math.round(total || 0), forecast: true }]}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} width={44} />
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#e1e2ec' }} labelStyle={{ color: '#8c909f' }}
                    formatter={v => [`$${v.toLocaleString()}`, 'Total']} />
                  <Line type="monotone" dataKey="total" stroke="var(--brand)" strokeWidth={2}
                    dot={(p) => p.payload.forecast
                      ? <circle key={p.key} cx={p.cx} cy={p.cy} r={6} fill="#F59E0B" stroke="#fff" strokeWidth={2} />
                      : <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill="var(--brand)" />}
                    strokeDasharray={(d) => d.forecast ? '6 3' : undefined} />
                  <ReferenceLine x={month.slice(5)} stroke="#F59E0B" strokeDasharray="4 3"
                    label={{ value: 'Forecast', fill: '#F59E0B', fontSize: 10, position: 'insideTopRight' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Forecast by category</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="name"
                  tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v}`} />
                <Tooltip
                  formatter={v => `$${v.toFixed(2)}`}
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: '#F1F5F9' }}
                  labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                  cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
                <Bar dataKey="amount" radius={[6,6,0,0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={
                      entry.trend === 'increasing' ? '#EF4444' :
                      entry.trend === 'decreasing' ? '#10B981' : '#6366F1'
                    } fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Category breakdown</h3>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {categories.map(([name, data]) => (
                <div key={name} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <TrendIcon trend={data.trend} />
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>{name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs capitalize" style={{ color: 'var(--text-3)' }}>{data.trend}</span>
                    <span className="font-mono text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      ${data.forecast?.[0]?.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && !forecast && (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📈</p>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Not enough data for forecast</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Upload at least 2 months of transactions</p>
        </div>
      )}
    </div>
  )
}
