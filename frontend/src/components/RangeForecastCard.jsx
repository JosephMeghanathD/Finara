import { useState, useEffect, useMemo } from 'react'
import { reportApi } from '../utils/api'
import { format, parseISO } from 'date-fns'
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { FianaApiLoader } from './AiLoader'
import { TrendingUp } from 'lucide-react'
import InfoTooltip from './InfoTooltip'

const TOOLTIP_STYLE = {
  background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#F1F5F9', fontSize: 12,
  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
}

const fmtDollar = v =>
  `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

/**
 * Drop-in range forecast chart card.
 *
 * Props:
 *   startDate     string  YYYY-MM-DD
 *   endDate       string  YYYY-MM-DD
 *   actualByDay   object  { 'YYYY-MM-DD': number } — pass to overlay actual spend
 *   title         string  card heading override
 *   compact       bool    shorter chart height
 */
export default function RangeForecastCard({
  startDate,
  endDate,
  actualByDay = null,
  title = 'Forecast for selected period',
  compact = false,
  bare = false,
}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)

  useEffect(() => {
    if (!startDate || !endDate) return
    setLoading(true)
    setData(null)
    setError(false)
    reportApi.forecastRange(startDate, endDate)
      .then(res => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  const hasActual = actualByDay && Object.keys(actualByDay).length > 0

  const chartData = useMemo(() => {
    if (!data?.days) return []
    return data.days.map(d => {
      const actual = hasActual ? +(actualByDay[d.date] || 0).toFixed(2) : undefined
      return {
        label:     format(parseISO(d.date), 'MMM d'),
        forecast:  d.forecast,
        bandLow:   d.confLow,
        bandWidth: +(d.confHigh - d.confLow).toFixed(2),
        actual,
      }
    })
  }, [data, actualByDay, hasActual])

  const xInterval = chartData.length <= 14 ? 0
    : chartData.length <= 31 ? 4
    : Math.ceil(chartData.length / 8) - 1

  const chartHeight = compact ? 180 : 220

  if (!startDate || !endDate) return null

  const inner = (
    <>
      {/* Header — hidden when embedded bare inside another card */}
      {!bare && (
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} style={{ color: 'var(--brand)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
            <InfoTooltip
              content="ML forecast using Exponential Smoothing. Amber line = predicted daily spend. Shaded area = confidence band (±1 SD). Blue bars = actual spend (when available)."
            />
          </div>
          {data && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                {fmtDollar(data.totalForecast)}
              </span>
              {data.totalConfLow != null && (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  band {fmtDollar(data.totalConfLow)} – {fmtDollar(data.totalConfHigh)}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded font-medium"
                style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--brand)',
                  border: '1px solid rgba(99,102,241,0.2)' }}>
                {data.totalDays}d
              </span>
            </div>
          )}
        </div>
      )}
      {/* Forecast summary row (shown when bare/embedded) */}
      {bare && data && (
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
            {fmtDollar(data.totalForecast)}
          </span>
          {data.totalConfLow != null && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              band {fmtDollar(data.totalConfLow)} – {fmtDollar(data.totalConfHigh)}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded font-medium"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--brand)',
              border: '1px solid rgba(99,102,241,0.2)' }}>
            {data.totalDays}d
          </span>
        </div>
      )}

      <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
        {hasActual
          ? 'Amber = forecast · Blue bars = actual spend · Shaded band = confidence range'
          : 'Amber line = predicted spend · Shaded band = confidence range'}
      </p>

      {loading && <FianaApiLoader text="Communicating with Fiana…" />}

      {error && !loading && (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--text-3)' }}>
          Fiana couldn't load the forecast — not enough history yet
        </p>
      )}

      {!loading && !error && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#8c909f', fontSize: 11 }}
              axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} width={44} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const get = key => payload.find(p => p.dataKey === key)?.value
              const fc = get('forecast'), lo = get('bandLow'), wi = get('bandWidth'), act = get('actual')
              return (
                <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
                  <p style={{ color: '#94A3B8', fontSize: 11, marginBottom: 6 }}>{label}</p>
                  {fc  != null && <p style={{ color: '#F59E0B', fontSize: 12, margin: '2px 0' }}>Forecast: {fmtDollar(fc)}</p>}
                  {act != null && <p style={{ color: '#0EA5E9', fontSize: 12, margin: '2px 0' }}>Actual: {fmtDollar(act)}</p>}
                  {lo  != null && wi != null && (
                    <p style={{ color: 'rgba(147,112,219,0.9)', fontSize: 11, marginTop: 4 }}>
                      Confidence: {fmtDollar(lo)} – {fmtDollar(+(lo + wi).toFixed(2))}
                    </p>
                  )}
                </div>
              )
            }} />

            {/* Confidence band */}
            <Area type="monotone" dataKey="bandLow" stackId="band"
              fill="transparent" stroke="rgba(99,102,241,0.3)" strokeWidth={1}
              strokeDasharray="3 2" dot={false} legendType="none" activeDot={false} />
            <Area type="monotone" dataKey="bandWidth" stackId="band"
              fill="rgba(99,102,241,0.12)" fillOpacity={1}
              stroke="rgba(99,102,241,0.3)" strokeWidth={1} strokeDasharray="3 2"
              dot={false} legendType="none" activeDot={false} />

            {/* Actual bars (Transactions page overlay) */}
            {hasActual && (
              <Bar dataKey="actual" fill="#0EA5E9" fillOpacity={0.65}
                radius={[2, 2, 0, 0]} maxBarSize={14} legendType="none" />
            )}

            {/* Forecast line */}
            <Line type="monotone" dataKey="forecast"
              stroke="#F59E0B" strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }} />

            <Legend content={() => (
              <div className="flex gap-4 justify-center mt-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                  <span style={{ display: 'inline-block', width: 16, height: 2, background: '#F59E0B', borderRadius: 1 }} />
                  Forecast
                </span>
                {hasActual && (
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                    <span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(14,165,233,0.65)', borderRadius: 2 }} />
                    Actual
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                  <span style={{ display: 'inline-block', width: 16, height: 8, borderRadius: 2,
                    background: 'rgba(99,102,241,0.12)', border: '1px dashed rgba(99,102,241,0.45)' }} />
                  Confidence band
                </span>
              </div>
            )} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </>
  )

  return bare ? inner : <div className="card">{inner}</div>
}
