import { useState, useEffect } from 'react'
import { insightsApi } from '../utils/api'
import {
  Repeat2, DollarSign, Sparkles, Calendar,
  AlertCircle, Clock, RefreshCw, ChevronDown, Loader2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'
import toast from 'react-hot-toast'

// ── Category colours ────────────────────────────────────────────────────────────
const CAT_COLORS = {
  'Food & Drink':   '#f97316', 'Entertainment': '#8b5cf6',
  'Shopping':       '#ec4899', 'Transportation':'#06b6d4',
  'Health':         '#10b981', 'Groceries':     '#84cc16',
  'Utilities':      '#f59e0b', 'Housing':       '#3b82f6',
  'Travel':         '#a78bfa', 'Education':     '#34d399',
  'Personal Care':  '#fb7185', 'Subscriptions': '#5b9bff',
  'Insurance':      '#64748b', 'Investments':   '#22d3ee',
  'Other':          '#6b7194', 'Uncategorized': '#6b7194',
}
const catColor = c => CAT_COLORS[c] || '#6b7194'

const fmtAmt  = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = s => { try { return format(parseISO(s), 'MMM d, yyyy') } catch { return s ?? '—' } }
const fmtShort = s => { try { return format(parseISO(s), 'MMM d, yy') }  catch { return s ?? '—' } }

// ── Shimmer skeleton ────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = 14, r = 6 }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3) 50%,var(--surface-2) 75%)', backgroundSize: '200% 100%', animation: 'sk 1.4s infinite' }} />
}

function SkCard() {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
      <Sk w={36} h={36} r={10} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Sk w="42%" h={13} /><Sk w="26%" h={10} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <Sk w={68} h={13} /><Sk w={84} h={10} />
      </div>
    </div>
  )
}

// ── Stat card ───────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, color, label, value, tip, loading }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
          <InfoTooltip title={label} content={tip} side="top" />
        </div>
        {loading
          ? <Sk w="55%" h={22} r={6} />
          : <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope,sans-serif' }}>{value}</span>
        }
      </div>
    </div>
  )
}

// ── Accordion subscription row ──────────────────────────────────────────────────
function SubRow({ sub, idx }) {
  const [open,       setOpen]       = useState(false)
  const [txns,       setTxns]       = useState(null)   // null = never fetched
  const [txnLoading, setTxnLoading] = useState(false)

  const color = catColor(sub.category)

  async function toggle() {
    // Fetch on first open only
    if (!open && txns === null) {
      setTxnLoading(true)
      try {
        const r = await insightsApi.subscriptionTransactions(sub.normalizedName, sub.roundedAmount)
        setTxns(r.data.transactions ?? [])
      } catch {
        toast.error('Could not load transactions for this subscription')
        setTxns([])
      } finally {
        setTxnLoading(false)
      }
    }
    setOpen(p => !p)
  }

  return (
    <ScrollFade delay={idx * 30}>
      <div className="card" style={{ overflow: 'hidden', padding: 0, transition: 'border-color 0.2s', borderColor: open ? `${color}28` : undefined }}>

        {/* ── Clickable header ── */}
        <button
          onClick={toggle}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 18px', cursor: 'pointer',
            background: 'transparent', border: 'none', textAlign: 'left',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {/* Icon */}
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Repeat2 size={15} style={{ color }} />
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{sub.name}</span>
              {sub.isNew && (
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 5, padding: '2px 7px' }}>
                  NEW
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', background: `${color}13`, color, border: `1px solid ${color}28`, borderRadius: 5, padding: '2px 7px' }}>
                {sub.category}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <RefreshCw size={9} />{sub.frequency}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Calendar size={9} />{sub.monthCount} {sub.monthCount === 1 ? 'month' : 'months'}
              </span>
            </div>
          </div>

          {/* Amount + last seen */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'Manrope,sans-serif' }}>
              ${fmtAmt(sub.amount)}
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>/mo</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
              <Clock size={9} />Last: {fmtDate(sub.lastSeen)}
            </div>
            {sub.amountLabel === 'variable' && (
              <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 1 }}>
                ${fmtAmt(sub.amountMin)} – ${fmtAmt(sub.amountMax)}
              </div>
            )}
          </div>

          {/* Expand chevron */}
          <ChevronDown size={15} style={{
            color: 'var(--text-3)', flexShrink: 0, marginLeft: 4,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
          }} />
        </button>

        {/* ── Accordion panel (CSS grid trick — no height measurement needed) ── */}
        <div style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.38s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ borderTop: `1px solid ${color}18`, background: 'var(--surface-2)', padding: '0 18px' }}>

              {/* Loading */}
              {txnLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
                  <Loader2 size={14} style={{ color: 'var(--text-3)', animation: 'spin 0.9s linear infinite' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading transactions…</span>
                </div>
              )}

              {/* Empty */}
              {!txnLoading && txns?.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '14px 0', textAlign: 'center' }}>
                  No transactions found for this subscription.
                </p>
              )}

              {/* Transaction list */}
              {!txnLoading && txns && txns.length > 0 && (
                <div style={{ paddingTop: 10, paddingBottom: 10 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 6px', marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ width: 86, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Date</span>
                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Description</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Amount</span>
                  </div>

                  {/* Rows */}
                  {txns.map((t, i) => (
                    <div
                      key={t.id ?? i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 0',
                        borderBottom: i < txns.length - 1 ? '1px solid var(--border)' : 'none',
                        transition: 'background 0.12s',
                        borderRadius: 6,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Date pill */}
                      <span style={{
                        width: 86, flexShrink: 0, fontSize: 11, fontWeight: 600,
                        color: 'var(--text-3)', fontFamily: 'JetBrains Mono,monospace',
                        background: 'var(--surface-3)', borderRadius: 5,
                        padding: '2px 7px', display: 'inline-block', textAlign: 'center',
                      }}>
                        {fmtShort(t.date)}
                      </span>

                      {/* Description */}
                      <span style={{
                        flex: 1, fontSize: 12, color: 'var(--text-2)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.description}
                      </span>

                      {/* Amount */}
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Manrope,sans-serif', flexShrink: 0 }}>
                        ${fmtAmt(t.amount)}
                      </span>
                    </div>
                  ))}

                  {/* Footer summary */}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {txns.length} {txns.length === 1 ? 'transaction' : 'transactions'} detected
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'Manrope,sans-serif' }}>
                      Total ${fmtAmt(txns.reduce((s, t) => s + Number(t.amount), 0))}
                    </span>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </ScrollFade>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    setLoading(true)
    insightsApi.subscriptions()
      .then(r  => { setData(r.data); setError(null) })
      .catch(e => { setError(e.response?.data?.message || 'Failed to load subscriptions'); toast.error('Could not load subscriptions') })
      .finally(() => setLoading(false))
  }, [])

  const subs     = data?.subscriptions ?? []
  const total    = data?.totalMonthly  ?? 0
  const count    = data?.count         ?? 0
  const newCount = data?.newCount      ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <ScrollFade>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(91,155,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Repeat2 size={16} style={{ color: 'var(--brand)' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Subscriptions & Recurring Charges
            </h1>
            <InfoTooltip
              title="How recurring detection works"
              content="Fiana groups transactions with the same description and similar amount appearing in 2+ different calendar months. Click any row to see every individual transaction."
              side="right"
            />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 44 }}>
            Detected from your full history · click a row to see all transactions
          </p>
        </div>
      </ScrollFade>

      {/* Stats */}
      <ScrollFade delay={60}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <StatCard icon={DollarSign} color="#5b9bff" label="Monthly Recurring Total"
            value={loading ? '' : `$${fmtAmt(total)}`}
            tip="Sum of average amounts for all detected recurring charges. Variable-amount subs use their historical average."
            loading={loading} />
          <StatCard icon={Repeat2} color="#8b5cf6" label="Recurring Charges"
            value={loading ? '' : count}
            tip="Number of distinct recurring charges detected across your transaction history."
            loading={loading} />
          <StatCard icon={Sparkles} color="#10b981" label="New This Period"
            value={loading ? '' : newCount}
            tip="Recurring charges first detected in the last 60 days — potential new subscriptions you may not have noticed."
            loading={loading} />
        </div>
      </ScrollFade>

      {/* Error */}
      {error && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>
        </div>
      )}

      {/* List */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Detected subscriptions
          </span>
          <InfoTooltip
            title="Sorted by amount"
            content="Highest recurring cost first. Click any row to expand and view each individual charge."
            side="right"
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => <SkCard key={i} />)}
          </div>
        ) : subs.length === 0 ? (
          <ScrollFade>
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(91,155,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Repeat2 size={22} style={{ color: 'var(--text-3)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No recurring charges detected yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 360, margin: '0 auto' }}>
                Upload at least 2 months of transactions — Fiana will automatically detect subscriptions and recurring payments.
              </p>
            </div>
          </ScrollFade>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subs.map((sub, i) => (
              <SubRow key={`${sub.normalizedName}-${sub.roundedAmount}`} sub={sub} idx={i} />
            ))}
          </div>
        )}
      </div>

      {!loading && subs.length > 0 && (
        <ScrollFade>
          <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', paddingBottom: 8 }}>
            Detection: same description + similar amount in 2+ distinct months · amounts shown are averages
          </p>
        </ScrollFade>
      )}

      <style>{`
        @keyframes sk   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
