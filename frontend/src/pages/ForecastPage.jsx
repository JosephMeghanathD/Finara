import { useState, useEffect, useMemo, useRef } from 'react'
import { reportApi, txnApi, budgetApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { format, endOfMonth, parseISO, getDaysInMonth } from 'date-fns'
import {
  ComposedChart, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Line, CartesianGrid, ReferenceLine,
  ReferenceArea, Legend, Area,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, Calendar, FlaskConical,
  CalendarRange, Zap, Activity, ArrowUp, ArrowDown, Eye,
  Sparkles, RefreshCw, Brain, Target, Layers, Check, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AiLoader from '../components/AiLoader'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

// ── Constants ──────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: '#0f1322', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: '#e8eaf6', fontSize: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

const CAT_COLORS = {
  'Food & Drink':'#6366F1','Groceries':'#8B5CF6','Transport':'#0EA5E9',
  'Shopping':'#F59E0B','Entertainment':'#10B981','Healthcare':'#EF4444',
  'Utilities':'#6B7280','Rent & Housing':'#84CC16','Travel':'#F97316',
  'Financial':'#64748B','Subscriptions':'#A78BFA','Personal Care':'#EC4899',
}

const CONF_TIER = {
  high:   { color: '#10B981', label: 'HIGH',   glow: 'rgba(16,185,129,0.25)' },
  medium: { color: '#F59E0B', label: 'MED',    glow: 'rgba(245,158,11,0.25)' },
  low:    { color: '#EF4444', label: 'LOW',    glow: 'rgba(239,68,68,0.25)'  },
}

const fmtK  = v => `$${Number(v) >= 1000 ? (Number(v)/1000).toFixed(1)+'k' : Number(v).toFixed(0)}`
const fmtD  = v => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtDc = v => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function nextMonths(latestMonth, count = 3) {
  const result = []
  let [y, m] = latestMonth.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    m++; if (m > 12) { m = 1; y++ }
    result.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return result
}

// ── Count-up animation ─────────────────────────────────────────────────────────

function useCountUp(target, duration = 1300) {
  const [val, setVal] = useState(0)
  const rafRef = useRef()
  useEffect(() => {
    if (!target) { setVal(0); return }
    const start = performance.now()
    const tick  = (now) => {
      const t      = Math.min((now - start) / duration, 1)
      const eased  = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(target * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return val
}

// ── Mini animated bar ──────────────────────────────────────────────────────────

function AnimBar({ pct, color, delay = 0, height = 4 }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(pct, 100)), delay)
    return () => clearTimeout(t)
  }, [pct, delay])
  return (
    <div style={{ height, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 999,
        background: `linear-gradient(90deg, ${color}88, ${color})`,
        width: `${w}%`, transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
    </div>
  )
}

// ── Velocity gauge (pace for in-progress months) ───────────────────────────────

function VelocityCard({ daysElapsed, daysInMonth, spentSoFar, forecastedToDate,
                        forecastTotal, burnRate, forecastBurnRate, projectedTotal,
                        isCurrentMonth }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 180); return () => clearTimeout(t) }, [])

  // Both bars share the same scale: % of total monthly forecast
  const fcPct     = forecastTotal > 0 ? Math.min((forecastedToDate / forecastTotal) * 100, 100) : 0
  const actualPct = forecastTotal > 0 ? Math.min((spentSoFar     / forecastTotal) * 100, 100) : 0
  const dayPct    = Math.min((daysElapsed / daysInMonth) * 100, 99.5)
  const isOver    = spentSoFar > forecastedToDate * 1.05
  const isUnder   = spentSoFar < forecastedToDate * 0.9
  const actColor  = isOver ? '#EF4444' : '#10B981'
  const diffPct   = forecastedToDate > 0
    ? ((spentSoFar - forecastedToDate) / forecastedToDate * 100) : 0

  const LABEL_W = 108  // px — fixed left-label column

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '16px 20px',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.3)',
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Activity size={12} style={{ color: actColor }} />
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
            {isCurrentMonth ? 'Live Pace' : 'Month Pace'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>
            Day {daysElapsed} / {daysInMonth}
          </span>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
          background: isOver ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
          color: actColor, border: `1px solid ${actColor}33`,
        }}>
          {isOver   ? `+${Math.abs(diffPct).toFixed(1)}% over pace`
          : isUnder ? `${Math.abs(diffPct).toFixed(1)}% under pace`
          :           'On pace ✓'}
        </span>
      </div>

      {/* ── Dual bars ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { label: 'Forecast pace', pct: fcPct,     val: forecastedToDate, color: '#F59E0B', delay: 280 },
          { label: 'Your pace',     pct: actualPct, val: spentSoFar,       color: actColor,  delay: 420 },
        ].map(({ label, pct, val, color, delay }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Fixed-width row label */}
            <span style={{
              width: LABEL_W, flexShrink: 0, textAlign: 'right',
              fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {label}
            </span>
            {/* Bar */}
            <div style={{
              flex: 1, position: 'relative', height: 9,
              borderRadius: 999, background: 'var(--surface-3)',
              overflow: 'hidden',
            }}>
              {/* Days-elapsed ghost backdrop */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(255,255,255,0.035)',
                width: `${dayPct}%`,
              }} />
              {/* Filled bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${color}55, ${color})`,
                width: mounted ? `${pct}%` : '0%',
                transition: `width 0.95s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
                boxShadow: `0 0 8px ${color}44`,
              }} />
            </div>
            {/* Value + % */}
            <span style={{
              width: 56, flexShrink: 0, textAlign: 'right',
              fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color,
            }}>
              {fmtD(val)}
            </span>
            <span style={{
              width: 32, flexShrink: 0,
              fontFamily: 'JetBrains Mono', fontSize: 10,
              color: 'var(--text-3)', textAlign: 'right',
            }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        ))}

        {/* Day axis — sits below both bars, aligned to bar column */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          <div style={{ flex: 1, position: 'relative', height: 14 }}>
            <span style={{
              position: 'absolute', left: 0,
              fontSize: 9, color: 'var(--text-3)',
              fontFamily: 'JetBrains Mono', userSelect: 'none',
            }}>1</span>
            <span style={{
              position: 'absolute',
              left: `${Math.min(Math.max(dayPct, 5), 92)}%`,
              transform: 'translateX(-50%)',
              fontSize: 9, color: 'rgba(255,255,255,0.28)',
              fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap', userSelect: 'none',
            }}>
              ▴ {daysElapsed}
            </span>
            <span style={{
              position: 'absolute', right: 0,
              fontSize: 9, color: 'var(--text-3)',
              fontFamily: 'JetBrains Mono', userSelect: 'none',
            }}>{daysInMonth}</span>
          </div>
          <div style={{ width: 56 + 12 + 32, flexShrink: 0 }} />
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10, marginTop: 14, paddingTop: 14,
        borderTop: '1px solid var(--border)',
      }}>
        {[
          { label: 'Spent',           value: fmtD(spentSoFar),      color: actColor               },
          { label: 'On-pace target',  value: fmtD(forecastedToDate), color: '#F59E0B'              },
          { label: 'Daily burn',      value: `${fmtDc(burnRate)}/d`, sub: `fc ${fmtDc(forecastBurnRate)}/d`, color: actColor },
          { label: 'Projected total', value: fmtD(projectedTotal),   color: isOver ? '#EF4444' : 'var(--text)' },
        ].map(({ label, value, sub, color }) => (
          <div key={label}>
            <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
            <p style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
            {sub && <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Insights triptych ──────────────────────────────────────────────────────────

function InsightCard({ type, data, catColors }) {
  const configs = {
    riser: {
      icon: ArrowUp, color: '#EF4444', bg: 'rgba(239,68,68,0.08)',
      border: 'rgba(239,68,68,0.2)', label: 'RISING',
      empty: 'All categories are stable or declining',
    },
    faller: {
      icon: ArrowDown, color: '#10B981', bg: 'rgba(16,185,129,0.08)',
      border: 'rgba(16,185,129,0.2)', label: 'SAVING',
      empty: 'No significant projected savings',
    },
    watch: {
      icon: Eye, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',
      border: 'rgba(245,158,11,0.2)', label: 'WATCH',
      empty: 'All categories are near average',
    },
  }
  const cfg  = configs[type]
  const Icon = cfg.icon
  const catColor = data ? (catColors[data.category] || cfg.color) : cfg.color

  return (
    <div style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderLeft: `3px solid ${cfg.color}`, borderRadius: 12, padding: '14px 16px',
      flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Icon size={12} style={{ color: cfg.color }} />
        <span style={{
          fontFamily: 'Bebas Neue, sans-serif', fontSize: 11,
          letterSpacing: '0.1em', color: cfg.color,
        }}>{cfg.label}</span>
      </div>
      {data ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.2 }}>{data.category}</p>
          </div>
          <p style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 800,
            color: cfg.color, lineHeight: 1, marginBottom: 4,
          }}>
            {type === 'faller' && data.savings_potential != null
              ? fmtD(data.savings_potential)
              : fmtD(data.forecast)}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>
            {type === 'riser' && `+${data.pct_change}% vs last month · was ${fmtD(data.last_month)}`}
            {type === 'faller' && `${data.pct_change}% vs last month · projected saving`}
            {type === 'watch' && data.reason}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{cfg.empty}</p>
      )}
    </div>
  )
}

// ── Momentum strip ─────────────────────────────────────────────────────────────

function MomentumChip({ name, forecastVal, lastMonth, color }) {
  if (!lastMonth || lastMonth === 0) return null
  const pct = ((forecastVal - lastMonth) / lastMonth) * 100
  const up  = pct > 2
  const dn  = pct < -2
  const chipColor = up ? '#EF4444' : dn ? '#10B981' : 'var(--text-3)'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
      padding: '6px 12px', borderRadius: 10,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>
        {fmtD(forecastVal)}
      </span>
      <span style={{
        fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: chipColor,
        display: 'flex', alignItems: 'center', gap: 2,
      }}>
        {up ? '↑' : dn ? '↓' : '–'}
        {Math.abs(pct) >= 0.5 ? `${Math.abs(pct).toFixed(0)}%` : ''}
      </span>
    </div>
  )
}

// ── Trend badge ────────────────────────────────────────────────────────────────

function TrendBadge({ trend }) {
  if (trend === 'increasing') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:999, fontSize:10, fontWeight:700, background:'rgba(239,68,68,0.12)', color:'#f87171' }}>
      <TrendingUp size={9} /> up
    </span>
  )
  if (trend === 'decreasing') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:999, fontSize:10, fontWeight:700, background:'rgba(52,211,153,0.12)', color:'#34d399' }}>
      <TrendingDown size={9} /> down
    </span>
  )
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:999, fontSize:10, fontWeight:700, background:'var(--surface-2)', color:'var(--text-3)', border:'1px solid var(--border)' }}>
      <Minus size={9} /> stable
    </span>
  )
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, labelPrefix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '10px 14px', minWidth: 130 }}>
      <p style={{ color: '#6b729a', fontSize: 10, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {labelPrefix}{label}
      </p>
      {payload.filter(p => p.dataKey !== 'bandLow' && p.dataKey !== 'bandWidth').map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke || 'var(--text)', fontSize: 12, margin: '2px 0', fontFamily: 'JetBrains Mono, monospace' }}>
          {fmtD(p.value)}
          <span style={{ fontSize: 10, color: '#6b729a', marginLeft: 6 }}>
            {p.name === 'forecast' ? 'Forecast'
              : p.name === 'actual' ? 'Actual'
              : p.name === 'cumActual' ? 'Actual (cum.)'
              : p.name === 'cumForecast' ? 'Forecast pace'
              : p.name === 'total' ? 'Total'
              : p.name}
          </span>
        </p>
      ))}
    </div>
  )
}

// ── Seasonality heatmap ────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function SeasonalityHeatmap({ profiles, catColors }) {
  const entries = Object.entries(profiles)
    .filter(([, p]) => Array.isArray(p.index) && p.index.length === 12)
    .sort((a, b) => (b[1].avg_spend || 0) - (a[1].avg_spend || 0))
    .slice(0, 8)

  const cellBg = idx => {
    if (idx >= 1.5)  return 'rgba(245,158,11,0.85)'
    if (idx >= 1.25) return 'rgba(245,158,11,0.55)'
    if (idx >= 1.1)  return 'rgba(245,158,11,0.30)'
    if (idx <= 0.5)  return 'rgba(99,102,241,0.55)'
    if (idx <= 0.75) return 'rgba(99,102,241,0.35)'
    if (idx <= 0.9)  return 'rgba(99,102,241,0.15)'
    return 'rgba(255,255,255,0.06)'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Month label header */}
      <div style={{ display: 'grid', gridTemplateColumns: '130px repeat(12, 1fr)', gap: 3, minWidth: 500, marginBottom: 5 }}>
        <div />
        {MONTHS_SHORT.map(m => (
          <div key={m} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{m}</div>
        ))}
      </div>
      {entries.map(([cat, profile]) => {
        const color = catColors[cat] || '#6366F1'
        return (
          <div key={cat} style={{ display: 'grid', gridTemplateColumns: '130px repeat(12, 1fr)', gap: 3, minWidth: 500, marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingRight: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
            </div>
            {profile.index.map((idx, i) => {
              const isPeak   = i + 1 === profile.peak_month
              const isTrough = i + 1 === profile.trough_month
              return (
                <div key={i} title={`${MONTHS_SHORT[i]}: ${idx.toFixed(2)}× avg · $${(profile.avg_spend * idx).toFixed(0)}`}
                  style={{
                    height: 22, borderRadius: 4,
                    background: cellBg(idx),
                    border: isPeak ? `1px solid ${color}66` : '1px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'default',
                  }}>
                  {isPeak   && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)', lineHeight: 1 }}>▲</span>}
                  {isTrough && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)',  lineHeight: 1 }}>▼</span>}
                </div>
              )
            })}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center' }}>
        {[
          { bg: 'rgba(99,102,241,0.45)',  label: '↓ Below avg' },
          { bg: 'rgba(255,255,255,0.06)', label: '≈ Average'   },
          { bg: 'rgba(245,158,11,0.55)',  label: '↑ Above avg' },
        ].map(({ bg, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
            <div style={{ width: 14, height: 10, borderRadius: 2, background: bg }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Multi-period chart ─────────────────────────────────────────────────────────

function MultiPeriodChart({ data }) {
  const total = data?.forecasts?._total
  if (!total?.forecast) return null

  const fc     = total.forecast
  const lo     = total.confidence_low_series  || fc.map((v, i) => Math.max(0, v * (1 - 0.10 * (i + 1))))
  const hi     = total.confidence_high_series || fc.map((v, i) => v * (1 + 0.10 * (i + 1)))
  const months = data.forecast_months || []
  const totalFc = fc.reduce((s, v) => s + v, 0)
  const avgFc   = fc.length > 0 ? totalFc / fc.length : 0

  const chartData = months.map((m, i) => ({
    label:     m.slice(5),
    forecast:  fc[i]  || 0,
    bandLow:   lo[i]  || 0,
    bandWidth: Math.max(0, (hi[i] || 0) - (lo[i] || 0)),
  }))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{data.periods}-Month Outlook</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Confidence bands widen each period — uncertainty compounds over time</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{fmtD(totalFc)}</p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>total · {fmtD(avgFc)}/mo avg</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={42} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="bandLow" stackId="band" fill="transparent"
            stroke="rgba(99,102,241,0.3)" strokeWidth={1} strokeDasharray="3 2"
            dot={false} legendType="none" activeDot={false} />
          <Area type="monotone" dataKey="bandWidth" stackId="band"
            fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.3)"
            strokeWidth={1} strokeDasharray="3 2" dot={false} legendType="none" activeDot={false} />
          <Line type="monotone" dataKey="forecast" stroke="var(--brand)" strokeWidth={2.5} name="forecast"
            dot={{ fill: 'var(--brand)', r: 5, strokeWidth: 2, stroke: '#0f1322' }}
            activeDot={{ r: 6, fill: 'var(--brand)', strokeWidth: 0 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}

// ── Accuracy card ──────────────────────────────────────────────────────────────

function AccuracyCard({ accuracy, loading, onRecalculate }) {
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand)' }} />
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Computing accuracy…</span>
    </div>
  )
  if (!accuracy || accuracy.error) return null

  const grade      = accuracy.grade
  const gradeColor = grade === 'A' ? '#10B981' : grade === 'B' ? '#F59E0B' : grade === 'C' ? '#F97316' : '#EF4444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${gradeColor}22` }}>
      <Target size={12} style={{ color: gradeColor, flexShrink: 0 }} />
      <div style={{ flexShrink: 0 }}>
        <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1, marginBottom: 1 }}>Model Accuracy</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: gradeColor, letterSpacing: '0.05em', lineHeight: 1 }}>{grade}</span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{accuracy.overall_mape.toFixed(1)}% MAPE</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {(accuracy.month_results || []).map(r => {
          const dot = r.mape < 15 ? '#10B981' : r.mape < 25 ? '#F59E0B' : '#EF4444'
          return (
            <div key={r.month} title={`${r.month}: ${r.mape.toFixed(1)}% MAPE · forecast ${fmtD(r.forecast)} vs actual ${fmtD(r.actual)}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
              <span style={{ fontSize: 8, color: 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>{r.month.slice(5)}</span>
            </div>
          )
        })}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
        over {accuracy.months_evaluated} month{accuracy.months_evaluated !== 1 ? 's' : ''}
      </span>
      <button onClick={onRecalculate} style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, flexShrink: 0 }}>
        ↺ recalc
      </button>
    </div>
  )
}

// ── Budget confirm dialog ──────────────────────────────────────────────────────

function BudgetConfirmDialog({ month, count, total, onConfirm, onCancel, applying }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', maxWidth: 380, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.06em', color: 'var(--text)', marginBottom: 10 }}>Apply AI Budgets?</p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 8 }}>
          Set ML-suggested budgets for <strong style={{ color: 'var(--text)' }}>{month}</strong> across{' '}
          <strong style={{ color: 'var(--text)' }}>{count} categories</strong>.
        </p>
        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, color: '#A78BFA', marginBottom: 16 }}>{total} total</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 22 }}>
          Each budget includes a trend-based buffer. You can always adjust on the Budget page.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={applying}
            style={{ padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={applying}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: 'rgba(99,102,241,0.18)', color: '#A78BFA', border: '1px solid rgba(99,102,241,0.4)', cursor: applying ? 'not-allowed' : 'pointer', opacity: applying ? 0.65 : 1 }}>
            <Check size={12} />{applying ? 'Applying…' : 'Apply Budget'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

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
  const [refreshing, setRefreshing]        = useState(false)
  const [viewMode, setViewMode]            = useState('month')
  const [rangeStart, setRangeStart]        = useState('')
  const [rangeEnd, setRangeEnd]            = useState('')
  const [rangeData, setRangeData]          = useState(null)
  const [rangeLoading, setRangeLoading]    = useState(false)
  const [rangeActualTxns, setRangeActualTxns] = useState([])
  const rangeTimer                         = useRef(null)

  // ── New ML features ─────────────────────────────────────────────────────────
  const [multiPeriods, setMultiPeriods]     = useState(6)
  const [multiData, setMultiData]           = useState(null)
  const [multiLoading, setMultiLoading]     = useState(false)
  const [budgetSuggest, setBudgetSuggest]   = useState(null)
  const [budgetLoading, setBudgetLoading]   = useState(false)
  const [budgetConfirm, setBudgetConfirm]   = useState(false)
  const [budgetApplying, setBudgetApplying] = useState(false)
  const [seasonality, setSeasonality]       = useState(null)
  const [seasonalityLoading, setSeasonalityLoading] = useState(false)
  const [showSeasonality, setShowSeasonality] = useState(false)
  const [accuracy, setAccuracy]             = useState(null)
  const [accuracyLoading, setAccuracyLoading] = useState(false)
  const accuracyFetched                     = useRef(false)

  const isRangePast   = !!rangeEnd && rangeEnd < format(new Date(), 'yyyy-MM-dd')
  const futureOptions = useMemo(() => months[0] ? nextMonths(months[0]) : [], [months])
  const pastOptions   = useMemo(() => months.slice(0, 6), [months])
  const isPastMonth   = !!month && months.includes(month)
  const isCurrentMonth = month === format(new Date(), 'yyyy-MM')

  useEffect(() => {
    if (months.length === 0) return
    if (!month && futureOptions[0]) setMonth(futureOptions[0])
    if (months.length >= 2) {
      reportApi.list(months.slice(0, 8).join(','))
        .then(rep => setHistoryLine(
          (rep.data || []).map(r => ({ month: r.month, label: r.month.slice(5), total: Math.round(r.total || 0) })).reverse()
        ))
        .catch(() => {})
    }
  }, [months, futureOptions])

  useEffect(() => {
    if (!month || months.length === 0) return
    setLoading(true); setDailyForecast(null)
    Promise.all([reportApi.forecast(month), reportApi.forecastDaily(month)])
      .then(([fcRes, dailyRes]) => { setForecast(fcRes.data); setDailyForecast(dailyRes.data) })
      .catch(() => setForecast(null))
      .finally(() => setLoading(false))
  }, [month])

  useEffect(() => {
    if (!isPastMonth) { setActualReport(null); setActualTxns([]); return }
    setLoadingActual(true)
    const startDate = month + '-01'
    const endDate   = format(endOfMonth(parseISO(month + '-01')), 'yyyy-MM-dd')
    Promise.all([reportApi.get(month), txnApi.list(startDate, endDate)])
      .then(([repRes, txnRes]) => { setActualReport(repRes.data); setActualTxns(txnRes.data || []) })
      .catch(() => {})
      .finally(() => setLoadingActual(false))
  }, [month, isPastMonth])

  useEffect(() => {
    if (!month) return
    setRangeStart(month + '-01')
    setRangeEnd(format(endOfMonth(parseISO(month + '-01')), 'yyyy-MM-dd'))
  }, [month])

  useEffect(() => {
    if (viewMode !== 'range' || !isRangePast || !rangeStart || !rangeEnd) { setRangeActualTxns([]); return }
    txnApi.list(rangeStart, rangeEnd).then(r => setRangeActualTxns(r.data || [])).catch(() => {})
  }, [viewMode, isRangePast, rangeStart, rangeEnd])

  useEffect(() => {
    if (viewMode !== 'range' || !rangeStart || !rangeEnd) return
    clearTimeout(rangeTimer.current)
    rangeTimer.current = setTimeout(() => {
      setRangeLoading(true); setRangeData(null)
      reportApi.forecastRange(rangeStart, rangeEnd)
        .then(res => setRangeData(res.data))
        .catch(() => setRangeData(null))
        .finally(() => setRangeLoading(false))
    }, 400)
    return () => clearTimeout(rangeTimer.current)
  }, [viewMode, rangeStart, rangeEnd])

  // Multi-period forecast
  useEffect(() => {
    if (!month || isPastMonth || months.length === 0) { setMultiData(null); return }
    setMultiLoading(true); setMultiData(null)
    reportApi.forecastMulti(month, multiPeriods)
      .then(res => setMultiData(res.data))
      .catch(() => setMultiData(null))
      .finally(() => setMultiLoading(false))
  }, [month, multiPeriods, isPastMonth, months.length])

  // Budget suggestions
  useEffect(() => {
    if (!month || isPastMonth) { setBudgetSuggest(null); return }
    setBudgetLoading(true)
    reportApi.forecastBudgetSuggest(month)
      .then(res => setBudgetSuggest(res.data))
      .catch(() => setBudgetSuggest(null))
      .finally(() => setBudgetLoading(false))
  }, [month, isPastMonth])

  // Seasonality (only when ≥12 months available)
  useEffect(() => {
    if (months.length < 12) { setSeasonality(null); return }
    setSeasonalityLoading(true)
    reportApi.forecastSeasonality()
      .then(res => setSeasonality(res.data))
      .catch(() => setSeasonality(null))
      .finally(() => setSeasonalityLoading(false))
  }, [months.length])

  // Accuracy (load once per session when viewing past months)
  useEffect(() => {
    if (!isPastMonth) { setAccuracy(null); accuracyFetched.current = false; return }
    if (accuracyFetched.current) return
    accuracyFetched.current = true
    setAccuracyLoading(true)
    reportApi.forecastAccuracy()
      .then(res => setAccuracy(res.data))
      .catch(() => setAccuracy(null))
      .finally(() => setAccuracyLoading(false))
  }, [isPastMonth])

  // ── Derived values ──────────────────────────────────────────────────────────

  const forecasts  = forecast?.forecasts || {}
  const insights   = forecast?.insights  || null
  const totalData  = forecasts._total    || {}
  const getVal     = d => d.target_value ?? d.forecast?.[d.forecast.length - 1] ?? d.forecast?.[0]
  const total      = getVal(totalData)
  const confLow    = totalData.confidence_low
  const confHigh   = totalData.confidence_high
  const categories = Object.entries(forecasts)
    .filter(([k]) => k !== '_total')
    .sort((a, b) => (getVal(b[1]) || 0) - (getVal(a[1]) || 0))

  const actualTotal = actualReport?.total || 0
  const actualCats  = actualReport?.categories || {}

  const dailyFcTotal = dailyForecast?.forecast
    ? +dailyForecast.forecast.reduce((s, v) => s + v, 0).toFixed(2) : null
  const heroTotal    = isPastMonth ? (dailyFcTotal ?? total) : total
  const heroConfLow  = confLow
  const heroConfHigh = confHigh

  const forecastErr = heroTotal != null && actualTotal > 0
    ? ((actualTotal - heroTotal) / heroTotal * 100) : null
  const withinBand  = heroConfLow != null && heroConfHigh != null
    ? actualTotal >= heroConfLow && actualTotal <= heroConfHigh : null

  // Velocity / pace data (for past/current months)
  const velocityData = useMemo(() => {
    if (!isPastMonth || !dailyForecast?.forecast) return null
    const today       = new Date()
    const daysInMonth = getDaysInMonth(parseISO(month + '-01'))
    const daysElapsed = isCurrentMonth
      ? Math.min(today.getDate(), daysInMonth)
      : daysInMonth
    const fc          = dailyForecast.forecast
    const forecastedToDate = fc.slice(0, daysElapsed).reduce((s, v) => s + v, 0)
    const forecastTotal    = fc.reduce((s, v) => s + v, 0)
    const spentSoFar       = actualTotal
    const burnRate         = daysElapsed > 0 ? spentSoFar / daysElapsed : 0
    const forecastBurnRate = daysElapsed > 0 ? forecastedToDate / daysElapsed : 0
    const projectedTotal   = burnRate * daysInMonth
    return {
      daysElapsed, daysInMonth, spentSoFar, forecastedToDate, forecastTotal,
      burnRate, forecastBurnRate, projectedTotal,
      isOnPace: spentSoFar <= forecastedToDate * 1.1,
    }
  }, [isPastMonth, dailyForecast, actualTotal, month, isCurrentMonth])

  // Daily chart data
  const dailyFcData = useMemo(() => {
    if (!dailyForecast?.forecast) return []
    const fc         = dailyForecast.forecast
    const confLowArr = dailyForecast.confidence_low  || []
    const confHiArr  = dailyForecast.confidence_high || []
    const actualMap  = {}
    actualTxns.forEach(txn => {
      if (txn.transactionType === 'CREDIT') return
      const day = parseInt(txn.transactionDate.split('-')[2], 10)
      actualMap[day] = (actualMap[day] || 0) + parseFloat(txn.amount)
    })
    return fc.map((v, i) => {
      const lo = confLowArr[i] ?? Math.max(0, v - (dailyForecast.std || 0))
      const hi = confHiArr[i]  ?? (v + (dailyForecast.std || 0))
      return {
        day: i + 1,
        forecast:  +v.toFixed(2),
        bandLow:   +lo.toFixed(2),
        bandWidth: +(hi - lo).toFixed(2),
        actual:    isPastMonth ? +(actualMap[i + 1] || 0).toFixed(2) : undefined,
      }
    })
  }, [dailyForecast, isPastMonth, actualTxns])

  // Cumulative chart data (backtest)
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
      cumA  += byDay[day] || 0; cumF += fc[i] || 0
      cumLo += clo[i] || 0;     cumHi += chi[i] || 0
      return {
        day, actual: +(byDay[day] || 0).toFixed(2),
        cumActual: +cumA.toFixed(2), cumForecast: +cumF.toFixed(2),
        cumConfLow: +cumLo.toFixed(2), cumConfHigh: +cumHi.toFixed(2),
        dailyTarget: +(fc[i] || 0).toFixed(2),
      }
    })
  }, [isPastMonth, actualTxns, dailyForecast, month])

  // Line chart (history + forecast)
  const lineData = [...historyLine, { month, label: month.slice(5), total: Math.round(total || 0), isForecast: true }]

  // Bar chart data
  const barData = categories.slice(0, 8).map(([name, data]) => ({
    name: name.length > 13 ? name.slice(0, 13) + '…' : name, fullName: name,
    forecast: getVal(data) || 0, avg: data.historical_avg || 0, trend: data.trend,
  }))

  // Range chart data
  const rangeActualByDay = useMemo(() => {
    const map = {}
    rangeActualTxns.filter(t => t.transactionType !== 'CREDIT')
      .forEach(t => { map[t.transactionDate] = (map[t.transactionDate] || 0) + parseFloat(t.amount) })
    return map
  }, [rangeActualTxns])
  const rangeActualTotal = +Object.values(rangeActualByDay).reduce((s, v) => s + v, 0).toFixed(2)
  const rangeChartData = useMemo(() => {
    if (!rangeData?.days) return []
    return rangeData.days.map(d => ({
      date: d.date, label: format(parseISO(d.date), 'MMM d'),
      forecast: d.forecast, bandLow: d.confLow,
      bandWidth: +(d.confHigh - d.confLow).toFixed(2),
      actual: isRangePast ? +(rangeActualByDay[d.date] || 0).toFixed(2) : undefined,
    }))
  }, [rangeData, isRangePast, rangeActualByDay])

  const handleRefresh = async () => {
    if (!month || refreshing) return
    setRefreshing(true)
    try {
      const [fcRes, dailyRes] = await Promise.all([
        reportApi.forecastRefresh(month),
        reportApi.forecastDaily(month),
      ])
      setForecast(fcRes.data)
      setDailyForecast(dailyRes.data)
      // Clear cached data that depends on this month's forecast
      setMultiData(null); setBudgetSuggest(null)
      accuracyFetched.current = false; setAccuracy(null); setSeasonality(null)
      toast.success(`Forecast refreshed for ${month}`)
      // Reload accuracy + seasonality after cache eviction
      if (isPastMonth) {
        reportApi.forecastAccuracy()
          .then(r => { setAccuracy(r.data); accuracyFetched.current = true })
          .catch(() => {})
      }
      reportApi.forecastSeasonality().then(r => setSeasonality(r.data)).catch(() => {})
    } catch {
      toast.error('Refresh failed — is the ML service up?')
    } finally {
      setRefreshing(false)
    }
  }

  const handleApplyBudget = async () => {
    if (!budgetSuggest?.suggestions) return
    setBudgetApplying(true)
    try {
      await budgetApi.save({ month, budgets: budgetSuggest.suggestions })
      toast.success(`Budget applied for ${month}`)
      setBudgetConfirm(false)
    } catch {
      toast.error('Failed to apply budget')
    } finally {
      setBudgetApplying(false)
    }
  }

  // Animated hero number
  const displayTotal = useCountUp(heroTotal, 1300)
  const isLoadingAll = loading || (isPastMonth && loadingActual)

  const tierInfo = CONF_TIER[insights?.confidence_tier || 'low']

  // ── Chart shared legend ─────────────────────────────────────────────────────

  const ChartLegend = ({ items }) => (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
      {items.map(({ label, color, dashed, fill }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b729a' }}>
          {fill
            ? <span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, background: fill, border: `1px dashed ${color}` }} />
            : <span style={{ display: 'inline-block', width: 14, height: 2, background: color, borderRadius: 1, borderTop: dashed ? `2px dashed ${color}` : undefined, background: dashed ? 'transparent' : color }} />
          }
          {label}
        </span>
      ))}
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Header ── */}
      <ScrollFade delay={0}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 26, letterSpacing: '0.05em', color: 'var(--text)', lineHeight: 1,
              }}>Spending Forecast</h2>
              <InfoTooltip
                title="ML Forecast"
                content="Uses Holt-Winters exponential smoothing with seasonal decomposition. Model selection is automatic based on history depth: ≥24 months = full seasonal model, ≥4 months = damped trend, otherwise simple smoothing."
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Holt-Winters exponential smoothing · weekly &amp; monthly seasonality · auto model selection
            </p>
          </div>

          {/* View toggle + refresh */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {viewMode === 'month' && month && (
              <button onClick={handleRefresh} disabled={refreshing || !month || isLoadingAll}
                title={`Re-run ML forecast for ${month}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 13px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: 'var(--surface)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
                  opacity: (refreshing || isLoadingAll) ? 0.55 : 1,
                }}>
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Refreshing…' : `Rerun ${month}`}
              </button>
            )}
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {[['month', Calendar, 'Month'], ['range', CalendarRange, 'Range']].map(([mode, Icon, label]) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: viewMode === mode ? 'var(--brand)' : 'transparent',
                    color: viewMode === mode ? 'white' : 'var(--text-2)', cursor: 'pointer',
                    border: 'none', transition: 'all 0.15s',
                  }}>
                  <Icon size={11} />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollFade>

      {/* ── Month pickers ── */}
      {viewMode === 'month' && (pastOptions.length > 0 || futureOptions.length > 0) && (
        <ScrollFade delay={30}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
            {pastOptions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FlaskConical size={11} style={{ color: '#0EA5E9' }} />
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Backtest</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {pastOptions.map(m => (
                    <button key={m} onClick={() => setMonth(m)}
                      style={{
                        padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: month === m ? '#0EA5E9' : 'var(--surface)',
                        color: month === m ? 'white' : 'var(--text-2)',
                        border: `1px solid ${month === m ? '#0EA5E9' : 'var(--border)'}`,
                        transition: 'all 0.15s',
                      }}>{m}</button>
                  ))}
                </div>
              </div>
            )}
            {pastOptions.length > 0 && futureOptions.length > 0 && (
              <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            )}
            {futureOptions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={11} style={{ color: 'var(--brand)' }} />
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Forecast</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {futureOptions.map(m => (
                    <button key={m} onClick={() => setMonth(m)}
                      style={{
                        padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: month === m ? 'var(--brand)' : 'var(--surface)',
                        color: month === m ? 'white' : 'var(--text-2)',
                        border: `1px solid ${month === m ? 'var(--brand)' : 'var(--border)'}`,
                        transition: 'all 0.15s',
                      }}>{m}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollFade>
      )}

      {viewMode === 'month' && isLoadingAll && (
        <AiLoader type="forecast" title={isPastMonth ? 'Loading backtest…' : 'Computing forecast…'} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MONTH VIEW
      ══════════════════════════════════════════════════════════════════════ */}

      {viewMode === 'month' && !isLoadingAll && forecast && (
        <>
          {/* ── HERO card ── */}
          <ScrollFade delay={0}>
            <div style={{
              background: 'var(--surface)', borderRadius: 16, padding: '24px 28px',
              border: isPastMonth ? '1px solid rgba(14,165,233,0.2)' : '1px solid rgba(91,155,255,0.18)',
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 40px rgba(0,0,0,0.4)`,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Background glow */}
              <div style={{
                position: 'absolute', top: -60, right: -60, width: 200, height: 200,
                borderRadius: '50%',
                background: isPastMonth ? 'rgba(14,165,233,0.06)' : 'rgba(91,155,255,0.06)',
                filter: 'blur(40px)', pointerEvents: 'none',
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  {/* Label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {isPastMonth
                      ? <><FlaskConical size={12} style={{ color: '#0EA5E9' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#0EA5E9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Backtest · {month}
                          </span></>
                      : <><Sparkles size={12} style={{ color: 'var(--brand)' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Projected · {month}
                          </span></>
                    }
                  </div>

                  {/* Big number */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'JetBrains Mono', marginRight: 2 }}>$</span>
                    <span style={{
                      fontFamily: 'Bebas Neue, sans-serif',
                      fontSize: 58, letterSpacing: '-0.01em', color: 'var(--text)', lineHeight: 1,
                    }}>
                      {Number(displayTotal).toLocaleString()}
                    </span>
                  </div>

                  {/* Confidence band */}
                  {heroConfLow != null && heroConfHigh != null && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>
                      <span style={{ color: '#10B981' }}>{fmtD(heroConfLow)}</span>
                      <span style={{ color: 'var(--surface-3)', margin: '0 8px' }}>──────</span>
                      <span style={{ color: '#EF4444' }}>{fmtD(heroConfHigh)}</span>
                      <span style={{ color: 'var(--text-3)', fontSize: 10, marginLeft: 8 }}>confidence band</span>
                    </p>
                  )}

                  {/* Badges row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <TrendBadge trend={totalData.trend} />
                    {totalData.model_label && (
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono' }}>
                        {totalData.model_label}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {totalData.history_count || months.length}mo of data
                    </span>
                  </div>

                  {/* Backtest result */}
                  {isPastMonth && actualTotal > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Forecast</p>
                        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, color: '#F59E0B' }}>{fmtD(heroTotal)}</p>
                      </div>
                      <span style={{ color: 'var(--text-3)', fontSize: 16 }}>→</span>
                      <div>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Actual</p>
                        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, color: withinBand ? '#10B981' : '#EF4444' }}>{fmtD(actualTotal)}</p>
                      </div>
                      {forecastErr !== null && (
                        <div>
                          <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Error</p>
                          <p style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, color: Math.abs(forecastErr) > 10 ? '#EF4444' : '#10B981' }}>
                            {forecastErr > 0 ? '+' : ''}{forecastErr.toFixed(1)}%
                          </p>
                        </div>
                      )}
                      {withinBand && (
                        <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}>
                          ✓ Within band
                        </span>
                      )}
                    </div>
                  )}
                  {/* Accuracy score */}
                  {isPastMonth && (
                    <div style={{ marginTop: 12 }}>
                      <AccuracyCard
                        accuracy={accuracy} loading={accuracyLoading}
                        onRecalculate={() => {
                          accuracyFetched.current = false; setAccuracy(null); setAccuracyLoading(true)
                          reportApi.forecastAccuracy()
                            .then(r => { setAccuracy(r.data); accuracyFetched.current = true })
                            .catch(() => setAccuracy(null))
                            .finally(() => setAccuracyLoading(false))
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Confidence tier + model distribution */}
                {!isPastMonth && insights && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                    {/* Confidence tier */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px', borderRadius: 10,
                      background: `${tierInfo.glow}`,
                      border: `1px solid ${tierInfo.color}44`,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: tierInfo.color, boxShadow: `0 0 8px ${tierInfo.color}` }} />
                      <div>
                        <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1 }}>Signal Strength</p>
                        <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 16, color: tierInfo.color, letterSpacing: '0.06em', lineHeight: 1, marginTop: 2 }}>{tierInfo.label}</p>
                      </div>
                    </div>
                    {/* Model distribution */}
                    {insights.model_distribution && (
                      <div style={{ textAlign: 'right' }}>
                        {Object.entries(insights.model_distribution).map(([k, v]) => (
                          <p key={k} style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
                            <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{v}</span> cat{v !== 1 ? 's' : ''} ·{' '}
                            {k === 'holt_winters_seasonal' ? 'HW seasonal'
                              : k === 'holt_winters_trend' ? 'HW trend'
                              : k === 'simple_exp_smoothing' ? 'SES'
                              : 'mean'}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ScrollFade>

          {/* ── Spend velocity (past/current months) ── */}
          {isPastMonth && velocityData && (
            <ScrollFade delay={50}>
              <VelocityCard {...velocityData} isCurrentMonth={isCurrentMonth} />
            </ScrollFade>
          )}

          {/* ── Insights triptych (future months only) ── */}
          {!isPastMonth && insights && (
            <ScrollFade delay={60}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <InsightCard type="riser"  data={insights.top_risers?.[0]}       catColors={CAT_COLORS} />
                <InsightCard type="faller" data={insights.top_fallers?.[0]
                  ? { ...insights.top_fallers[0], savings_potential: insights.savings_potential }
                  : null} catColors={CAT_COLORS} />
                <InsightCard type="watch"  data={insights.watch_categories?.[0]} catColors={CAT_COLORS} />
              </div>
            </ScrollFade>
          )}

          {/* ── Category momentum strip (future months only) ── */}
          {!isPastMonth && categories.length > 0 && (
            <ScrollFade delay={80}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Zap size={12} style={{ color: 'var(--brand)' }} />
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                    Category Momentum
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>vs last month</span>
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                  {categories.map(([name, data]) => (
                    <MomentumChip key={name}
                      name={name} forecastVal={getVal(data) || 0}
                      lastMonth={data.last_month || 0}
                      color={CAT_COLORS[name] || '#6366F1'}
                    />
                  ))}
                </div>
              </div>
            </ScrollFade>
          )}

          {/* ── Multi-Period Forecast (future months only) ── */}
          {!isPastMonth && (
            <ScrollFade delay={90}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Layers size={12} style={{ color: 'var(--brand)' }} />
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                      Multi-Month Outlook
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>starting {month}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    {[3, 6, 12].map(n => (
                      <button key={n} onClick={() => setMultiPeriods(n)}
                        style={{
                          padding: '4px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                          background: multiPeriods === n ? 'var(--brand)' : 'transparent',
                          color: multiPeriods === n ? 'white' : 'var(--text-3)',
                          border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                        }}>{n}M</button>
                    ))}
                  </div>
                </div>
                {multiLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px 0' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Computing {multiPeriods}-month outlook…</span>
                  </div>
                )}
                {!multiLoading && multiData && !multiData.error && (
                  <MultiPeriodChart data={multiData} />
                )}
                {!multiLoading && multiData?.error && (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '16px 0' }}>{multiData.error}</p>
                )}
              </div>
            </ScrollFade>
          )}

          {/* ── Budget Intelligence (future months only) ── */}
          {!isPastMonth && (budgetSuggest?.reasoning && Object.keys(budgetSuggest.reasoning).length > 0) && (
            <ScrollFade delay={95}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(99,102,241,0.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Brain size={12} style={{ color: '#A78BFA' }} />
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                      Budget Intelligence
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>ML suggestions for {month}</span>
                  </div>
                  <button onClick={() => setBudgetConfirm(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                      borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: 'rgba(99,102,241,0.15)', color: '#A78BFA',
                      border: '1px solid rgba(99,102,241,0.35)', cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                    <Check size={11} /> Apply {Object.keys(budgetSuggest.reasoning).length} budgets
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {Object.entries(budgetSuggest.reasoning)
                    .sort((a, b) => b[1].forecast - a[1].forecast)
                    .map(([cat, r]) => {
                      const color  = CAT_COLORS[cat] || '#6366F1'
                      const tColor = r.trend === 'increasing' ? '#EF4444' : r.trend === 'decreasing' ? '#10B981' : '#F59E0B'
                      return (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 130, flexShrink: 0 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                          </div>
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text-3)', minWidth: 60, flexShrink: 0 }}>{fmtD(r.forecast)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>→</span>
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: 'var(--text)', minWidth: 65, flexShrink: 0 }}>{fmtD(r.suggested)}</span>
                          {r.buffer_pct > 0 && (
                            <span style={{ fontSize: 10, color: tColor, fontWeight: 600, flexShrink: 0 }}>+{r.buffer_pct}% buffer</span>
                          )}
                          <span style={{ fontSize: 10, color: tColor, fontWeight: 600, marginLeft: 'auto', textTransform: 'capitalize', flexShrink: 0 }}>{r.trend}</span>
                        </div>
                      )
                    })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Total suggested budget for {month}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmtD(budgetSuggest.total)}</span>
                </div>
              </div>
            </ScrollFade>
          )}

          {/* ── Daily forecast chart ── */}
          {dailyFcData.length > 0 && (
            <ScrollFade delay={100}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>
                      Daily forecast{isPastMonth ? ' vs actual' : ''}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {isPastMonth
                        ? 'Amber = model · Blue = actual · Band = confidence range'
                        : 'Day-by-day prediction · weekly pattern model · shaded = confidence'}
                    </p>
                  </div>
                  {dailyForecast?.model_label && (
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono' }}>
                      {dailyForecast.model_label}
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <ComposedChart data={dailyFcData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => v % 5 === 0 || v === 1 ? `${v}` : ''} />
                    <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={fmtK} width={42} />
                    <Tooltip content={<ChartTooltip labelPrefix="Day " />} />
                    <Area type="monotone" dataKey="bandLow" stackId="band" fill="transparent"
                      stroke="rgba(99,102,241,0.3)" strokeWidth={1} strokeDasharray="3 2"
                      dot={false} legendType="none" activeDot={false} />
                    <Area type="monotone" dataKey="bandWidth" stackId="band"
                      fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.3)"
                      strokeWidth={1} strokeDasharray="3 2" dot={false} legendType="none" activeDot={false} />
                    <Line type="monotone" dataKey="forecast" stroke="#F59E0B" strokeWidth={2}
                      dot={false} name="forecast" activeDot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }} />
                    {isPastMonth && (
                      <Line type="monotone" dataKey="actual" stroke="#0EA5E9" strokeWidth={2}
                        dot={false} name="actual" activeDot={{ r: 4, fill: '#0EA5E9', strokeWidth: 0 }} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
                <ChartLegend items={[
                  { label: 'Forecast', color: '#F59E0B' },
                  ...(isPastMonth ? [{ label: 'Actual', color: '#0EA5E9' }] : []),
                  { label: 'Confidence band', color: 'rgba(99,102,241,0.5)', fill: 'rgba(99,102,241,0.12)', dashed: true },
                ]} />
              </div>
            </ScrollFade>
          )}

          {/* ── BACKTEST-ONLY charts ── */}
          {isPastMonth && dailyData.length > 0 && (
            <>
              <ScrollFade delay={110}>
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>Cumulative spend vs forecast trajectory</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Solid blue = actual · Dashed amber = forecast pace · Band = confidence bounds</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => v % 5 === 0 || v === 1 ? `${v}` : ''} />
                      <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={fmtK} width={42} />
                      <Tooltip content={<ChartTooltip labelPrefix="Day " />} />
                      <Line type="monotone" dataKey="cumConfHigh" stroke="rgba(99,102,241,0.4)" strokeWidth={1}
                        strokeDasharray="4 3" dot={false} legendType="none" />
                      <Line type="monotone" dataKey="cumConfLow" stroke="rgba(99,102,241,0.4)" strokeWidth={1}
                        strokeDasharray="4 3" dot={false} legendType="none" />
                      <Line type="monotone" dataKey="cumForecast" stroke="#F59E0B" strokeWidth={1.5}
                        strokeDasharray="6 3" dot={false} name="cumForecast" />
                      <Line type="monotone" dataKey="cumActual" stroke="#0EA5E9" strokeWidth={2.5}
                        dot={false} name="cumActual" activeDot={{ r: 4, strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ScrollFade>

              <ScrollFade delay={120}>
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>Daily spending breakdown</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Bars = actual daily spend · Dashed = forecast target per day</p>
                  <ResponsiveContainer width="100%" height={170}>
                    <ComposedChart data={dailyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => v % 5 === 0 || v === 1 ? `${v}` : ''} />
                      <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={fmtK} width={42} />
                      <Tooltip content={<ChartTooltip labelPrefix="Day " />} />
                      <Bar dataKey="actual" fill="#0EA5E9" fillOpacity={0.7} radius={[2,2,0,0]} maxBarSize={18} name="actual" />
                      <Line type="monotone" dataKey="dailyTarget" stroke="#F59E0B" strokeWidth={1.5}
                        strokeDasharray="5 3" dot={false} legendType="none" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ScrollFade>
            </>
          )}

          {/* ── Historical line chart (future months) ── */}
          {!isPastMonth && historyLine.length >= 2 && total != null && (
            <ScrollFade delay={110}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>Historical spending + forecast</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Shaded band = confidence range for {month}</p>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={lineData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={fmtK} width={42} />
                    <Tooltip content={<ChartTooltip />} />
                    {confLow != null && (
                      <ReferenceArea x1={month.slice(5)} x2={month.slice(5)}
                        y1={confLow} y2={confHigh}
                        fill="#F59E0B" fillOpacity={0.12}
                        stroke="#F59E0B" strokeOpacity={0.25} />
                    )}
                    <ReferenceLine x={month.slice(5)} stroke="#F59E0B" strokeDasharray="4 3"
                      label={{ value: 'Forecast', fill: '#F59E0B', fontSize: 10, position: 'insideTopRight' }} />
                    <Line type="monotone" dataKey="total" stroke="var(--brand)" strokeWidth={2} name="total"
                      dot={p => p.payload.isForecast
                        ? <circle key={p.key} cx={p.cx} cy={p.cy} r={6} fill="#F59E0B" stroke="#0f1322" strokeWidth={2} />
                        : <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill="var(--brand)" />
                      } />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ScrollFade>
          )}

          {/* ── Category breakdown ── */}
          {categories.length > 0 && (
            <ScrollFade delay={130}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 14 }}>
                  {isPastMonth ? 'Category forecast vs actual' : 'Category breakdown'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: isPastMonth ? 14 : 10 }}>
                  {categories.map(([name, data], idx) => {
                    const fc      = getVal(data) || 0
                    const color   = CAT_COLORS[name] || '#6366F1'
                    const avg     = data.historical_avg || 0
                    const last    = data.last_month     || 0
                    const actual  = actualCats[name]    || 0
                    const maxVal  = isPastMonth
                      ? Math.max(fc, actual, 1)
                      : Math.max(fc, avg, 1)
                    const fcPct   = Math.min((fc / maxVal) * 100, 100)
                    const diff    = isPastMonth && fc > 0
                      ? ((actual - fc) / fc * 100) : null
                    const pctLast = !isPastMonth && last > 0
                      ? ((fc - last) / last * 100) : null

                    return (
                      <div key={name}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 140, flexShrink: 0 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isPastMonth ? (
                              <>
                                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--text-3)', minWidth: 58 }}>{fmtD(fc)}</span>
                                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>→</span>
                                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 58 }}>
                                  {actual > 0 ? fmtD(actual) : '—'}
                                </span>
                                {diff !== null && actual > 0 && (
                                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono', color: diff > 10 ? '#f87171' : diff < -10 ? '#34d399' : 'var(--text-3)' }}>
                                    {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                {last > 0 && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text-3)' }}>{fmtD(last)} →</span>}
                                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtD(fc)}</span>
                                {pctLast !== null && (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: pctLast > 3 ? '#f87171' : pctLast < -3 ? '#34d399' : 'var(--text-3)' }}>
                                    {pctLast > 0 ? '+' : ''}{pctLast.toFixed(0)}%
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <TrendBadge trend={data.trend} />
                          {!isPastMonth && data.confidence_low != null && (
                            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' }}>
                              {fmtD(data.confidence_low)}–{fmtD(data.confidence_high)}
                            </span>
                          )}
                        </div>

                        {/* Dual progress bars */}
                        <div style={{ marginLeft: 152, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <AnimBar pct={fcPct} color={color} delay={idx * 40} height={4} />
                          {isPastMonth && actual > 0 && (
                            <AnimBar
                              pct={Math.min((actual / maxVal) * 100, 100)}
                              color={diff > 10 ? '#EF4444' : diff < -10 ? '#10B981' : color}
                              delay={idx * 40 + 80} height={4}
                            />
                          )}
                          {!isPastMonth && avg > 0 && (
                            <AnimBar pct={Math.min((avg / maxVal) * 100, 100)} color="rgba(255,255,255,0.15)" delay={idx * 40 + 80} height={3} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  {isPastMonth ? (
                    <>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.2)' }} /> Forecast
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 4, borderRadius: 999, background: '#0EA5E9' }} /> Actual
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.2)' }} /> Forecast
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.15)' }} /> Historical avg
                      </span>
                    </>
                  )}
                </div>
              </div>
            </ScrollFade>
          )}
          {/* ── Seasonal Patterns ── */}
          {seasonality && !seasonality.error && Object.keys(seasonality.profiles || {}).length > 0 && (
            <ScrollFade delay={150}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                <button onClick={() => setShowSeasonality(v => !v)}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Sparkles size={12} style={{ color: '#F59E0B' }} />
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                      Seasonal Patterns
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>month-of-year spending index</span>
                  </div>
                  <ChevronDown size={14} style={{ color: 'var(--text-3)', transform: showSeasonality ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {showSeasonality && (
                  <div style={{ marginTop: 16 }}>
                    <SeasonalityHeatmap profiles={seasonality.profiles} catColors={CAT_COLORS} />
                  </div>
                )}
              </div>
            </ScrollFade>
          )}
        </>
      )}

      {/* ── Empty state ── */}
      {viewMode === 'month' && !isLoadingAll && !forecast && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '52px 24px', textAlign: 'center', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📈</p>
          <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Not enough data</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Upload at least 2 months of transactions to enable forecasting</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          RANGE VIEW
      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Budget confirm dialog ── */}
      {budgetConfirm && budgetSuggest && (
        <BudgetConfirmDialog
          month={month}
          count={Object.keys(budgetSuggest.suggestions || {}).length}
          total={fmtD(budgetSuggest.total || 0)}
          onConfirm={handleApplyBudget}
          onCancel={() => setBudgetConfirm(false)}
          applying={budgetApplying}
        />
      )}

      {viewMode === 'range' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Date pickers */}
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <CalendarRange size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              {[['From', rangeStart, setRangeStart], ['To', rangeEnd, setRangeEnd]].map(([label, val, set]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{label}</span>
                  <input type="date" value={val} onChange={e => set(e.target.value)}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', outline: 'none' }} />
                </div>
              ))}
            </div>
          </div>

          {rangeLoading && <AiLoader type="forecast" title="Computing range forecast…" />}

          {!rangeLoading && rangeData && !rangeData.error && (
            <>
              {/* Range hero */}
              <div style={{
                background: 'var(--surface)', borderRadius: 14, padding: '20px 24px', border: '1px solid var(--border)',
                borderColor: isRangePast && rangeActualTotal > 0
                  ? (rangeActualTotal > rangeData.totalForecast ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)')
                  : 'rgba(91,155,255,0.18)',
              }}>
                {isRangePast && rangeActualTotal > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#0EA5E9', fontWeight: 700, marginBottom: 4 }}>Backtest · {rangeData.startDate} → {rangeData.endDate}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Forecast</p>
                      <p style={{ fontFamily: 'JetBrains Mono', fontSize: 28, fontWeight: 800, color: '#F59E0B' }}>{fmtD(rangeData.totalForecast)}</p>
                    </div>
                    <span style={{ color: 'var(--text-3)', fontSize: 20 }}>→</span>
                    <div>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Actual</p>
                      <p style={{ fontFamily: 'JetBrains Mono', fontSize: 28, fontWeight: 800, color: rangeActualTotal > rangeData.totalForecast ? '#f87171' : '#34d399' }}>{fmtD(rangeActualTotal)}</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: rangeActualTotal > rangeData.totalForecast ? '#f87171' : '#34d399' }}>
                        {rangeActualTotal > rangeData.totalForecast ? '+' : ''}{(((rangeActualTotal - rangeData.totalForecast) / rangeData.totalForecast) * 100).toFixed(1)}% vs forecast
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, marginBottom: 4 }}>Forecast · {rangeData.startDate} → {rangeData.endDate} · {rangeData.totalDays}d</p>
                    <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 46, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1 }}>${Number(rangeData.totalForecast).toLocaleString()}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                      {fmtDc(rangeData.totalForecast / rangeData.totalDays)}/day avg · {fmtD(rangeData.totalConfLow || 0)} – {fmtD(rangeData.totalConfHigh || 0)} band
                    </p>
                  </>
                )}
              </div>

              {/* Range chart */}
              {rangeChartData.length > 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 14 }}>
                    {isRangePast && rangeActualTotal > 0 ? 'Forecast vs actual' : 'Day-by-day forecast'}
                  </p>
                  <ResponsiveContainer width="100%" height={210}>
                    <ComposedChart data={rangeChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                        interval={Math.max(0, Math.ceil(rangeChartData.length / 10) - 1)} />
                      <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={fmtK} width={42} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="bandLow" stackId="band" fill="transparent"
                        stroke="rgba(99,102,241,0.3)" strokeWidth={1} strokeDasharray="3 2"
                        dot={false} legendType="none" activeDot={false} />
                      <Area type="monotone" dataKey="bandWidth" stackId="band"
                        fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.3)"
                        strokeWidth={1} strokeDasharray="3 2" dot={false} legendType="none" activeDot={false} />
                      {isRangePast && rangeActualTotal > 0 && (
                        <Bar dataKey="actual" fill="#0EA5E9" fillOpacity={0.65} radius={[2,2,0,0]} maxBarSize={14} legendType="none" />
                      )}
                      <Line type="monotone" dataKey="forecast" stroke="#F59E0B" strokeWidth={2}
                        dot={false} activeDot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {!rangeLoading && rangeData?.error && (
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '40px 24px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <p style={{ color: 'var(--text)' }}>{rangeData.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
