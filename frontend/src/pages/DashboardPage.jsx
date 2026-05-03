import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { txnApi } from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  Upload, AlertTriangle, ArrowRight, ArrowDownRight, ArrowUpRight,
  Sparkles, Receipt, MessageCircle, Target, BookOpen,
  TrendingUp, Zap, CalendarDays,
} from 'lucide-react'
import { format, parseISO, differenceInCalendarDays, endOfMonth, startOfMonth } from 'date-fns'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts'
import RangeForecastCard from '../components/RangeForecastCard'

const CATEGORY_COLORS = {
  'Food & Drink':    '#6366F1',
  'Groceries':       '#8B5CF6',
  'Transport':       '#0EA5E9',
  'Shopping':        '#F59E0B',
  'Entertainment':   '#10B981',
  'Healthcare':      '#EF4444',
  'Utilities':       '#6366F1',
  'Rent & Housing':  '#84CC16',
  'Travel':          '#F97316',
  'Financial':       '#64748B',
  'Subscriptions':   '#A78BFA',
  'Personal Care':   '#EC4899',
}
const CAT_COLOR = cat => CATEGORY_COLORS[cat] || '#94A3B8'

function fmtMonth(m) {
  try { return format(parseISO(m + '-01'), 'MMMM yyyy') } catch { return m }
}
function fmtRange(s, e) {
  if (!s) return ''
  if (s === e) return fmtMonth(s)
  try {
    return `${format(parseISO(s + '-01'), 'MMM yyyy')} – ${format(parseISO(e + '-01'), 'MMM yyyy')}`
  } catch { return `${s} – ${e}` }
}
function fmt0(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
function fmt2(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function buildNarrative(summary, rangeLabel) {
  if (!summary || summary.total === 0) return null
  const cats = Object.entries(summary.categories || {}).sort((a, b) => b[1] - a[1])
  const topCat = cats[0]
  const catCount = cats.length
  const total = summary.total
  const pct = topCat ? Math.round((topCat[1] / total) * 100) : 0
  let s = `In ${rangeLabel}, your total spending was $${fmt0(total)}`
  s += catCount > 0 ? ` across ${catCount} categor${catCount === 1 ? 'y' : 'ies'}.` : '.'
  if (topCat) s += ` ${topCat[0]} led at ${pct}% ($${fmt0(topCat[1])}).`
  if ((summary.creditTotal || 0) > 0) s += ` You received $${fmt0(summary.creditTotal)} in credits.`
  return s
}

function StatCard({ icon: Icon, label, value, sub, to, color = 'var(--brand)' }) {
  const inner = (
    <div className="card h-full flex items-start gap-3 hover:shadow-md transition-shadow cursor-pointer">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{label}</p>
        <p className="font-bold mt-0.5 leading-tight break-all"
          style={{ color: 'var(--text)', fontSize: value && String(value).length > 9 ? '0.9rem' : '1.125rem' }}>
          {value}
        </p>
        {sub && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner
}


export default function DashboardPage() {
  const { user } = useAuth()
  const { months, startDate, endDate, startMonth, endMonth } = useTimeFilter()
  const [summary, setSummary]               = useState(null)
  const [recent, setRecent]                 = useState([])
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingRecent, setLoadingRecent]   = useState(false)
  useEffect(() => {
    if (!startMonth || !endMonth) return
    setLoadingSummary(true)
    setSummary(null)
    txnApi.summary(startMonth, endMonth)
      .then(r => setSummary(r.data))
      .catch(() => {})
      .finally(() => setLoadingSummary(false))

    setLoadingRecent(true)
    txnApi.list(startDate, endDate)
      .then(r => setRecent(r.data || []))
      .catch(() => {})
      .finally(() => setLoadingRecent(false))
  }, [startMonth, endMonth])

  const rangeLabel = fmtRange(startMonth, endMonth)
  const cats = summary?.categories ? Object.entries(summary.categories).sort((a, b) => b[1] - a[1]) : []
  const topCat = cats[0] || null
  const hasData = summary && summary.total > 0
  const narrative = hasData ? buildNarrative(summary, rangeLabel) : null

  const netFlow = hasData ? (summary.creditTotal || 0) - summary.total : 0

  const daysInRange = (() => {
    if (!startMonth || !endMonth) return 30
    try {
      const s = startOfMonth(parseISO(startMonth + '-01'))
      const e = endOfMonth(parseISO(endMonth + '-01'))
      return differenceInCalendarDays(e, s) + 1
    } catch { return 30 }
  })()
  const avgPerDay = hasData ? summary.total / daysInRange : 0

  const pieData = cats.slice(0, 6).map(([name, value]) => ({ name, value }))

  const actualByDay = {}
  recent.filter(t => t.transactionType !== 'CREDIT').forEach(t => {
    actualByDay[t.transactionDate] = (actualByDay[t.transactionDate] || 0) + parseFloat(t.amount)
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div>
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)', fontFamily: 'Manrope, DM Sans, sans-serif' }}>
          Good {greeting}, {user?.firstName}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
          {months.length > 0 && ` · ${months.length} month${months.length !== 1 ? 's' : ''} of data`}
        </p>
      </div>

      {/* ── 6 Stat Cards ── */}
      {months.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={ArrowDownRight} label="Money out"
            value={loadingSummary ? '…' : hasData ? `$${fmt0(summary.total)}` : '—'}
            sub={rangeLabel} to="/transactions" color="#EF4444" />
          <StatCard icon={ArrowUpRight} label="Money in"
            value={loadingSummary ? '…' : summary ? `$${fmt0(summary.creditTotal ?? 0)}` : '—'}
            sub={rangeLabel} to="/transactions" color="#10B981" />
          <StatCard icon={TrendingUp} label="Net flow"
            value={loadingSummary ? '…' : hasData ? `${netFlow >= 0 ? '+' : ''}$${fmt0(Math.abs(netFlow))}` : '—'}
            sub={netFlow >= 0 ? 'Positive' : 'Negative'} color={netFlow >= 0 ? '#10B981' : '#EF4444'} />
          <StatCard icon={Receipt} label="Transactions"
            value={loadingRecent ? '…' : recent.length > 0 ? `${recent.length}` : (summary ? '0' : '—')}
            sub={rangeLabel} to="/transactions" color="var(--brand)" />
          <StatCard icon={AlertTriangle} label="Anomalies"
            value={loadingSummary ? '…' : summary?.anomalyCount ?? '—'}
            sub={rangeLabel} to="/anomalies" color="#F59E0B" />
          <StatCard icon={CalendarDays} label="Avg / day"
            value={loadingSummary ? '…' : hasData ? `$${fmt0(avgPerDay)}` : '—'}
            sub={`Over ${daysInRange} days`} color="#8B5CF6" />
        </div>
      )}

      {/* ── Bento row: Narrative (left) + Donut chart (right) ── */}
      {hasData && !loadingSummary && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* AI Narrative card */}
          <div className="lg:col-span-7 card flex flex-col" style={{ borderLeft: '3px solid var(--brand)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={13} style={{ color: 'var(--brand)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand)' }}>
                Spending Snapshot
              </span>
            </div>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
              fontSize: '0.9375rem', lineHeight: 1.85, color: 'var(--text-2)', marginBottom: '1rem',
            }}>
              {narrative}
            </p>

            {(summary.anomalyCount || 0) > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl mb-4"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={14} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#FCD34D' }}>
                    {summary.anomalyCount} unusual transaction{summary.anomalyCount !== 1 ? 's' : ''} detected
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    Flagged as outside your normal spending patterns.
                  </p>
                </div>
                <Link to="/anomalies" className="flex-shrink-0 text-xs font-semibold" style={{ color: '#D97706' }}>
                  View →
                </Link>
              </div>
            )}

            {/* Net flow mini visual */}
            <div className="mt-auto pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between text-sm mb-2">
                <span style={{ color: 'var(--text-3)' }}>Cash flow</span>
                <span className="font-semibold font-mono text-xs"
                  style={{ color: netFlow >= 0 ? '#10B981' : '#EF4444' }}>
                  {netFlow >= 0 ? '+' : ''}{fmt2(netFlow)}
                </span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                {(summary.creditTotal || 0) > 0 && (
                  <div className="h-1.5 rounded-l-full transition-all"
                    style={{ width: `${Math.min(100, ((summary.creditTotal || 0) / (summary.total + (summary.creditTotal || 0))) * 100)}%`, background: '#10B981' }} />
                )}
                <div className="h-1.5 rounded-r-full flex-1" style={{ background: '#EF4444' }} />
              </div>
              <div className="flex justify-between mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                <span>In ${fmt0(summary.creditTotal || 0)}</span>
                <span>Out ${fmt0(summary.total)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Based on {rangeLabel}</p>
              <Link to="/story" className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--brand)' }}>
                Generate full story <ArrowRight size={11} />
              </Link>
            </div>
          </div>

          {/* Donut chart card */}
          <div className="lg:col-span-5 card flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>By category</h3>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                ${fmt0(summary.total)} total
              </span>
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={CAT_COLOR(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                    itemStyle={{ color: '#e1e2ec' }}
                    labelStyle={{ color: '#8c909f', marginBottom: 4 }}
                    formatter={(v, name) => [`$${fmt2(v)}`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-2 flex-1">
              {cats.slice(0, 4).map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CAT_COLOR(cat) }} />
                    <span className="truncate" style={{ color: 'var(--text-2)' }}>{cat}</span>
                  </div>
                  <span className="font-mono font-medium flex-shrink-0 ml-2" style={{ color: 'var(--text)' }}>
                    ${fmt0(amt)}
                  </span>
                </div>
              ))}
              {cats.length > 4 && (
                <p className="text-xs pt-1" style={{ color: 'var(--text-3)' }}>
                  +{cats.length - 4} more categories
                </p>
              )}
            </div>
          </div>
        </div>
      )}

       {/* ── Forecast vs actual spend ── */}
        {hasData && startDate && endDate && Object.keys(actualByDay).length > 0 && (
          <RangeForecastCard
            startDate={startDate}
            endDate={endDate}
            actualByDay={actualByDay}
            title="Forecast vs actual spend"
            compact
          />
        )}

      {/* ── Lower bento: Recent Transactions + Quick Actions ── */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Recent Transactions */}
          <div className="lg:col-span-7 card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Recent transactions</h3>
              <Link to="/transactions" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--brand)' }}>
                View all <ArrowRight size={13} />
              </Link>
            </div>
            {loadingRecent ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 rounded animate-pulse" style={{ background: 'var(--border)', width: '60%' }} />
                      <div className="h-2.5 rounded animate-pulse" style={{ background: 'var(--border)', width: '40%' }} />
                    </div>
                    <div className="h-3.5 w-16 rounded animate-pulse" style={{ background: 'var(--border)' }} />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>No transactions found</p>
            ) : (
              <div className="space-y-1">
                {recent.slice(0, 6).map((txn, i, arr) => {
                  const color = CAT_COLOR(txn.category)
                  return (
                    <div key={txn.id} className="flex items-center gap-3 py-2 rounded-xl px-2 -mx-2 transition-colors"
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                        style={{ background: `${color}18`, color }}>
                        {(txn.description || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                          {txn.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: `${color}15`, color, fontSize: '0.7rem' }}>
                            {txn.category || 'Uncategorized'}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                            {txn.transactionDate ? format(parseISO(txn.transactionDate), 'MMM d') : ''}
                          </span>
                          {txn.isAnomaly && (
                            <span className="text-xs" style={{ color: '#D97706' }}>⚠ Anomaly</span>
                          )}
                        </div>
                      </div>
                      <p className="font-semibold font-mono text-sm flex-shrink-0" style={{ color: 'var(--text)' }}>
                        ${fmt2(txn.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-5 card">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>Explore</h3>
            <div className="space-y-2.5">
              {[
                { to: '/story',      icon: BookOpen,    label: 'Monthly story',      sub: 'AI-generated narrative', color: 'var(--brand)' },
                { to: '/anomalies',  icon: AlertTriangle, label: 'Anomalies',        sub: `${summary?.anomalyCount ?? 0} flagged`, color: '#F59E0B' },
                { to: '/forecast',   icon: TrendingUp,  label: 'Spending forecast',  sub: 'ML-powered prediction', color: '#10B981' },
                { to: '/budget',     icon: Target,      label: 'Budget vs actual',   sub: 'Track your goals', color: '#8B5CF6' },
                { to: '/savings',    icon: Zap,         label: 'Savings planner',    sub: 'Reality check + plan', color: '#F97316' },
                { to: '/chat',       icon: MessageCircle, label: 'Ask Finara AI',    sub: 'Chat with your data', color: '#6366F1' },
              ].map(({ to, icon: Icon, label, sub, color }) => (
                <Link key={to} to={to}
                  className="flex items-center gap-3 p-2.5 rounded-xl transition-colors group"
                  style={{ border: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}18` }}>
                    <Icon size={15} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{sub}</p>
                  </div>
                  <ArrowRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }}
                    className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Category Breakdown bars ── */}
      {hasData && cats.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Spending breakdown</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{rangeLabel}</p>
            </div>
            <Link to="/transactions" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--brand)' }}>
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3">
            {cats.sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
              const pct = (amt / summary.total) * 100
              const color = CAT_COLOR(cat)
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span style={{ color: 'var(--text-2)' }}>{cat}</span>
                    </div>
                    <span className="font-medium font-mono" style={{ color: 'var(--text)' }}>
                      ${fmt0(amt)}
                      <span className="ml-2 font-normal text-xs" style={{ color: 'var(--text-3)' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                    <div className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 pt-4 flex justify-between text-sm" style={{ borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-3)' }}>Total spending</span>
            <span className="font-semibold font-mono" style={{ color: 'var(--text)' }}>
              ${fmt2(summary.total)}
            </span>
          </div>
        </div>
      )}

      {/* Empty states */}
      {months.length > 0 && !loadingSummary && !hasData && (
        <div className="card text-center py-12">
          <p className="text-3xl mb-3">📭</p>
          <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No transactions for {rangeLabel}</p>
          <p className="text-sm mb-5" style={{ color: 'var(--text-3)' }}>Try a different date range or upload more data.</p>
          <Link to="/upload" className="btn-primary gap-2"><Upload size={14} /> Upload data</Link>
        </div>
      )}
      {months.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">📂</p>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>No data yet</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-3)' }}>Upload a CSV or PDF bank statement to get started</p>
          <Link to="/upload" className="btn-primary gap-2"><Upload size={15} /> Upload transactions</Link>
        </div>
      )}
    </div>
  )
}
