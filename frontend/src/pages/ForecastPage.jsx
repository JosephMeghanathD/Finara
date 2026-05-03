import { useState, useEffect, useMemo, useRef } from 'react'
import { reportApi, txnApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { format, endOfMonth, parseISO, getDaysInMonth } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, ReferenceLine, ReferenceArea, Legend,
  ComposedChart, Area,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Calendar, FlaskConical, CalendarRange } from 'lucide-react'
import AiLoader from '../components/AiLoader'

const TOOLTIP_STYLE = {
  background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  color: '#F1F5F9', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
}

const CAT_COLORS = {
  'Food & Drink':'#6366F1','Groceries':'#8B5CF6','Transport':'#0EA5E9',
  'Shopping':'#F59E0B','Entertainment':'#10B981','Healthcare':'#EF4444',
  'Utilities':'#6B7280','Rent & Housing':'#84CC16','Travel':'#F97316',
  'Financial':'#64748B','Subscriptions':'#A78BFA','Personal Care':'#EC4899',
}

const fmtDollar = v =>
  `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const TrendBadge = ({ trend }) => {
  if (trend === 'increasing') return (
    <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
      <TrendingUp size={10} /> up
    </span>
  )
  if (trend === 'decreasing') return (
    <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
      <TrendingDown size={10} /> down
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ background: 'var(--border)', color: 'var(--text-3)' }}>
      <Minus size={10} /> stable
    </span>
  )
}

function nextMonths(latestMonth, count = 3) {
  const result = []
  let [y, m] = latestMonth.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    m++; if (m > 12) { m = 1; y++ }
    result.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return result
}

export default function ForecastPage() {
  const { months }                         = useTimeFilter()
  const [month, setMonth]                  = useState('')
  const [forecast, setForecast]            = useState(null)
  const [loading, setLoading]              = useState(false)
  const [historyLine, setHistoryLine]      = useState([])
  const [actualReport, setActualReport]    = useState(null)
  const [actualTxns, setActualTxns]        = useState([])
  const [loadingActual, setLoadingActual]  = useState(false)
  const [dailyForecast, setDailyForecast]  = useState(null)

  const [viewMode, setViewMode]            = useState('month')
  const [rangeStart, setRangeStart]        = useState('')
  const [rangeEnd, setRangeEnd]            = useState('')
  const [rangeData, setRangeData]          = useState(null)
  const [rangeLoading, setRangeLoading]    = useState(false)
  const [rangeActualTxns, setRangeActualTxns]       = useState([])
  const [rangeLoadingActual, setRangeLoadingActual] = useState(false)
  const rangeTimer                         = useRef(null)

  const isRangePast = !!rangeEnd && rangeEnd < format(new Date(), 'yyyy-MM-dd')

  const futureOptions = useMemo(() => months[0] ? nextMonths(months[0]) : [], [months])
  const pastOptions   = useMemo(() => months.slice(0, 6), [months])  // last 6 available months
  const isPastMonth   = !!month && months.includes(month)

  // Default: first future month
  useEffect(() => {
    if (months.length === 0) return
    if (!month && futureOptions[0]) setMonth(futureOptions[0])

    if (months.length >= 2) {
      reportApi.list(months.slice(0, 8).join(','))
        .then(rep => setHistoryLine(
          (rep.data || []).map(r => ({
            month: r.month, label: r.month.slice(5),
            total: Math.round(r.total || 0),
          })).reverse()
        ))
        .catch(() => {})
    }
  }, [months, futureOptions])

  // Fetch monthly forecast + daily forecast in parallel
  useEffect(() => {
    if (!month || months.length === 0) return
    setLoading(true)
    setDailyForecast(null)
    Promise.all([
      reportApi.forecast(month),
      reportApi.forecastDaily(month),
    ]).then(([fcRes, dailyRes]) => {
      setForecast(fcRes.data)
      setDailyForecast(dailyRes.data)
    }).catch(() => setForecast(null))
      .finally(() => setLoading(false))
  }, [month])

  // For past months: fetch actual report + daily transactions
  useEffect(() => {
    if (!isPastMonth) { setActualReport(null); setActualTxns([]); return }
    setLoadingActual(true)
    const startDate = month + '-01'
    const endDate   = format(endOfMonth(parseISO(month + '-01')), 'yyyy-MM-dd')
    Promise.all([reportApi.get(month), txnApi.list(startDate, endDate)])
      .then(([repRes, txnRes]) => {
        setActualReport(repRes.data)
        setActualTxns(txnRes.data || [])
      })
      .catch(() => {})
      .finally(() => setLoadingActual(false))
  }, [month, isPastMonth])

  // Default range dates to first/last of the selected month
  useEffect(() => {
    if (!month) return
    setRangeStart(month + '-01')
    setRangeEnd(format(endOfMonth(parseISO(month + '-01')), 'yyyy-MM-dd'))
  }, [month])

  // Fetch actual transactions for past date ranges
  useEffect(() => {
    if (viewMode !== 'range' || !isRangePast || !rangeStart || !rangeEnd) {
      setRangeActualTxns([]); return
    }
    setRangeLoadingActual(true)
    txnApi.list(rangeStart, rangeEnd)
      .then(r => setRangeActualTxns(r.data || []))
      .catch(() => {})
      .finally(() => setRangeLoadingActual(false))
  }, [viewMode, isRangePast, rangeStart, rangeEnd])

  // Fetch date-range forecast (debounced 400ms)
  useEffect(() => {
    if (viewMode !== 'range' || !rangeStart || !rangeEnd) return
    clearTimeout(rangeTimer.current)
    rangeTimer.current = setTimeout(() => {
      setRangeLoading(true)
      setRangeData(null)
      reportApi.forecastRange(rangeStart, rangeEnd)
        .then(res => setRangeData(res.data))
        .catch(() => setRangeData(null))
        .finally(() => setRangeLoading(false))
    }, 400)
    return () => clearTimeout(rangeTimer.current)
  }, [viewMode, rangeStart, rangeEnd])

  const forecasts  = forecast?.forecasts || {}
  const totalData  = forecasts._total || {}
  const getVal     = d => d.target_value ?? d.forecast?.[d.forecast.length - 1] ?? d.forecast?.[0]
  const total      = getVal(totalData)
  const confLow    = totalData.confidence_low
  const confHigh   = totalData.confidence_high
  const categories = Object.entries(forecasts)
    .filter(([k]) => k !== '_total')
    .sort((a, b) => (getVal(b[1]) || 0) - (getVal(a[1]) || 0))

  const actualTotal = actualReport?.total || 0
  const actualCats  = actualReport?.categories || {}

  const dailyFcTotal    = dailyForecast?.forecast
    ? +dailyForecast.forecast.reduce((s, v) => s + v, 0).toFixed(2) : null
  const dailyFcBandLow  = dailyForecast?.confidence_low
    ? +dailyForecast.confidence_low.reduce((s, v) => s + v, 0).toFixed(2) : null
  const dailyFcBandHigh = dailyForecast?.confidence_high
    ? +dailyForecast.confidence_high.reduce((s, v) => s + v, 0).toFixed(2) : null

  const heroTotal    = isPastMonth ? (dailyFcTotal    ?? total)    : total
  const heroConfLow  = isPastMonth ? (dailyFcBandLow  ?? confLow)  : confLow
  const heroConfHigh = isPastMonth ? (dailyFcBandHigh ?? confHigh) : confHigh

  const forecastErr = heroTotal != null && actualTotal > 0
    ? ((actualTotal - heroTotal) / heroTotal * 100) : null
  const withinBand  = heroConfLow != null && heroConfHigh != null
    ? actualTotal >= heroConfLow && actualTotal <= heroConfHigh : null

  // Daily breakdown data (cumulative + per-day) for past months
  const dailyData = useMemo(() => {
    if (!isPastMonth || actualTxns.length === 0 || !dailyForecast?.forecast) return []
    const N   = getDaysInMonth(parseISO(month + '-01'))
    const fc  = dailyForecast.forecast
    const clo = dailyForecast.confidence_low  || fc.map(v => Math.max(0, v - (dailyForecast.std || 0)))
    const chi = dailyForecast.confidence_high || fc.map(v => v + (dailyForecast.std || 0))

    const byDay = {}
    actualTxns.forEach(txn => {
      if (txn.transactionType === 'CREDIT') return
      const day = parseInt(txn.transactionDate.split('-')[2], 10)
      byDay[day] = (byDay[day] || 0) + parseFloat(txn.amount)
    })

    let cumA = 0, cumF = 0, cumLo = 0, cumHi = 0
    return Array.from({ length: N }, (_, i) => {
      const day = i + 1
      const spend = byDay[day] || 0
      cumA  += spend
      cumF  += fc[i]  || 0
      cumLo += clo[i] || 0
      cumHi += chi[i] || 0
      return {
        day,
        actual:       +spend.toFixed(2),
        cumActual:    +cumA.toFixed(2),
        cumForecast:  +cumF.toFixed(2),
        cumConfLow:   +cumLo.toFixed(2),
        cumConfHigh:  +cumHi.toFixed(2),
        dailyTarget:  +(fc[i] || 0).toFixed(2),
      }
    })
  }, [isPastMonth, actualTxns, dailyForecast, month])

  // Daily forecast chart data (true per-day model, all months)
  const dailyActualByDay = useMemo(() => {
    const map = {}
    actualTxns.forEach(txn => {
      if (txn.transactionType === 'CREDIT') return
      const day = parseInt(txn.transactionDate.split('-')[2], 10)
      map[day] = (map[day] || 0) + parseFloat(txn.amount)
    })
    return map
  }, [actualTxns])

  const dailyFcData = useMemo(() => {
    if (!dailyForecast?.forecast) return []
    const fc  = dailyForecast.forecast
    const std = dailyForecast.std || 0
    const confLowArr  = dailyForecast.confidence_low  || []
    const confHighArr = dailyForecast.confidence_high || []
    return fc.map((v, i) => {
      const lo = confLowArr[i]  != null ? confLowArr[i]  : +Math.max(0, v - std).toFixed(2)
      const hi = confHighArr[i] != null ? confHighArr[i] : +(v + std).toFixed(2)
      return {
        day:       i + 1,
        forecast:  +v.toFixed(2),
        bandLow:   +lo.toFixed(2),
        bandWidth: +(hi - lo).toFixed(2),
        actual:    isPastMonth ? +(dailyActualByDay[i + 1] || 0).toFixed(2) : undefined,
      }
    })
  }, [dailyForecast, isPastMonth, dailyActualByDay])

  const dailyFcCard = dailyFcData.length > 0 && (
    <div className="card card-i">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Daily forecast{isPastMonth ? ' vs actual' : ''}
        </h3>
        {dailyForecast?.model_label && (
          <span className="text-xs px-2 py-0.5 rounded font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)',
              border: '1px solid var(--border)' }}>
            {dailyForecast.model_label}
          </span>
        )}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
        {isPastMonth
          ? 'Amber = model prediction · Blue = actual · Shaded band = confidence range'
          : 'Day-by-day prediction based on weekly patterns · Shaded band = confidence range'}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={dailyFcData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: '#8c909f', fontSize: 11 }}
            axisLine={false} tickLine={false}
            tickFormatter={v => v % 5 === 0 || v === 1 ? `${v}` : ''} />
          <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} width={44} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const get = key => payload.find(p => p.dataKey === key)?.value
            const fc = get('forecast'), lo = get('bandLow'), wi = get('bandWidth'), act = get('actual')
            return (
              <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
                <p style={{ color: '#94A3B8', fontSize: 11, marginBottom: 6 }}>Day {label}</p>
                {fc  != null && <p style={{ color: '#F59E0B', fontSize: 12, margin: '2px 0' }}>Forecast: {fmtDollar(fc)}</p>}
                {act != null && <p style={{ color: '#0EA5E9', fontSize: 12, margin: '2px 0' }}>Actual: {fmtDollar(act)}</p>}
                {lo  != null && wi != null && <p style={{ color: 'rgba(147,112,219,0.9)', fontSize: 11, marginTop: 4 }}>Confidence: {fmtDollar(lo)} – {fmtDollar(+(lo + wi).toFixed(2))}</p>}
              </div>
            )
          }} />
          <Area type="monotone" dataKey="bandLow" stackId="band"
            fill="transparent" stroke="rgba(99,102,241,0.35)" strokeWidth={1} strokeDasharray="3 2"
            dot={false} legendType="none" activeDot={false} />
          <Area type="monotone" dataKey="bandWidth" stackId="band"
            fill="rgba(99,102,241,0.15)" fillOpacity={1}
            stroke="rgba(99,102,241,0.35)" strokeWidth={1} strokeDasharray="3 2"
            dot={false} legendType="none" activeDot={false} />
          <Line type="monotone" dataKey="forecast"
            stroke="#F59E0B" strokeWidth={2}
            dot={false} name="forecast" activeDot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }} />
          {isPastMonth && (
            <Line type="monotone" dataKey="actual"
              stroke="#0EA5E9" strokeWidth={2}
              dot={false} name="actual" activeDot={{ r: 4, fill: '#0EA5E9', strokeWidth: 0 }} />
          )}
          <Legend
            content={() => (
              <div className="flex gap-4 justify-center mt-2">
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                  <span style={{ display:'inline-block', width:16, height:2, background:'#F59E0B', borderRadius:1 }} />
                  Forecast
                </span>
                {isPastMonth && (
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                    <span style={{ display:'inline-block', width:16, height:2, background:'#0EA5E9', borderRadius:1 }} />
                    Actual
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                  <span style={{ display:'inline-block', width:16, height:8, borderRadius:2,
                    background:'rgba(99,102,241,0.15)', border:'1px dashed rgba(99,102,241,0.5)' }} />
                  Confidence band
                </span>
              </div>
            )} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )

  // Line chart: history + forecast dot
  const lineData = [
    ...historyLine,
    { month, label: month.slice(5), total: Math.round(total || 0), isForecast: true },
  ]

  // Bar chart (top 8 categories) for future forecast
  const barData = categories.slice(0, 8).map(([name, data]) => ({
    name:     name.length > 13 ? name.slice(0, 13) + '…' : name,
    fullName: name,
    forecast: getVal(data) || 0,
    avg:      data.historical_avg || 0,
    trend:    data.trend,
  }))

  const rangeActualByDay = useMemo(() => {
    const map = {}
    rangeActualTxns.filter(t => t.transactionType !== 'CREDIT').forEach(t => {
      map[t.transactionDate] = (map[t.transactionDate] || 0) + parseFloat(t.amount)
    })
    return map
  }, [rangeActualTxns])

  const rangeActualTotal = useMemo(
    () => +Object.values(rangeActualByDay).reduce((s, v) => s + v, 0).toFixed(2),
    [rangeActualByDay]
  )

  const rangeChartData = useMemo(() => {
    if (!rangeData?.days) return []
    return rangeData.days.map(d => ({
      date:      d.date,
      label:     format(parseISO(d.date), 'MMM d'),
      forecast:  d.forecast,
      bandLow:   d.confLow,
      bandWidth: +(d.confHigh - d.confLow).toFixed(2),
      actual:    isRangePast ? +(rangeActualByDay[d.date] || 0).toFixed(2) : undefined,
    }))
  }, [rangeData, isRangePast, rangeActualByDay])

  const isLoadingAll = loading || (isPastMonth && loadingActual)

  return (
    <div className="space-y-5">
      {/* ── Header + month picker ──────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Spending Forecast</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            ML-powered prediction based on your historical patterns
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {[['month', Calendar, 'Month'], ['range', CalendarRange, 'Date Range']].map(([mode, Icon, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                style={viewMode === mode
                  ? { background: 'var(--brand)', color: 'white' }
                  : { background: 'transparent', color: 'var(--text-2)' }}>
                <Icon size={11} />{label}
              </button>
            ))}
          </div>
        </div>

      {(pastOptions.length > 0 || futureOptions.length > 0) && viewMode === 'month' && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Past months */}
            {pastOptions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <FlaskConical size={12} style={{ color: 'var(--text-3)' }} />
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>Backtest</span>
                <div className="flex gap-1">
                  {pastOptions.map(m => (
                    <button key={m} onClick={() => setMonth(m)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={month === m
                        ? { background: '#0EA5E9', color: 'white' }
                        : { background: 'var(--surface)', color: 'var(--text-2)',
                            border: '1px solid var(--border)' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Divider */}
            {pastOptions.length > 0 && futureOptions.length > 0 && (
              <div className="w-px h-6" style={{ background: 'var(--border)' }} />
            )}

            {/* Future months */}
            {futureOptions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Calendar size={12} style={{ color: 'var(--text-3)' }} />
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>Forecast</span>
                <div className="flex gap-1">
                  {futureOptions.map(m => (
                    <button key={m} onClick={() => setMonth(m)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={month === m
                        ? { background: 'var(--brand)', color: 'white' }
                        : { background: 'var(--surface)', color: 'var(--text-2)',
                            border: '1px solid var(--border)' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {viewMode === 'month' && isLoadingAll && <AiLoader type="forecast" title={isPastMonth ? 'Loading backtest…' : 'ML Forecast'} />}

      {viewMode === 'month' && !isLoadingAll && forecast && (
        <>
          {/* ══════════════════════════════════════════════════════════
              PAST MONTH — backtest mode
          ══════════════════════════════════════════════════════════ */}
          {isPastMonth && (
            <>
              {/* Forecast vs Actual hero */}
              {heroTotal != null && (
                <div className="card card-i" style={{
                  borderColor: heroTotal == null || actualTotal === 0 ? 'rgba(14,165,233,0.25)'
                    : actualTotal > heroTotal ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)',
                  background: heroTotal == null || actualTotal === 0 ? 'rgba(14,165,233,0.05)'
                    : actualTotal > heroTotal ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)',
                }}>
                  <div className="flex items-center gap-2 mb-3">
                    <FlaskConical size={14} style={{ color: '#0EA5E9' }} />
                    <span className="text-xs font-semibold" style={{ color: '#0EA5E9' }}>
                      Backtest — {month}
                    </span>
                    {dailyForecast?.model_label && (
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ background: 'rgba(14,165,233,0.15)', color: '#0EA5E9',
                          border: '1px solid rgba(14,165,233,0.25)' }}>
                        {dailyForecast.model_label}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>Forecast was</p>
                      <p className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
                        {fmtDollar(heroTotal)}
                      </p>
                      {heroConfLow != null && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                          band {fmtDollar(heroConfLow)} – {fmtDollar(heroConfHigh)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center self-center">
                      <div className="w-8 h-px" style={{ background: 'var(--border)' }} />
                      <span className="text-xs mx-2" style={{ color: 'var(--text-3)' }}>vs</span>
                      <div className="w-8 h-px" style={{ background: 'var(--border)' }} />
                    </div>

                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>Actual spend</p>
                      <p className="text-3xl font-bold"
                        style={{ color: withinBand === false && actualTotal > heroConfHigh ? '#f87171'
                          : withinBand === false && actualTotal < heroConfLow ? '#34d399' : 'var(--text)' }}>
                        {fmtDollar(actualTotal)}
                      </p>
                      {forecastErr !== null && (
                        <p className="text-xs mt-0.5 font-medium"
                          style={{ color: forecastErr > 5 ? '#f87171' : forecastErr < -5 ? '#34d399' : '#94a3b8' }}>
                          {forecastErr > 0 ? '+' : ''}{forecastErr.toFixed(1)}% vs forecast
                          {withinBand === true && ' · within band ✓'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {dailyFcCard}

              {/* Cumulative daily chart with confidence band */}
              {dailyData.length > 0 && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    Cumulative spend vs forecast trajectory
                  </h3>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                    Shaded band = confidence range · Dashed = forecast pace · Solid = actual
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={dailyData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#8c909f', fontSize: 11 }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => v % 5 === 0 || v === 1 ? `${v}` : ''} />
                      <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} width={44} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                        labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                        labelFormatter={v => `Day ${v}`}
                        formatter={(v, name) => {
                          if (name === 'cumConfLow' || name === 'cumConfHigh') return null
                          return [fmtDollar(v), name === 'cumActual' ? 'Actual' : 'Forecast pace']
                        }} />
                      {/* Confidence band — upper and lower bound lines */}
                      <Line type="monotone" dataKey="cumConfHigh"
                        stroke="rgba(99,102,241,0.45)" strokeWidth={1} strokeDasharray="4 3"
                        dot={false} legendType="none" />
                      <Line type="monotone" dataKey="cumConfLow"
                        stroke="rgba(99,102,241,0.45)" strokeWidth={1} strokeDasharray="4 3"
                        dot={false} legendType="none" />
                      {/* Forecast trajectory */}
                      <Line type="monotone" dataKey="cumForecast"
                        stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="6 3"
                        dot={false} name="cumForecast" />
                      {/* Actual cumulative */}
                      <Line type="monotone" dataKey="cumActual"
                        stroke="#0EA5E9" strokeWidth={2.5}
                        dot={false} name="cumActual"
                        activeDot={{ r: 4, strokeWidth: 0 }} />
                      <Legend
                        content={() => (
                          <div className="flex gap-4 justify-center mt-2">
                            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                              <span style={{ display:'inline-block', width:16, height:2.5, background:'#0EA5E9', borderRadius:1 }} />
                              Actual
                            </span>
                            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                              <span style={{ display:'inline-block', width:16, borderTop:'2px dashed #F59E0B' }} />
                              Forecast pace
                            </span>
                            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                              <span style={{ display:'inline-block', width:16, borderTop:'1px dashed rgba(99,102,241,0.6)' }} />
                              Confidence bounds
                            </span>
                          </div>
                        )} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Daily spending bars */}
              {dailyData.length > 0 && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    Daily spending breakdown
                  </h3>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                    Bars = actual spend per day · Dashed = model daily forecast
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#8c909f', fontSize: 11 }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => v % 5 === 0 || v === 1 ? `${v}` : ''} />
                      <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} width={44} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                        labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                        labelFormatter={v => `Day ${v}`}
                        formatter={(v, name) => name === 'dailyTarget' ? null : [fmtDollar(v), 'Spent']} />
                      <Bar dataKey="actual" fill="#0EA5E9" fillOpacity={0.7}
                        radius={[2,2,0,0]} maxBarSize={18} />
                      <Line type="monotone" dataKey="dailyTarget" stroke="#F59E0B"
                        strokeWidth={1.5} strokeDasharray="5 3" dot={false} legendType="none" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Category forecast vs actual table */}
              {categories.length > 0 && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
                    Category forecast vs actual
                  </h3>
                  <div className="space-y-2.5">
                    {categories.map(([name, data]) => {
                      const fc     = getVal(data) || 0
                      const actual = actualCats[name] || 0
                      const diff   = fc > 0 ? ((actual - fc) / fc * 100) : null
                      const color  = CAT_COLORS[name] || '#6366F1'
                      const maxVal = Math.max(fc, actual, 1)
                      return (
                        <div key={name}>
                          <div className="flex items-center gap-3 mb-1">
                            <div className="flex items-center gap-2 w-32 flex-shrink-0">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                              <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{name}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-1">
                              <span className="text-xs w-16 text-right" style={{ color: 'var(--text-3)' }}>
                                {fmtDollar(fc)}
                              </span>
                              <span className="text-xs" style={{ color: 'var(--text-3)' }}>→</span>
                              <span className="text-xs font-semibold w-16" style={{ color: 'var(--text)' }}>
                                {actual > 0 ? fmtDollar(actual) : '—'}
                              </span>
                              {diff !== null && actual > 0 && (
                                <span className="text-xs font-medium"
                                  style={{ color: diff > 10 ? '#f87171' : diff < -10 ? '#34d399' : 'var(--text-3)' }}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Dual bar: forecast vs actual */}
                          <div className="ml-[8.5rem] space-y-0.5">
                            <div className="flex items-center gap-2">
                              <div className="w-12 text-right text-xs flex-shrink-0"
                                style={{ color: 'var(--text-3)' }}>fcst</div>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                                style={{ background: 'var(--border)' }}>
                                <div className="h-1.5 rounded-full"
                                  style={{ width: `${(fc/maxVal)*100}%`, background: `${color}88` }} />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-12 text-right text-xs flex-shrink-0"
                                style={{ color: 'var(--text-3)' }}>actual</div>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                                style={{ background: 'var(--border)' }}>
                                <div className="h-1.5 rounded-full"
                                  style={{
                                    width: `${Math.min((actual/maxVal)*100, 100)}%`,
                                    background: diff > 10 ? '#f87171' : diff < -10 ? '#34d399' : color,
                                  }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              FUTURE MONTH — standard forecast mode
          ══════════════════════════════════════════════════════════ */}
          {!isPastMonth && (
            <>
              {/* Hero card */}
              {total != null && (
                <div className="card card-i" style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'var(--brand-light)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>
                    Projected total for {month}
                  </p>
                  <p className="text-4xl font-bold mt-1" style={{ color: 'var(--text)' }}>
                    {fmtDollar(total)}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <TrendBadge trend={totalData.trend} />
                    {totalData.model_label && (
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--brand)',
                          border: '1px solid rgba(99,102,241,0.25)' }}>
                        {totalData.model_label}
                      </span>
                    )}
                    {confLow != null && confHigh != null && (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        Range: {fmtDollar(confLow)} – {fmtDollar(confHigh)}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {totalData.history_count || months.length} months of data
                    </span>
                  </div>
                </div>
              )}

              {dailyFcCard}

              {/* Historical + forecast line chart */}
              {historyLine.length >= 2 && total != null && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    Historical spending + forecast
                  </h3>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                    Shaded band shows the confidence range for {month}
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={lineData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#8c909f', fontSize: 11 }}
                        axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} width={44} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                        labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                        formatter={(v, _name, props) => [
                          `${fmtDollar(v)}${props.payload?.isForecast ? ' (forecast)' : ''}`,
                          'Total',
                        ]} />
                      {confLow != null && confHigh != null && (
                        <ReferenceArea
                          x1={month.slice(5)} x2={month.slice(5)}
                          y1={confLow} y2={confHigh}
                          fill="#F59E0B" fillOpacity={0.15}
                          stroke="#F59E0B" strokeOpacity={0.3} />
                      )}
                      <ReferenceLine x={month.slice(5)} stroke="#F59E0B" strokeDasharray="4 3"
                        label={{ value: 'Forecast', fill: '#F59E0B', fontSize: 10, position: 'insideTopRight' }} />
                      <Line type="monotone" dataKey="total" stroke="var(--brand)" strokeWidth={2}
                        dot={(p) => p.payload.isForecast
                          ? <circle key={p.key} cx={p.cx} cy={p.cy} r={6} fill="#F59E0B" stroke="#fff" strokeWidth={2} />
                          : <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill="var(--brand)" />
                        } />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Category bar chart */}
              {barData.length > 0 && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    Forecast by category
                  </h3>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                    Solid = forecast · Faded = historical average
                  </p>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData} barGap={2} barCategoryGap="28%">
                      <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }}
                        axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `$${v}`} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#F1F5F9' }}
                        labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                        formatter={(v, name) => [fmtDollar(v), name === 'forecast' ? 'Forecast' : 'Hist. avg']} />
                      <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 11 }}
                        formatter={v => v === 'forecast' ? 'Forecast' : 'Historical avg'} />
                      <Bar dataKey="avg" radius={[3,3,0,0]} maxBarSize={16}>
                        {barData.map((entry, i) => (
                          <Cell key={`avg-${i}`} fill={CAT_COLORS[entry.fullName] || '#6366F1'} fillOpacity={0.25} />
                        ))}
                      </Bar>
                      <Bar dataKey="forecast" radius={[3,3,0,0]} maxBarSize={16}>
                        {barData.map((entry, i) => (
                          <Cell key={`fc-${i}`}
                            fill={entry.trend === 'increasing' ? '#EF4444'
                              : entry.trend === 'decreasing' ? '#10B981'
                              : CAT_COLORS[entry.fullName] || '#6366F1'}
                            fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Category breakdown rows */}
              {categories.length > 0 && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
                    Category breakdown
                  </h3>
                  <div className="space-y-3">
                    {categories.map(([name, data]) => {
                      const fc      = getVal(data) || 0
                      const last    = data.last_month || 0
                      const avg     = data.historical_avg || 0
                      const pctLast = last > 0 ? ((fc - last) / last) * 100 : null
                      const color   = CAT_COLORS[name] || '#6366F1'
                      const barPct  = avg > 0 ? Math.min((fc / avg) * 100, 150) : 0
                      return (
                        <div key={name}>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 w-36 flex-shrink-0">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                              <span className="text-sm truncate" style={{ color: 'var(--text-2)' }}>{name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {last > 0 && (
                                <>
                                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{fmtDollar(last)}</span>
                                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>→</span>
                                </>
                              )}
                              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                                {fmtDollar(fc)}
                              </span>
                              {pctLast !== null && (
                                <span className="text-xs font-medium"
                                  style={{ color: pctLast > 3 ? '#f87171' : pctLast < -3 ? '#34d399' : 'var(--text-3)' }}>
                                  {pctLast > 0 ? '+' : ''}{pctLast.toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <TrendBadge trend={data.trend} />
                              {data.model && (
                                <span className="text-xs hidden md:block px-1.5 py-0.5 rounded"
                                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)',
                                    border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                                  {data.model === 'holt_winters_seasonal' ? 'HW seasonal'
                                    : data.model === 'holt_winters_trend' ? 'HW trend'
                                    : data.model === 'simple_exp_smoothing' ? 'SES'
                                    : 'mean'}
                                </span>
                              )}
                              {data.confidence_low != null && (
                                <span className="text-xs hidden sm:block" style={{ color: 'var(--text-3)' }}>
                                  {fmtDollar(data.confidence_low)}–{fmtDollar(data.confidence_high)}
                                </span>
                              )}
                            </div>
                          </div>
                          {avg > 0 && (
                            <div className="mt-1.5 ml-10 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                                style={{ background: 'var(--border)' }}>
                                <div className="h-1.5 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(barPct, 100)}%`,
                                    background: data.trend === 'increasing'
                                      ? 'linear-gradient(90deg,#f87171,#ef4444)'
                                      : data.trend === 'decreasing'
                                        ? 'linear-gradient(90deg,#34d399,#10b981)'
                                        : `linear-gradient(90deg,${color}99,${color})`,
                                  }} />
                              </div>
                              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                                avg {fmtDollar(avg)}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

        </>
      )}

      {!isLoadingAll && !forecast && viewMode === 'month' && (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📈</p>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Not enough data for forecast</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Upload at least 2 months of transactions</p>
        </div>
      )}

      {/* ── Date Range view ─────────────────────────────────────────── */}
      {viewMode === 'range' && (
        <div className="space-y-5">
          {/* Date pickers */}
          <div className="card card-i">
            <div className="flex flex-wrap items-center gap-4">
              <CalendarRange size={15} style={{ color: 'var(--brand)', flexShrink: 0 }} />
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>From</label>
                  <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>→</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>To</label>
                  <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
                </div>
              </div>
            </div>
          </div>

          {rangeLoading && <AiLoader type="forecast" title="Fiana is computing your range forecast…" />}

          {!rangeLoading && rangeData && !rangeData.error && (
            <>
              {/* Hero card — backtest style for past ranges, standard for future */}
              {isRangePast && rangeActualTotal > 0 ? (
                <div className="card card-i" style={{
                  borderColor: rangeActualTotal > rangeData.totalForecast ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)',
                  background:  rangeActualTotal > rangeData.totalForecast ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)',
                }}>
                  <div className="flex items-center gap-2 mb-3">
                    <FlaskConical size={14} style={{ color: '#0EA5E9' }} />
                    <span className="text-xs font-semibold" style={{ color: '#0EA5E9' }}>
                      Backtest — {rangeData.startDate} → {rangeData.endDate}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: 'rgba(14,165,233,0.15)', color: '#0EA5E9',
                        border: '1px solid rgba(14,165,233,0.25)' }}>
                      {rangeData.totalDays}d range
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>Forecast was</p>
                      <p className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
                        {fmtDollar(rangeData.totalForecast)}
                      </p>
                      {rangeData.totalConfLow != null && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                          band {fmtDollar(rangeData.totalConfLow)} – {fmtDollar(rangeData.totalConfHigh)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center self-center">
                      <div className="w-8 h-px" style={{ background: 'var(--border)' }} />
                      <span className="text-xs mx-2" style={{ color: 'var(--text-3)' }}>vs</span>
                      <div className="w-8 h-px" style={{ background: 'var(--border)' }} />
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>Actual spend</p>
                      <p className="text-3xl font-bold"
                        style={{ color: rangeActualTotal > rangeData.totalForecast ? '#f87171' : '#34d399' }}>
                        {fmtDollar(rangeActualTotal)}
                      </p>
                      <p className="text-xs mt-0.5 font-medium"
                        style={{ color: rangeActualTotal > rangeData.totalForecast ? '#f87171' : '#34d399' }}>
                        {rangeActualTotal > rangeData.totalForecast ? '+' : ''}
                        {(((rangeActualTotal - rangeData.totalForecast) / rangeData.totalForecast) * 100).toFixed(1)}% vs forecast
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card card-i" style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'var(--brand-light)' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-3)' }}>
                    Forecast for {rangeData.startDate} → {rangeData.endDate}
                  </p>
                  <p className="text-4xl font-bold" style={{ color: 'var(--text)' }}>
                    {fmtDollar(rangeData.totalForecast)}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {rangeData.totalDays > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        avg {fmtDollar(+(rangeData.totalForecast / rangeData.totalDays).toFixed(2))}/day
                        over {rangeData.totalDays} days
                      </span>
                    )}
                    {rangeData.totalConfLow != null && (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        band {fmtDollar(rangeData.totalConfLow)} – {fmtDollar(rangeData.totalConfHigh)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Per-day chart */}
              {rangeChartData.length > 0 && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                    {isRangePast && rangeActualTotal > 0 ? 'Forecast vs actual spend' : 'Day-by-day forecast'}
                  </h3>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                    {isRangePast && rangeActualTotal > 0
                      ? 'Amber = forecast · Blue bars = actual spend · Shaded band = confidence range'
                      : 'Amber line = predicted spend · Shaded band = confidence range'}
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={rangeChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#8c909f', fontSize: 11 }}
                        axisLine={false} tickLine={false}
                        interval={Math.max(0, Math.ceil(rangeChartData.length / 10) - 1)} />
                      <YAxis tick={{ fill: '#8c909f', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} width={44} />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const get = key => payload.find(p => p.dataKey === key)?.value
                        const fc = get('forecast'), lo = get('bandLow'), wi = get('bandWidth'), act = get('actual')
                        return (
                          <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
                            <p style={{ color: '#94A3B8', fontSize: 11, marginBottom: 6 }}>{label}</p>
                            {fc  != null && <p style={{ color: '#F59E0B', fontSize: 12, margin: '2px 0' }}>Forecast: {fmtDollar(fc)}</p>}
                            {act != null && act > 0 && <p style={{ color: '#0EA5E9', fontSize: 12, margin: '2px 0' }}>Actual: {fmtDollar(act)}</p>}
                            {lo  != null && wi != null && <p style={{ color: 'rgba(147,112,219,0.9)', fontSize: 11, marginTop: 4 }}>Confidence: {fmtDollar(lo)} – {fmtDollar(+(lo + wi).toFixed(2))}</p>}
                          </div>
                        )
                      }} />
                      <Area type="monotone" dataKey="bandLow" stackId="band"
                        fill="transparent" stroke="rgba(99,102,241,0.35)" strokeWidth={1}
                        strokeDasharray="3 2" dot={false} legendType="none" activeDot={false} />
                      <Area type="monotone" dataKey="bandWidth" stackId="band"
                        fill="rgba(99,102,241,0.15)" fillOpacity={1}
                        stroke="rgba(99,102,241,0.35)" strokeWidth={1} strokeDasharray="3 2"
                        dot={false} legendType="none" activeDot={false} />
                      {isRangePast && rangeActualTotal > 0 && (
                        <Bar dataKey="actual" fill="#0EA5E9" fillOpacity={0.65}
                          radius={[2, 2, 0, 0]} maxBarSize={14} legendType="none" />
                      )}
                      <Line type="monotone" dataKey="forecast"
                        stroke="#F59E0B" strokeWidth={2} dot={false}
                        activeDot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }} />
                      <Legend content={() => (
                        <div className="flex gap-4 justify-center mt-2 flex-wrap">
                          <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                            <span style={{ display: 'inline-block', width: 16, height: 2, background: '#F59E0B', borderRadius: 1 }} />
                            Forecast
                          </span>
                          {isRangePast && rangeActualTotal > 0 && (
                            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                              <span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(14,165,233,0.65)', borderRadius: 2 }} />
                              Actual
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 text-xs" style={{ color: '#94A3B8' }}>
                            <span style={{ display: 'inline-block', width: 16, height: 8, borderRadius: 2,
                              background: 'rgba(99,102,241,0.15)', border: '1px dashed rgba(99,102,241,0.5)' }} />
                            Confidence band
                          </span>
                        </div>
                      )} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Per-day table for small ranges */}
              {rangeChartData.length > 0 && rangeChartData.length <= 14 && (
                <div className="card card-i">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Daily breakdown</h3>
                  <div className="space-y-1.5">
                    {rangeData.days.map(d => (
                      <div key={d.date} className="flex items-center gap-3">
                        <span className="text-xs w-24 flex-shrink-0 font-medium" style={{ color: 'var(--text-2)' }}>
                          {format(parseISO(d.date), 'EEE, MMM d')}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.min((d.forecast / (rangeData.totalForecast / rangeData.totalDays * 2)) * 100, 100)}%`,
                              background: 'linear-gradient(90deg,#6366f1,#F59E0B)',
                            }} />
                        </div>
                        <span className="text-xs w-16 text-right font-semibold" style={{ color: 'var(--text)' }}>
                          {fmtDollar(d.forecast)}
                        </span>
                        <span className="text-xs w-28 text-right hidden sm:block" style={{ color: 'var(--text-3)' }}>
                          {fmtDollar(d.confLow)} – {fmtDollar(d.confHigh)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!rangeLoading && rangeData?.error && (
            <div className="card text-center py-10">
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{rangeData.error}</p>
            </div>
          )}

          {!rangeLoading && !rangeData && !rangeLoading && (
            <div className="card text-center py-10">
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Pick a date range above to see the forecast</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
