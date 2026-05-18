import { useState, useEffect, useRef, useCallback } from 'react'
import { insightsApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  Repeat2, Trophy, DollarSign, Sparkles, Calendar, Clock,
  RefreshCw, ChevronDown, Loader2, AlertCircle, TrendingUp,
  TrendingDown, Minus, ShoppingBag, Store, BarChart2, PieChart,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'
import toast from 'react-hot-toast'

// ── Shared constants ────────────────────────────────────────────────────────────
const CAT_COLORS = {
  'Food & Drink': '#f97316', 'Entertainment': '#8b5cf6', 'Shopping':     '#ec4899',
  'Transportation':'#06b6d4','Health':        '#10b981', 'Groceries':    '#84cc16',
  'Utilities':    '#f59e0b', 'Housing':       '#3b82f6', 'Travel':       '#a78bfa',
  'Education':    '#34d399', 'Personal Care': '#fb7185', 'Subscriptions':'#5b9bff',
  'Insurance':    '#64748b', 'Investments':   '#22d3ee', 'Other':        '#6b7194',
  'Uncategorized':'#6b7194',
}
const catColor  = c => CAT_COLORS[c] || '#6b7194'
const fmtAmt    = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate   = s => { try { return format(parseISO(s), 'MMM d, yyyy') }  catch { return s ?? '—' } }
const fmtShort  = s => { try { return format(parseISO(s), 'MMM d, yy') }   catch { return s ?? '—' } }
const fmtRange  = (s, e) => {
  if (!s || !e) return ''
  try {
    const a = format(parseISO(s + '-01'), 'MMM yyyy')
    const b = format(parseISO(e + '-01'), 'MMM yyyy')
    return a === b ? a : `${a} – ${b}`
  } catch { return `${s} – ${e}` }
}

// ── Count-up animation hook ──────────────────────────────────────────────────────
function useCountUp(target, duration = 750) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target) { setVal(0); return }
    const start = performance.now()
    let raf
    const tick = now => {
      const p = Math.min((now - start) / duration, 1)
      setVal(target * (1 - Math.pow(1 - p, 3)))   // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick)
      else       setVal(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// ── Skeleton shimmer ─────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = 14, r = 6 }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3) 50%,var(--surface-2) 75%)', backgroundSize: '200% 100%', animation: 'sk 1.4s infinite' }} />
}

// ── Animated stat card with count-up ────────────────────────────────────────────
function StatCard({ icon: Icon, color, label, value, rawValue, isCurrency, tip, loading, delay = 0 }) {
  const counted = useCountUp(loading ? 0 : (rawValue ?? 0), 700)
  const display = loading ? null
    : (rawValue != null && isCurrency) ? `$${fmtAmt(counted)}`
    : (rawValue != null)               ? Math.round(counted)
    : value

  return (
    <div className="card" style={{
      display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 160,
      animation: `fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
    }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 18px ${color}18` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
          <InfoTooltip title={label} content={tip} side="top" />
        </div>
        {loading
          ? <Sk w="55%" h={22} r={6} />
          : <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope,sans-serif', letterSpacing: '-0.02em' }}>{display}</span>
        }
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  SUBSCRIPTIONS TAB
// ══════════════════════════════════════════════════════════

function SubRow({ sub, idx }) {
  const [open,       setOpen]       = useState(false)
  const [txns,       setTxns]       = useState(null)
  const [txnLoading, setTxnLoading] = useState(false)
  const color = catColor(sub.category)

  async function toggle() {
    if (!open && txns === null) {
      setTxnLoading(true)
      try {
        const r = await insightsApi.subscriptionTransactions(sub.normalizedName)
        setTxns(r.data.transactions ?? [])
      } catch {
        toast.error('Could not load transactions')
        setTxns([])
      } finally {
        setTxnLoading(false)
      }
    }
    setOpen(p => !p)
  }

  return (
    <div
      className="card"
      style={{
        overflow: 'hidden', padding: 0,
        borderColor: open ? `${color}30` : undefined,
        transition: 'border-color 0.25s, box-shadow 0.25s',
        boxShadow: open ? `0 0 0 1px ${color}18, 0 4px 28px rgba(0,0,0,0.4)` : undefined,
        animation: `fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) ${idx * 40}ms both`,
      }}
    >
      {/* Clickable header */}
      <button
        onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.028)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'box-shadow 0.2s', boxShadow: open ? `0 0 12px ${color}38` : 'none' }}>
          <Repeat2 size={15} style={{ color }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{sub.name}</span>
            {sub.isNew && (
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 5, padding: '2px 7px', animation: 'pulse 2.5s ease-in-out infinite' }}>
                NEW
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', background: `${color}13`, color, border: `1px solid ${color}28`, borderRadius: 5, padding: '2px 7px' }}>{sub.category}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}><RefreshCw size={9} />{sub.frequency}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={9} />{sub.monthCount} {sub.monthCount === 1 ? 'month' : 'months'}</span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope,sans-serif' }}>
            ${fmtAmt(sub.amount)}<span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>/mo</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
            <Clock size={9} />Last: {fmtDate(sub.lastSeen)}
          </div>
          {sub.amountLabel === 'variable' && (
            <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 1 }}>${fmtAmt(sub.amountMin)} – ${fmtAmt(sub.amountMax)}</div>
          )}
        </div>

        <ChevronDown size={15} style={{ color: 'var(--text-3)', flexShrink: 0, marginLeft: 4, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1)' }} />
      </button>

      {/* Accordion — CSS grid trick */}
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.38s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ borderTop: `1px solid ${color}18`, background: 'var(--surface-2)', padding: '0 18px' }}>
            {txnLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
                <Loader2 size={14} style={{ color: 'var(--text-3)', animation: 'spin 0.9s linear infinite' }} />
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading transactions…</span>
              </div>
            )}
            {!txnLoading && txns?.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '14px 0', textAlign: 'center' }}>No transactions found.</p>
            )}
            {!txnLoading && txns && txns.length > 0 && (
              <div style={{ paddingTop: 10, paddingBottom: 10 }}>
                <div style={{ display: 'flex', gap: 10, padding: '0 0 6px', marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 86, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Date</span>
                  <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Description</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Amount</span>
                </div>
                {txns.map((t, i) => (
                  <div key={t.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: i < txns.length - 1 ? '1px solid var(--border)' : 'none', borderRadius: 6, transition: 'background 0.12s', animation: `fadeUp 0.3s ${i * 30}ms both` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: 86, flexShrink: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'JetBrains Mono,monospace', background: 'var(--surface-3)', borderRadius: 5, padding: '2px 7px', display: 'inline-block', textAlign: 'center' }}>{fmtShort(t.date)}</span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope,sans-serif', flexShrink: 0 }}>${fmtAmt(t.amount)}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{txns.length} {txns.length === 1 ? 'transaction' : 'transactions'}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'Manrope,sans-serif' }}>Total ${fmtAmt(txns.reduce((s, t) => s + Number(t.amount), 0))}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SubscriptionsTab({ data, loading, error }) {
  const subs     = data?.subscriptions ?? []
  const total    = data?.totalMonthly  ?? 0
  const count    = data?.count         ?? 0
  const newCount = data?.newCount      ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatCard icon={DollarSign} color="#5b9bff" label="Monthly Recurring Total" rawValue={total} isCurrency
          tip="Sum of average amounts for all detected recurring charges. Variable subs use historical average." loading={loading} delay={0} />
        <StatCard icon={Repeat2} color="#8b5cf6" label="Recurring Charges" rawValue={count}
          tip="Number of distinct recurring charges detected across your transaction history." loading={loading} delay={60} />
        <StatCard icon={Sparkles} color="#10b981" label="New This Period" rawValue={newCount}
          tip="Charges first detected in the last 60 days — potential new subscriptions you haven't noticed." loading={loading} delay={120} />
      </div>

      {error && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Detected subscriptions</span>
          <InfoTooltip title="Sorted by amount" content="Highest recurring cost first. Click any row to expand and view each individual charge." side="right" />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', animation: `fadeUp 0.45s ${i * 40}ms both` }}>
                <Sk w={36} h={36} r={10} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><Sk w="42%" h={13} /><Sk w="26%" h={10} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}><Sk w={68} h={13} /><Sk w={84} h={10} /></div>
              </div>
            ))}
          </div>
        ) : subs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px', animation: 'fadeUp 0.5s both' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(91,155,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Repeat2 size={22} style={{ color: 'var(--text-3)' }} /></div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No recurring charges detected yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 360, margin: '0 auto' }}>Upload at least 2 months of transactions — Fiana will automatically detect subscriptions and recurring payments.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subs.map((sub, i) => <SubRow key={sub.normalizedName} sub={sub} idx={i} />)}
          </div>
        )}
      </div>

      {!loading && subs.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', paddingBottom: 4 }}>
          Detection: same description + similar amount in 2+ distinct months · amounts shown are averages
        </p>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  TOP MERCHANTS TAB
// ══════════════════════════════════════════════════════════

function SpendBar({ pct, color, delay = 0 }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(pct), 120 + delay); return () => clearTimeout(t) }, [pct, delay])
  return (
    <div style={{ width: 90, flexShrink: 0 }}>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg,${color}88,${color})`, width: `${w}%`, transition: 'width 1s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: `0 0 6px ${color}55` }} />
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'right', marginTop: 2 }}>{pct.toFixed(1)}%</div>
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']
function RankBadge({ rank }) {
  if (rank <= 3) return <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, width: 28, textAlign: 'center' }}>{MEDALS[rank - 1]}</span>
  return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'JetBrains Mono,monospace', width: 28, textAlign: 'center', flexShrink: 0 }}>#{rank}</span>
}

function TrendBadge({ trend, trendPct }) {
  if (trend === 'new') return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(91,155,255,0.12)', color: 'var(--brand)', border: '1px solid rgba(91,155,255,0.25)', borderRadius: 6, padding: '3px 8px' }}>NEW</span>
  if (trend === 'flat') return <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}><Minus size={12} />flat</span>
  const up = trend === 'up'
  return <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>{up ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}{up ? '+' : ''}{trendPct.toFixed(1)}%</span>
}

function MerchantRow({ m, maxSpend, idx }) {
  const color  = catColor(m.category)
  const barPct = maxSpend > 0 ? (m.totalSpend / maxSpend) * 100 : 0
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: '1px solid var(--border)', transition: 'background 0.15s', animation: `fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) ${idx * 30}ms both` }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <RankBadge rank={m.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{m.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', background: `${color}15`, color, border: `1px solid ${color}28`, borderRadius: 5, padding: '1px 7px' }}>{m.category}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.visitCount} {m.visitCount === 1 ? 'visit' : 'visits'}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>avg ${fmtAmt(m.avgPerVisit)}</span>
        </div>
      </div>
      <SpendBar pct={barPct} color={color} delay={idx * 30} />
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope,sans-serif' }}>${fmtAmt(m.totalSpend)}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{m.pctOfTotal}% of total</div>
      </div>
      <div style={{ flexShrink: 0, width: 72, textAlign: 'right' }}>
        <TrendBadge trend={m.trend} trendPct={m.trendPct} />
        {m.priorSpend > 0 && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>prev ${fmtAmt(m.priorSpend)}</div>}
      </div>
    </div>
  )
}

function MerchantsTab({ data, loading, error, startMonth, endMonth }) {
  const merchants     = data?.merchants     ?? []
  const totalSpend    = data?.totalSpend    ?? 0
  const merchantCount = data?.merchantCount ?? 0
  const priorPeriod   = data?.priorPeriod
  const maxSpend      = merchants[0]?.totalSpend ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatCard icon={BarChart2} color="#5b9bff" label="Total Spend" rawValue={totalSpend} isCurrency
          tip="Sum of all debit transactions in the selected period, excluding income and transfers." loading={loading} delay={0} />
        <StatCard icon={Store} color="#a78bfa" label="Merchants" rawValue={merchantCount}
          tip="Number of unique merchants in the top 20 for this period." loading={loading} delay={60} />
        {priorPeriod && !loading && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 160, animation: 'fadeUp 0.5s 120ms both' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(107,113,148,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={16} style={{ color: 'var(--text-3)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Compared to</span>
                <InfoTooltip title="Prior period" content="Trend arrows compare each merchant's spend vs the equivalent prior period of the same length." side="top" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>{fmtRange(priorPeriod.start, priorPeriod.end)}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', animation: 'fadeUp 0.5s 80ms both' }}>
        {/* Table header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', borderBottom: '1px solid var(--border-2)', background: 'var(--surface-2)' }}>
          <span style={{ width: 28, fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</span>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Merchant</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 90, fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Share</span>
            <InfoTooltip title="Share of total spend" content="This merchant's spend as a percentage of all spending in the period." side="top" />
          </div>
          <span style={{ minWidth: 80, fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Amount</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 72, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trend</span>
            <InfoTooltip title="Trend vs prior period" content="↑ red = spending more. ↓ green = spending less. NEW = not seen before." side="left" />
          </div>
        </div>

        {loading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: '1px solid var(--border)', animation: `fadeUp 0.4s ${i * 35}ms both` }}>
              <Sk w={28} h={28} r={8} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}><Sk w="40%" h={13} /><Sk w="22%" h={10} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}><Sk w={72} h={13} /><Sk w={44} h={10} /></div>
              <Sk w={90} h={6} r={3} /><Sk w={36} h={20} r={6} />
            </div>
          ))
        ) : merchants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', animation: 'fadeUp 0.5s both' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(251,191,36,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><ShoppingBag size={22} style={{ color: 'var(--text-3)' }} /></div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No transactions found</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 360, margin: '0 auto' }}>
              {startMonth ? 'No debit transactions for this period. Try a different date range.' : 'Select a date range to view your top merchants.'}
            </p>
          </div>
        ) : (
          merchants.map((m, i) => <MerchantRow key={`${m.name}-${i}`} m={m} maxSpend={maxSpend} idx={i} />)
        )}
      </div>

      {/* Legend */}
      {!loading && merchants.length > 0 && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', animation: 'fadeUp 0.5s 200ms both' }}>
          {[
            { color: '#ef4444', icon: <TrendingUp size={11}/>,   label: 'More than prior period' },
            { color: '#10b981', icon: <TrendingDown size={11}/>, label: 'Less than prior period' },
            { color: 'var(--text-3)', icon: <Minus size={11}/>,  label: 'Flat (±5%)' },
            { color: 'var(--brand)', label: 'NEW — not seen before' },
          ].map(({ color, icon, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-3)' }}>
              {icon && <span style={{ color }}>{icon}</span>}
              <span style={{ color }}>{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════

const TABS = [
  { id: 'subscriptions', label: 'Subscriptions', icon: Repeat2,  color: '#10b981', desc: 'Recurring charges detected from your history' },
  { id: 'merchants',     label: 'Top Merchants', icon: Trophy,   color: '#fbbf24', desc: 'Ranked by total spend in the selected period' },
]

export default function SpendingInsightsPage() {
  const [tab,     setTab]     = useState('subscriptions')
  const [animKey, setAnimKey] = useState(0)
  const tabBarRef             = useRef(null)
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 })

  // ── Subscriptions state ──
  const [subData,    setSubData]    = useState(null)
  const [subLoading, setSubLoading] = useState(true)
  const [subError,   setSubError]   = useState(null)

  // ── Merchants state ──
  const { startMonth, endMonth } = useTimeFilter()
  const [mData,    setMData]    = useState(null)
  const [mLoading, setMLoading] = useState(false)
  const [mError,   setMError]   = useState(null)

  // Fetch subscriptions on mount
  useEffect(() => {
    insightsApi.subscriptions()
      .then(r  => { setSubData(r.data); setSubError(null) })
      .catch(e => { setSubError(e.response?.data?.message || 'Failed to load'); toast.error('Could not load subscriptions') })
      .finally(() => setSubLoading(false))
  }, [])

  // Fetch merchants whenever period changes
  useEffect(() => {
    if (!startMonth || !endMonth) return
    setMLoading(true)
    setMData(null)
    insightsApi.merchantLeaderboard(startMonth, endMonth)
      .then(r  => { setMData(r.data); setMError(null) })
      .catch(e => { setMError(e.response?.data?.message || 'Failed to load'); toast.error('Could not load merchant leaderboard') })
      .finally(() => setMLoading(false))
  }, [startMonth, endMonth])

  // ── Pill position ────────────────────────────────────────────────────────────
  const updatePill = useCallback(() => {
    if (!tabBarRef.current) return
    const buttons = tabBarRef.current.querySelectorAll('button[data-tab]')
    const activeBtn = tabBarRef.current.querySelector(`button[data-tab="${tab}"]`)
    if (!activeBtn || !tabBarRef.current) return
    const barRect = tabBarRef.current.getBoundingClientRect()
    const btnRect = activeBtn.getBoundingClientRect()
    setPillStyle({ left: btnRect.left - barRect.left, width: btnRect.width })
  }, [tab])

  useEffect(() => {
    updatePill()
    window.addEventListener('resize', updatePill)
    return () => window.removeEventListener('resize', updatePill)
  }, [updatePill])

  function handleTab(id) {
    if (id === tab) return
    setTab(id)
    setAnimKey(k => k + 1)
  }

  const activeTab = TABS.find(t => t.id === tab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Page header ── */}
      <div style={{ animation: 'fadeDown 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(91,155,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(91,155,255,0.2)' }}>
            <PieChart size={17} style={{ color: 'var(--brand)' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', background: 'linear-gradient(135deg, var(--text) 40%, var(--text-2) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Spending Insights
          </h1>
          <InfoTooltip
            title="Spending Insights"
            content="Subscriptions detects recurring charges from your history. Top Merchants ranks where you actually spend the most money."
            side="right"
          />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 46 }}>
          {activeTab.desc}
        </p>
      </div>

      {/* ── Animated tab bar ── */}
      <div style={{ animation: 'fadeUp 0.5s 60ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <div
          ref={tabBarRef}
          style={{ position: 'relative', display: 'inline-flex', background: 'var(--surface-2)', padding: 4, borderRadius: 14, border: '1px solid var(--border)', gap: 2 }}
        >
          {/* Sliding pill */}
          <div style={{
            position: 'absolute', top: 4, bottom: 4,
            left: pillStyle.left + 4, width: pillStyle.width - 8,
            background: 'var(--surface)',
            borderRadius: 10,
            boxShadow: `0 2px 10px rgba(0,0,0,0.35), 0 0 0 1px var(--border-2)`,
            transition: 'left 0.38s cubic-bezier(0.34,1.56,0.64,1), width 0.38s cubic-bezier(0.34,1.56,0.64,1)',
            pointerEvents: 'none',
          }} />

          {TABS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              data-tab={id}
              onClick={() => handleTab(id)}
              style={{
                position: 'relative', zIndex: 1,
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 10,
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: tab === id ? color : 'var(--text-3)',
                transition: 'color 0.25s',
                fontSize: 13, fontWeight: 600,
                fontFamily: 'DM Sans,Manrope,sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={14} style={{ flexShrink: 0 }} />
              {label}
              {/* Active dot */}
              {tab === id && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 7px ${color}`, marginLeft: 2, animation: 'dotPop 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content with entrance animation ── */}
      <div key={animKey} style={{ animation: 'tabEnter 0.42s cubic-bezier(0.16,1,0.3,1) both' }}>
        {tab === 'subscriptions'
          ? <SubscriptionsTab data={subData} loading={subLoading} error={subError} />
          : <MerchantsTab data={mData} loading={mLoading} error={mError} startMonth={startMonth} endMonth={endMonth} />
        }
      </div>

      <style>{`
        @keyframes sk       { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes fadeDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:none} }
        @keyframes tabEnter { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes dotPop   { from{opacity:0;transform:scale(0)} to{opacity:1;transform:scale(1)} }
        @keyframes pulse    {
          0%,100% { opacity:1; box-shadow:none }
          50%     { opacity:0.8; box-shadow:0 0 8px rgba(16,185,129,0.4) }
        }
      `}</style>
    </div>
  )
}
