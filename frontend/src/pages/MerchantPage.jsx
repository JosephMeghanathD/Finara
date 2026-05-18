import { useState, useEffect } from 'react'
import { insightsApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  Trophy, TrendingUp, TrendingDown, Minus, AlertCircle,
  ShoppingBag, Store, Sparkles, BarChart2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'
import toast from 'react-hot-toast'

// ── Category colour map ─────────────────────────────────────────────────────────
const CAT_COLORS = {
  'Food & Drink':     '#f97316',
  'Entertainment':    '#8b5cf6',
  'Shopping':         '#ec4899',
  'Transportation':   '#06b6d4',
  'Health':           '#10b981',
  'Groceries':        '#84cc16',
  'Utilities':        '#f59e0b',
  'Housing':          '#3b82f6',
  'Travel':           '#a78bfa',
  'Education':        '#34d399',
  'Personal Care':    '#fb7185',
  'Subscriptions':    '#5b9bff',
  'Insurance':        '#64748b',
  'Investments':      '#22d3ee',
  'Other':            '#6b7194',
  'Uncategorized':    '#6b7194',
}
function catColor(c) { return CAT_COLORS[c] || '#6b7194' }

function fmtAmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtMonthRange(start, end) {
  if (!start || !end) return ''
  try {
    const s = format(parseISO(start + '-01'), 'MMM yyyy')
    const e = format(parseISO(end   + '-01'), 'MMM yyyy')
    return s === e ? s : `${s} – ${e}`
  } catch { return `${start} – ${end}` }
}

// ── Skeleton loader ─────────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-shimmer 1.4s infinite',
    }} />
  )
}

function SkeletonRow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 18px',
      borderBottom: '1px solid var(--border)',
    }}>
      <Skeleton w={28} h={28} r={8} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Skeleton w="40%" h={13} />
        <Skeleton w="22%" h={10} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
        <Skeleton w={72} h={13} />
        <Skeleton w={44} h={10} />
      </div>
      <Skeleton w={90} h={6} r={3} />
      <Skeleton w={36} h={20} r={6} />
    </div>
  )
}

// ── Trend indicator ─────────────────────────────────────────────────────────────
function Trend({ trend, trendPct }) {
  if (trend === 'new') return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      background: 'rgba(91,155,255,0.12)', color: 'var(--brand)',
      border: '1px solid rgba(91,155,255,0.25)',
      borderRadius: 6, padding: '3px 8px',
    }}>NEW</span>
  )
  if (trend === 'flat') return (
    <span style={{
      fontSize: 11, color: 'var(--text-3)',
      display: 'flex', alignItems: 'center', gap: 3,
    }}>
      <Minus size={12} /> flat
    </span>
  )
  const up    = trend === 'up'
  const color = up ? '#ef4444' : '#10b981'
  const Icon  = up ? TrendingUp : TrendingDown
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color,
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      <Icon size={13} />
      {up ? '+' : ''}{trendPct.toFixed(1)}%
    </span>
  )
}

// ── Spend bar ────────────────────────────────────────────────────────────────────
function SpendBar({ pct, color }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(pct), 120); return () => clearTimeout(t) }, [pct])
  return (
    <div style={{ width: 90, flexShrink: 0 }}>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          width: `${w}%`,
          transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: `0 0 6px ${color}55`,
        }} />
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'right', marginTop: 2 }}>
        {pct.toFixed(1)}%
      </div>
    </div>
  )
}

// ── Medal badge (top 3) ──────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉']

function RankBadge({ rank }) {
  if (rank <= 3) {
    return (
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, width: 28, textAlign: 'center' }}>
        {MEDALS[rank - 1]}
      </span>
    )
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace',
      width: 28, textAlign: 'center', flexShrink: 0,
    }}>
      #{rank}
    </span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, color, label, value, tip, loading }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 180 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </span>
          <InfoTooltip title={label} content={tip} side="top" />
        </div>
        {loading
          ? <Skeleton w="60%" h={22} />
          : <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>
              {value}
            </span>
        }
      </div>
    </div>
  )
}

// ── Leaderboard row ──────────────────────────────────────────────────────────────
function MerchantRow({ m, maxSpend, idx }) {
  const color  = catColor(m.category)
  const barPct = maxSpend > 0 ? (m.totalSpend / maxSpend) * 100 : 0

  return (
    <ScrollFade delay={idx * 25}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 18px',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Rank */}
        <RankBadge rank={m.rank} />

        {/* Merchant info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 4,
          }}>
            {m.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              background: `${color}15`, color,
              border: `1px solid ${color}28`,
              borderRadius: 5, padding: '1px 7px',
            }}>
              {m.category}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {m.visitCount} {m.visitCount === 1 ? 'visit' : 'visits'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              avg ${fmtAmt(m.avgPerVisit)}
            </span>
          </div>
        </div>

        {/* Spend bar */}
        <SpendBar pct={barPct} color={color} />

        {/* Total + % */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope, sans-serif' }}>
            ${fmtAmt(m.totalSpend)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {m.pctOfTotal}% of total
          </div>
        </div>

        {/* Trend */}
        <div style={{ flexShrink: 0, width: 72, textAlign: 'right' }}>
          <Trend trend={m.trend} trendPct={m.trendPct} />
          {m.priorSpend > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              prev ${fmtAmt(m.priorSpend)}
            </div>
          )}
        </div>
      </div>
    </ScrollFade>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────────
export default function MerchantPage() {
  const { startMonth, endMonth } = useTimeFilter()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!startMonth || !endMonth) return
    setLoading(true)
    setData(null)
    insightsApi.merchantLeaderboard(startMonth, endMonth)
      .then(r => { setData(r.data); setError(null) })
      .catch(e => {
        setError(e.response?.data?.message || 'Failed to load leaderboard')
        toast.error('Could not load merchant leaderboard')
      })
      .finally(() => setLoading(false))
  }, [startMonth, endMonth])

  const merchants      = data?.merchants      ?? []
  const totalSpend     = data?.totalSpend     ?? 0
  const merchantCount  = data?.merchantCount  ?? 0
  const priorPeriod    = data?.priorPeriod
  const maxSpend       = merchants[0]?.totalSpend ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Page header ── */}
      <ScrollFade>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(251,191,36,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Trophy size={16} style={{ color: '#fbbf24' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Where Your Money Actually Goes
            </h1>
            <InfoTooltip
              title="Merchant leaderboard"
              content="Top 20 merchants ranked by total spend in the selected period. Trend arrows compare to the equivalent prior period. Category tags come from Fiana's ML classifier."
              side="right"
            />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 44 }}>
            {startMonth && endMonth
              ? `Showing ${fmtMonthRange(startMonth, endMonth)} · use the date picker above to change the period`
              : 'Select a period to view your top merchants'
            }
          </p>
        </div>
      </ScrollFade>

      {/* ── Summary stats ── */}
      <ScrollFade delay={60}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <StatCard
            icon={BarChart2}
            color="#5b9bff"
            label="Total Spend"
            value={loading ? '' : `$${fmtAmt(totalSpend)}`}
            tip="Sum of all debit transactions in the selected period, excluding income and transfers."
            loading={loading}
          />
          <StatCard
            icon={Store}
            color="#a78bfa"
            label="Merchants"
            value={loading ? '' : merchantCount}
            tip="Number of unique merchants in top 20 results for this period."
            loading={loading}
          />
          {priorPeriod && !loading && (
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 180 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, background: 'rgba(107,113,148,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Sparkles size={16} style={{ color: 'var(--text-3)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Compared to
                  </span>
                  <InfoTooltip
                    title="Prior period"
                    content="Trend arrows compare each merchant's spend in the current period vs the equivalent prior period of the same length."
                    side="top"
                  />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>
                  {fmtMonthRange(priorPeriod.start, priorPeriod.end)}
                </span>
              </div>
            </div>
          )}
        </div>
      </ScrollFade>

      {/* ── Error ── */}
      {error && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {/* ── Leaderboard table ── */}
      <ScrollFade delay={90}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '11px 18px',
            borderBottom: '1px solid var(--border-2)',
            background: 'var(--surface-2)',
          }}>
            <span style={{ width: 28, fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              #
            </span>
            <span style={{ flex: 1, fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Merchant
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 90, fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
                Share
              </span>
              <InfoTooltip
                title="Share of total spend"
                content="This merchant's spend as a percentage of total spend across all transactions in the period."
                side="top"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 80, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Amount
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 72, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Trend
              </span>
              <InfoTooltip
                title="Trend vs prior period"
                content="↑ red = spending more than the previous period. ↓ green = spending less. NEW = merchant not seen in prior period."
                side="left"
              />
            </div>
          </div>

          {/* Rows */}
          {loading ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : merchants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: 'rgba(251,191,36,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <ShoppingBag size={22} style={{ color: 'var(--text-3)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                No transactions found
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 360, margin: '0 auto' }}>
                {startMonth
                  ? 'No debit transactions found for this period. Try a different date range.'
                  : 'Select a date range to see your top merchants.'
                }
              </p>
            </div>
          ) : (
            merchants.map((m, i) => (
              <MerchantRow key={`${m.name}-${i}`} m={m} maxSpend={maxSpend} idx={i} />
            ))
          )}
        </div>
      </ScrollFade>

      {/* ── Legend ── */}
      {!loading && merchants.length > 0 && (
        <ScrollFade>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { color: '#ef4444', icon: <TrendingUp size={11} />, label: 'Spending more than prior period' },
              { color: '#10b981', icon: <TrendingDown size={11} />, label: 'Spending less than prior period' },
              { color: 'var(--text-3)', icon: <Minus size={11} />, label: 'Flat (within ±5%)' },
              { color: 'var(--brand)', label: 'NEW — not in prior period' },
            ].map(({ color, icon, label }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-3)' }}>
                {icon && <span style={{ color }}>{icon}</span>}
                <span style={{ color }}>{label.split('—')[0]}</span>
                {label.includes('—') && <span>— {label.split('—')[1]}</span>}
              </span>
            ))}
          </div>
        </ScrollFade>
      )}

      <style>{`
        @keyframes skeleton-shimmer {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>
    </div>
  )
}
