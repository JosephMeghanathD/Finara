import { useState, useEffect, useMemo, useRef } from 'react'
import { reportApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, ReferenceLine, Cell,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Sparkles, ChevronDown } from 'lucide-react'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

// ── Color system — one accent per month ──────────────────────────────────────

const MONTH_COLORS  = ['#6366F1', '#F59E0B', '#10B981', '#F43F5E']
const MONTH_LABELS  = ['indigo', 'amber', 'emerald', 'rose']

const fmtD  = v => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtK  = v => `$${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : Number(v).toFixed(0)}`
const pctFmt = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

// ── Thinking indicator (same pattern as budget page) ─────────────────────────

function ThinkingIndicator() {
  const delays = [0, 0.13, 0.26, 0.39, 0.26, 0.13, 0]
  return (
    <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 26, flexShrink: 0 }}>
        {delays.map((delay, i) => (
          <div key={i} className="wave-bar" style={{
            width: 3, height: '100%', borderRadius: 999,
            background: 'linear-gradient(180deg, var(--brand), rgba(167,139,250,0.65))',
            animationDelay: `${delay}s`, transformOrigin: 'center',
          }} />
        ))}
      </div>
      <div style={{ flex: '0 0 auto' }}>
        <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: 'var(--brand)', marginBottom: 1 }}>
          Fiana is analyzing
        </p>
        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-3)' }}>
          Comparing spending patterns across months…
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton" style={{ height: 9, borderRadius: 5 }} />
        <div className="skeleton" style={{ height: 9, borderRadius: 5, width: '78%' }} />
        <div className="skeleton" style={{ height: 9, borderRadius: 5, width: '52%' }} />
      </div>
    </div>
  )
}

// ── Animated bar (category table) ─────────────────────────────────────────────

function AnimBar({ pct, color, delay = 0 }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setW(pct), delay)
    return () => clearTimeout(t)
  }, [pct, delay])
  return (
    <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', marginBottom: 4 }}>
      <div style={{
        height: '100%', borderRadius: 999, width: `${w}%`,
        background: `linear-gradient(90deg, ${color}55, ${color})`,
        transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: `0 0 4px ${color}44`,
      }} />
    </div>
  )
}

// ── Hero card per month ───────────────────────────────────────────────────────

function HeroCard({ report, prevReport, color, idx }) {
  const pct     = prevReport ? ((report.total - prevReport.total) / prevReport.total * 100) : null
  const isUp    = pct > 0
  const savings = report.income > 0 ? ((report.income - report.total) / report.income * 100) : null

  return (
    <div style={{
      flex: 1, minWidth: 140, padding: '16px 18px', borderRadius: 14,
      background: `${color}0C`, border: `1px solid ${color}28`,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.7 }} />

      <p style={{
        fontFamily: 'Bebas Neue, sans-serif', fontSize: 12, letterSpacing: '0.1em',
        color, marginBottom: 6, lineHeight: 1,
      }}>
        {report.month}
      </p>
      <p style={{
        fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 800,
        color: 'var(--text)', lineHeight: 1, marginBottom: 6,
      }}>
        {fmtD(report.total)}
      </p>
      {pct !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          {isUp
            ? <TrendingUp size={11} style={{ color: '#EF4444' }} />
            : <TrendingDown size={11} style={{ color: '#10B981' }} />}
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
            color: isUp ? '#EF4444' : '#10B981',
          }}>
            {pctFmt(pct)} vs prior
          </span>
        </div>
      )}
      {savings !== null && (
        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-3)' }}>
          {savings >= 0 ? '💾' : '⚠️'} {savings.toFixed(0)}% savings rate
        </p>
      )}
    </div>
  )
}

// ── Category heat table ───────────────────────────────────────────────────────

function CategoryTable({ reports, loading }) {
  const allCats = useMemo(() => {
    const set = new Set(reports.flatMap(r => Object.keys(r.categories || {})))
    const cats = [...set].filter(c => c !== 'Income' && c !== 'Transfer')
    return cats.sort((a, b) => {
      const aMax = Math.max(...reports.map(r => r.categories?.[a] || 0))
      const bMax = Math.max(...reports.map(r => r.categories?.[b] || 0))
      return bMax - aMax
    })
  }, [reports])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 0.9, 0.8, 0.7, 0.6].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6, width: `${w * 100}%` }} />
        ))}
      </div>
    )
  }

  if (allCats.length === 0) return null

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{
              textAlign: 'left', padding: '6px 12px 6px 0',
              fontFamily: 'Bebas Neue, sans-serif', fontSize: 10, letterSpacing: '0.12em',
              color: 'var(--text-3)', borderBottom: '1px solid var(--border)', fontWeight: 400,
            }}>
              Category
            </th>
            {reports.map((r, i) => (
              <th key={r.month} style={{
                textAlign: 'right', padding: '6px 10px',
                fontFamily: 'Bebas Neue, sans-serif', fontSize: 11, letterSpacing: '0.08em',
                color: MONTH_COLORS[i], borderBottom: '1px solid var(--border)', fontWeight: 400,
                minWidth: 100,
              }}>
                {r.month}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allCats.map((cat, rowIdx) => {
            const amounts = reports.map(r => r.categories?.[cat] || 0)
            const maxAmt  = Math.max(...amounts, 1)
            return (
              <tr key={cat}>
                <td style={{
                  padding: '9px 12px 9px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                }}>
                  <span style={{
                    fontSize: 12, color: 'var(--text-2)', fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}>
                    {cat}
                  </span>
                </td>
                {amounts.map((amt, colIdx) => {
                  const pct       = amt > 0 ? (amt / maxAmt) * 100 : 0
                  const isHighest = amt === maxAmt && amt > 0
                  const color     = MONTH_COLORS[colIdx]
                  return (
                    <td key={colIdx} style={{
                      padding: '9px 10px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: amt > 0 ? `${color}${Math.round(pct * 0.12).toString(16).padStart(2, '0')}` : 'transparent',
                      transition: 'background 0.3s',
                    }}>
                      <AnimBar pct={pct} color={color} delay={60 + rowIdx * 20 + colIdx * 10} />
                      <span style={{
                        fontFamily: 'JetBrains Mono', fontSize: 12,
                        color: isHighest ? color : amt > 0 ? 'var(--text-2)' : 'var(--text-3)',
                        fontWeight: isHighest ? 700 : 500,
                        display: 'block', textAlign: 'right',
                      }}>
                        {amt > 0 ? fmtD(amt) : '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {/* Total row */}
          <tr>
            <td style={{ padding: '10px 12px 4px 0' }}>
              <span style={{
                fontFamily: 'Bebas Neue, sans-serif', fontSize: 12,
                letterSpacing: '0.08em', color: 'var(--text-3)',
              }}>
                TOTAL
              </span>
            </td>
            {reports.map((r, i) => (
              <td key={i} style={{ padding: '10px 10px 4px', textAlign: 'right' }}>
                <span style={{
                  fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 800,
                  color: MONTH_COLORS[i],
                }}>
                  {fmtD(r.total)}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, labelPrefix = '', labelSuffix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0c1020', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, minWidth: 140,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#6b729a', marginBottom: 6, fontWeight: 600 }}>
        {labelPrefix}{label}{labelSuffix}
      </p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.stroke || p.color || 'var(--text)', margin: '3px 0', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
          <span style={{ fontWeight: 700 }}>{fmtD(p.value)}</span>
          <span style={{ fontSize: 10, color: '#6b729a', marginLeft: 6 }}>{p.name}</span>
        </p>
      ))}
    </div>
  )
}

// ── AI Insights panel ─────────────────────────────────────────────────────────

function InsightsPanel({ insights, loading, showPanel }) {
  const [open, setOpen] = useState(true)
  if (!showPanel) return null

  const trendColor  = insights?.overall_trend === 'improving' ? '#10B981'
                    : insights?.overall_trend === 'worsening' ? '#EF4444' : '#F59E0B'
  const TrendIcon   = insights?.overall_trend === 'improving' ? TrendingDown
                    : insights?.overall_trend === 'worsening' ? TrendingUp : Minus

  return (
    <ScrollFade delay={120}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14,
        border: `1px solid ${loading ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.22)'}`,
        overflow: 'hidden', transition: 'border-color 0.4s ease',
      }}>
        <button onClick={() => setOpen(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={12} style={{ color: loading ? 'var(--text-3)' : 'var(--brand)', transition: 'color 0.3s' }} />
            <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: loading ? 'var(--text-3)' : 'var(--brand)', transition: 'color 0.3s' }}>
              Fiana AI Compare Insights
            </span>
            {loading && (
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--text-3)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                thinking…
              </span>
            )}
            {!loading && insights?.overall_trend && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: `${trendColor}15`, border: `1px solid ${trendColor}30` }}>
                <TrendIcon size={9} style={{ color: trendColor }} />
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: trendColor, fontWeight: 700 }}>
                  {insights.overall_trend}
                </span>
              </div>
            )}
          </div>
          <ChevronDown size={14} style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {open && (
          <div style={{ borderTop: '1px solid rgba(99,102,241,0.10)' }}>
            {loading ? (
              <ThinkingIndicator />
            ) : insights?.insights ? (
              <div className="analysis-fade-in" style={{ padding: '16px 20px' }}>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)', marginBottom: insights.biggest_increase || insights.biggest_decrease ? 14 : 0 }}>
                  {insights.insights}
                </p>
                {(insights.biggest_increase?.category || insights.biggest_decrease?.category) && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {insights.biggest_increase?.category && (
                      <div style={{ flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
                        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#EF4444', marginBottom: 3 }}>Biggest increase</p>
                        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#EF4444' }}>
                          {insights.biggest_increase.category}
                        </p>
                        {insights.biggest_increase.change_pct != null && (
                          <p style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(239,68,68,0.7)', marginTop: 2 }}>
                            +{insights.biggest_increase.change_pct}%
                          </p>
                        )}
                      </div>
                    )}
                    {insights.biggest_decrease?.category && (
                      <div style={{ flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
                        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#10B981', marginBottom: 3 }}>Biggest decrease</p>
                        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#10B981' }}>
                          {insights.biggest_decrease.category}
                        </p>
                        {insights.biggest_decrease.change_pct != null && (
                          <p style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(16,185,129,0.7)', marginTop: 2 }}>
                            {insights.biggest_decrease.change_pct}%
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </ScrollFade>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const { months }          = useTimeFilter()
  const [selected, setSelected]         = useState([])
  const [reports, setReports]           = useState([])
  const [dailyByMonth, setDailyByMonth] = useState({})
  const [loading, setLoading]           = useState(false)
  const [insights, setInsights]         = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const activeSelRef = useRef('')  // stale-response guard

  // Default: last 3 months
  useEffect(() => {
    if (months.length > 0 && selected.length === 0)
      setSelected(months.slice(0, 3))
  }, [months])

  // ── Load fast data + fire AI insights in parallel ─────────────────────────

  useEffect(() => {
    if (selected.length < 2) { setReports([]); setDailyByMonth({}); return }

    const key = [...selected].sort().join(',')
    activeSelRef.current = key

    setLoading(true)
    setInsights(null)
    setInsightsLoading(true)

    // ① Fast: reports + daily (both cached, ~300ms total)
    Promise.all([
      reportApi.list(selected.join(',')),
      reportApi.compareDaily(selected.join(',')),
    ]).then(([repRes, dailyRes]) => {
      setReports(repRes.data || [])
      setDailyByMonth(dailyRes.data || {})
    }).finally(() => setLoading(false))

    // ② Slow: Gemma AI compare insights (~10s)
    reportApi.compareInsights(key)
      .then(r => {
        if (activeSelRef.current === key) setInsights(r.data)
      })
      .catch(() => {
        if (activeSelRef.current === key) setInsights(null)
      })
      .finally(() => {
        if (activeSelRef.current === key) setInsightsLoading(false)
      })
  }, [selected])

  const toggle = m =>
    setSelected(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].slice(-4)
    )

  // ── Derived data ──────────────────────────────────────────────────────────

  // Category movers: first → last selected month
  const moversData = useMemo(() => {
    if (reports.length < 2) return []
    const first = reports[0]
    const last  = reports[reports.length - 1]
    const allCats = [...new Set([
      ...Object.keys(first.categories || {}),
      ...Object.keys(last.categories  || {}),
    ])].filter(c => c !== 'Income' && c !== 'Transfer')

    return allCats.map(cat => {
      const before = first.categories?.[cat] || 0
      const after  = last.categories?.[cat]  || 0
      const delta  = parseFloat((after - before).toFixed(2))
      return { category: cat.length > 16 ? cat.slice(0, 16) + '…' : cat, delta, before, after }
    })
      .filter(d => d.before > 0 || d.after > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8)
  }, [reports])

  // Cumulative daily spend per month
  const cumData = useMemo(() => {
    if (!dailyByMonth || Object.keys(dailyByMonth).length === 0) return []
    const maxDay = Math.max(
      ...selected.map(m => Math.max(...Object.keys(dailyByMonth[m] || {}).map(Number), 0)),
      1
    )
    const running = {}
    selected.forEach(m => { running[m] = 0 })
    return Array.from({ length: maxDay }, (_, i) => {
      const day   = i + 1
      const entry = { day }
      selected.forEach(m => {
        const amt = dailyByMonth[m]?.[day] || 0
        running[m] = parseFloat((running[m] + amt).toFixed(2))
        entry[m]   = running[m]
      })
      return entry
    })
  }, [dailyByMonth, selected])

  const hasData    = !loading && reports.length >= 2
  const showPanel  = selected.length >= 2 && (insightsLoading || !!insights)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Header ── */}
      <ScrollFade delay={0}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.05em', color: 'var(--text)', lineHeight: 1 }}>
                Compare Months
              </h2>
              <InfoTooltip
                title="Compare Months"
                content="Select up to 4 months to compare side-by-side. Reports load instantly from cache. AI insights run in the background. Daily data uses a single optimized DB query."
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Up to 4 months · instant reports · AI insights in background
            </p>
          </div>
          {selected.length >= 2 && reports.length >= 2 && (
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-3)', paddingTop: 6 }}>
              {selected.length} months selected
            </div>
          )}
        </div>
      </ScrollFade>

      {/* ── Month selector ── */}
      <ScrollFade delay={20}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {months.map((m, idx) => {
            const selIdx = selected.indexOf(m)
            const color  = selIdx >= 0 ? MONTH_COLORS[selIdx] : undefined
            const isSel  = selIdx >= 0
            return (
              <button key={m} onClick={() => toggle(m)}
                style={{
                  padding: '6px 14px', borderRadius: 9, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: isSel ? `${color}18` : 'var(--surface)',
                  color: isSel ? color : 'var(--text-3)',
                  border: isSel ? `1px solid ${color}45` : '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                {isSel && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                )}
                {m}
              </button>
            )
          })}
          {months.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Upload transactions to compare months</p>
          )}
        </div>
      </ScrollFade>

      {/* ── Select prompt ── */}
      {!loading && selected.length < 2 && months.length > 0 && (
        <ScrollFade delay={30}>
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: '40px 24px',
            border: '1px solid var(--border)', textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.05em', color: 'var(--text-2)', marginBottom: 6 }}>
              Select 2+ months above to compare
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Pick any combination — up to 4 months at once
            </p>
          </div>
        </ScrollFade>
      )}

      {/* ── Hero strip: one card per month ── */}
      {(hasData || loading) && selected.length >= 2 && (
        <ScrollFade delay={40}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {loading
              ? selected.map((_, i) => (
                  <div key={i} className="skeleton" style={{ flex: 1, minWidth: 140, height: 100, borderRadius: 14 }} />
                ))
              : reports.map((r, i) => (
                  <HeroCard key={r.month} report={r} prevReport={reports[i - 1]} color={MONTH_COLORS[i]} idx={i} />
                ))
            }
          </div>
        </ScrollFade>
      )}

      {/* ── Category heat table ── */}
      {(hasData || loading) && selected.length >= 2 && (
        <ScrollFade delay={55}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                Spending by Category
              </p>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>highest cell is highlighted</span>
            </div>
            <CategoryTable reports={reports} loading={loading} />
          </div>
        </ScrollFade>
      )}

      {/* ── Cumulative trajectory area chart ── */}
      {hasData && cumData.length > 0 && (
        <ScrollFade delay={70}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)', marginBottom: 3 }}>
              Cumulative Spending Trajectory
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
              Running total by day — steeper = faster spending pace
            </p>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={cumData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  {selected.map((m, i) => (
                    <linearGradient key={m} id={`areaGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="15%"  stopColor={MONTH_COLORS[i]} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={MONTH_COLORS[i]} stopOpacity={0.01} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} interval={4}
                  label={{ value: 'Day of month', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#4a5070' }} />
                <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={48} />
                <Tooltip content={<ChartTooltip labelPrefix="Day " />} />
                {selected.map((m, i) => (
                  <Area key={m} type="monotone" dataKey={m} name={m}
                    stroke={MONTH_COLORS[i]} strokeWidth={2}
                    fill={`url(#areaGrad${i})`}
                    dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: MONTH_COLORS[i] }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ScrollFade>
      )}

      {/* ── Category movers: delta from first → last ── */}
      {hasData && moversData.length > 0 && (
        <ScrollFade delay={85}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)', marginBottom: 3 }}>
              Category Movers
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
              $ change from <span style={{ color: MONTH_COLORS[0] }}>{reports[0]?.month}</span> → <span style={{ color: MONTH_COLORS[reports.length - 1] }}>{reports[reports.length - 1]?.month}</span>
            </p>
            <ResponsiveContainer width="100%" height={Math.max(180, moversData.length * 38 + 40)}>
              <BarChart data={moversData} layout="vertical" margin={{ left: 4, right: 48, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${fmtK(v)}`} />
                <YAxis type="category" dataKey="category" tick={{ fill: '#b4bad6', fontSize: 11 }}
                  width={118} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={{ background: '#0c1020', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
                        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#6b729a', marginBottom: 5 }}>{d.category}</p>
                        <p style={{ fontFamily: 'JetBrains Mono', color: MONTH_COLORS[0], fontSize: 12 }}>
                          {reports[0]?.month}: <strong>{fmtD(d.before)}</strong>
                        </p>
                        <p style={{ fontFamily: 'JetBrains Mono', color: MONTH_COLORS[reports.length - 1], fontSize: 12 }}>
                          {reports[reports.length - 1]?.month}: <strong>{fmtD(d.after)}</strong>
                        </p>
                        <p style={{ fontFamily: 'JetBrains Mono', color: d.delta > 0 ? '#EF4444' : '#10B981', fontSize: 12, marginTop: 4, fontWeight: 700 }}>
                          {d.delta > 0 ? '▲' : '▼'} {fmtD(Math.abs(d.delta))}
                        </p>
                      </div>
                    )
                  }}
                />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />
                <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {moversData.map((entry, i) => (
                    <Cell key={i} fill={entry.delta > 0 ? '#EF4444' : '#10B981'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ScrollFade>
      )}

      {/* ── AI Insights (async, ThinkingIndicator until ready) ── */}
      <InsightsPanel insights={insights} loading={insightsLoading} showPanel={showPanel} />

    </div>
  )
}
