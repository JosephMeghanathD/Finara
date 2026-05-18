import { useState, useEffect } from 'react'
import { txnApi, aiApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  AlertTriangle, RefreshCw, Trash2, ChevronDown,
  Sparkles, Shield, Activity,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AiText from '../components/AiText'
import AiLoader from '../components/AiLoader'
import ConfirmDialog from '../components/ConfirmDialog'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDetails(anomalyReason) {
  if (!anomalyReason) return null
  try { return JSON.parse(anomalyReason) }
  catch { return { primary: anomalyReason, signals: [], risk_score: 0, severity: 'low' } }
}

const SEV = {
  high:   { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', glow: 'rgba(239,68,68,0.18)', label: 'HIGH'   },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', glow: 'rgba(245,158,11,0.18)', label: 'MEDIUM' },
  low:    { color: '#6366F1', bg: 'rgba(99,102,241,0.10)',  glow: 'rgba(99,102,241,0.18)',  label: 'LOW'    },
}

const SIG = {
  high_amount:    { color: '#EF4444', bg: 'rgba(239,68,68,0.10)',  icon: '↑' },
  top_percentile: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', icon: '◈' },
  new_merchant:   { color: '#0EA5E9', bg: 'rgba(14,165,233,0.10)', icon: '✦' },
  low_amount:     { color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)', icon: '↓' },
  unusual_day:    { color: '#6366F1', bg: 'rgba(99,102,241,0.10)', icon: '◷' },
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskBar({ score, color }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(score), 80); return () => clearTimeout(t) }, [score])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          width: `${w}%`,
          transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: `0 0 8px ${color}55`,
        }} />
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
        {score}
      </span>
    </div>
  )
}

function AmountBar({ amount, avg, color }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 110); return () => clearTimeout(t) }, [])
  if (!avg || avg <= 0) return null
  const maxVal = Math.max(amount, avg) * 1.12
  const amtPct = Math.min((amount / maxVal) * 100, 100)
  const avgPct = Math.min((avg   / maxVal) * 100, 100)
  const row = (label, pct, barColor, textColor, val) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text-3)', width: 42, textAlign: 'right', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999,
          background: barColor,
          width: ready ? `${pct}%` : '0%',
          transition: 'width 0.85s cubic-bezier(0.34,1.56,0.64,1)',
        }} />
      </div>
      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: textColor, minWidth: 54, fontWeight: 600 }}>
        ${val.toFixed(2)}
      </span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {row('This', amtPct, `linear-gradient(90deg, ${color}88, ${color})`, color, amount)}
      {row('Avg', avgPct, 'rgba(255,255,255,0.18)', 'var(--text-3)', avg)}
    </div>
  )
}

function SignalChip({ signal }) {
  const s = SIG[signal.type] || { color: 'var(--text-3)', bg: 'var(--surface-2)', icon: '·' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 700,
      border: `1px solid ${s.color}33`,
      letterSpacing: '0.02em',
    }}>
      <span style={{ fontSize: 9, lineHeight: 1 }}>{s.icon}</span>
      {signal.label}
    </span>
  )
}

function AnomalyCard({ txn, onDelete, onExplain, explaining, explanation }) {
  const details   = parseDetails(txn.anomalyReason)
  const sev       = details?.severity || 'low'
  const sevStyle  = SEV[sev] || SEV.low
  const [expanded, setExpanded] = useState(false)
  const amount = parseFloat(txn.amount)

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${sevStyle.color}`,
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.35)',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 32px rgba(0,0,0,0.45), 0 0 0 1px ${sevStyle.color}22` }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.35)' }}
    >
      {/* ── Main row ── */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>

        {/* Severity badge */}
        <div style={{
          flexShrink: 0, marginTop: 2,
          background: sevStyle.bg,
          border: `1px solid ${sevStyle.color}44`,
          borderRadius: 6, padding: '4px 7px',
          boxShadow: `0 0 10px ${sevStyle.glow}`,
        }}>
          <span style={{
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 11, letterSpacing: '0.09em',
            color: sevStyle.color, lineHeight: 1, display: 'block',
          }}>{sevStyle.label}</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>{txn.description}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, color: sevStyle.color }}>
                  ${amount.toFixed(2)}
                </span>
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{txn.transactionDate}</span>
                {txn.category && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                    background: 'var(--surface-2)', color: 'var(--text-2)',
                    border: '1px solid var(--border)',
                  }}>{txn.category}</span>
                )}
              </div>
              {details?.signals?.length > 0 && (
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                  {details.signals.map((s, i) => <SignalChip key={i} signal={s} />)}
                </div>
              )}
            </div>

            {/* Risk pill + actions */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flexShrink: 0 }}>
              {details?.risk_score != null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 9px', borderRadius: 999,
                  background: sevStyle.bg, border: `1px solid ${sevStyle.color}33`,
                }}>
                  <Activity size={10} style={{ color: sevStyle.color }} />
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: sevStyle.color }}>
                    {details.risk_score} risk
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setExpanded(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: 'var(--surface-2)', color: 'var(--text-2)',
                    border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s' }} />
                  {expanded ? 'Less' : 'Details'}
                </button>
                <button onClick={() => onDelete(txn)}
                  title="Delete"
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    color: 'var(--text-3)', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color='#f87171'; e.currentTarget.style.borderColor='rgba(248,113,113,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.color='var(--text-3)'; e.currentTarget.style.borderColor='var(--border)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.32s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <div style={{
              padding: '14px 16px 14px 36px',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18,
            }}>
              {/* Left col: risk bar + finding + stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {expanded && details?.risk_score != null && (
                  <div>
                    <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Risk Score</p>
                    <RiskBar score={details.risk_score} color={sevStyle.color} />
                  </div>
                )}
                {details?.primary && (
                  <div>
                    <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Finding</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{details.primary}</p>
                  </div>
                )}
                {details?.z_score != null && (
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 2 }}>Z-Score</p>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 800, color: sevStyle.color }}>
                        {details.z_score > 0 ? '+' : ''}{details.z_score}
                      </span>
                    </div>
                    <div>
                      <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 2 }}>Percentile</p>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 800, color: 'var(--text-2)' }}>
                        {details.amount_percentile}th
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right col: amount bar + signal details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {expanded && details?.category_avg != null && details.category_avg > 0 && (
                  <div>
                    <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                      Amount vs Category Avg
                    </p>
                    <AmountBar amount={amount} avg={details.category_avg} color={sevStyle.color} />
                  </div>
                )}
                {details?.signals?.length > 0 && (
                  <div>
                    <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Signal Details</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {details.signals.map((s, i) => {
                        const ss = SIG[s.type] || { color: 'var(--text-3)' }
                        return (
                          <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                            <div style={{ width: 3, height: 3, borderRadius: 999, background: ss.color, marginTop: 5, flexShrink: 0 }} />
                            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>{s.detail}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ask Fiana */}
            <div style={{ padding: '0 16px 14px 36px' }}>
              {explanation ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 3, height: 13, borderRadius: 999, background: 'var(--brand)' }} />
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>Fiana explains</p>
                  </div>
                  <AiText content={explanation} compact />
                </div>
              ) : (
                <button onClick={() => onExplain(txn)} disabled={explaining === txn.id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: 'var(--brand-light)', color: 'var(--brand)',
                    border: '1px solid rgba(91,155,255,0.2)', cursor: 'pointer',
                    opacity: explaining === txn.id ? 0.6 : 1, transition: 'opacity 0.15s',
                  }}>
                  <Sparkles size={11} />
                  {explaining === txn.id ? 'Asking Fiana…' : 'Ask Fiana why this was flagged'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnomaliesPage() {
  const { startDate, endDate } = useTimeFilter()
  const [anomalies, setAnomalies]       = useState([])
  const [loading, setLoading]           = useState(false)
  const [rechecking, setRechecking]     = useState(false)
  const [recheckConfirm, setRecheckConfirm] = useState(false)
  const [explaining, setExplaining]     = useState(null)
  const [explanations, setExplanations] = useState({})
  const [confirmTxn, setConfirmTxn]     = useState(null)
  const [sevFilter, setSevFilter]       = useState('all')

  useEffect(() => {
    if (!startDate || !endDate) return
    setLoading(true)
    txnApi.anomalies(startDate, endDate).then(r => setAnomalies(r.data)).finally(() => setLoading(false))
  }, [startDate, endDate])

  const recheck = async () => {
    setRecheckConfirm(false)
    setRechecking(true)
    try {
      const { data } = await txnApi.recheckAnomalies(startDate, endDate)
      toast.success(`Rechecked ${data.checked} transactions — ${data.flagged} flagged`)
      const r = await txnApi.anomalies(startDate, endDate)
      setAnomalies(r.data)
    } catch { toast.error("Scan failed — is the ML service running?") }
    finally { setRechecking(false) }
  }

  const handleDelete = async (txn) => {
    try {
      await txnApi.delete(txn.id)
      setAnomalies(prev => prev.filter(t => t.id !== txn.id))
      toast.success('Transaction removed')
    } catch { toast.error('Failed to delete') }
    finally { setConfirmTxn(null) }
  }

  const explain = async (txn) => {
    if (explanations[txn.id]) return
    setExplaining(txn.id)
    try {
      const { data } = await aiApi.explainAnomaly(txn.id)
      setExplanations(prev => ({ ...prev, [txn.id]: data.explanation }))
    } catch { toast.error('Fiana went quiet — is the AI service up?') }
    finally { setExplaining(null) }
  }

  const counts = { high: 0, medium: 0, low: 0 }
  anomalies.forEach(txn => {
    const d = parseDetails(txn.anomalyReason)
    const s = d?.severity || 'low'
    if (s in counts) counts[s]++
  })

  const filtered = sevFilter === 'all'
    ? anomalies
    : anomalies.filter(txn => (parseDetails(txn.anomalyReason)?.severity || 'low') === sevFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <ScrollFade delay={0}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Shield size={15} style={{ color: '#EF4444' }} />
              </div>
              <h2 style={{
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 26, letterSpacing: '0.05em', color: 'var(--text)', lineHeight: 1,
              }}>
                Financial Forensics
              </h2>
              <InfoTooltip
                title="Anomaly Detection"
                content="Isolation Forest ML model scores each transaction by how much it deviates from your spending patterns. Signals — z-score, percentile rank, new merchant detection — are computed from statistical analysis only. Results are saved to the database and not recalculated on read."
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5, marginLeft: 42 }}>
              Isolation Forest · statistical signal analysis · no AI inference
            </p>
          </div>
          <button onClick={() => setRecheckConfirm(true)} disabled={rechecking || !startDate}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: 'var(--surface)', color: 'var(--text-2)',
              border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
              opacity: rechecking ? 0.6 : 1,
            }}>
            <RefreshCw size={12} className={rechecking ? 'animate-spin' : ''} />
            {rechecking ? 'Scanning…' : 'Recheck'}
          </button>
        </div>
      </ScrollFade>

      {/* ── Summary strip ── */}
      {!loading && anomalies.length > 0 && (
        <ScrollFade delay={40}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { label: 'Flagged', value: anomalies.length, color: 'var(--brand)', sev: null },
              { label: 'High',   value: counts.high,    color: '#EF4444', sev: 'high'   },
              { label: 'Medium', value: counts.medium,  color: '#F59E0B', sev: 'medium' },
              { label: 'Low',    value: counts.low,     color: '#6366F1', sev: 'low'    },
            ].map(({ label, value, color, sev }) => {
              const active = sev ? sevFilter === sev : sevFilter === 'all'
              return (
                <div key={label}
                  onClick={() => setSevFilter(sev ? (sevFilter === sev ? 'all' : sev) : 'all')}
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${active ? `${color}44` : 'var(--border)'}`,
                    borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: active ? `0 0 0 1px ${color}22, 0 0 18px ${color}11` : 'none',
                  }}>
                  <p style={{
                    fontFamily: 'Bebas Neue, sans-serif',
                    fontSize: 10, letterSpacing: '0.08em', color, marginBottom: 4,
                  }}>{label}</p>
                  <span style={{
                    fontFamily: 'JetBrains Mono', fontSize: 24, fontWeight: 800,
                    color, lineHeight: 1,
                  }}>{value}</span>
                </div>
              )
            })}
          </div>
        </ScrollFade>
      )}

      {/* ── Severity filter pills ── */}
      {!loading && anomalies.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(['all', 'high', 'medium', 'low']).map(s => {
            const active = sevFilter === s
            const c = s === 'all' ? 'var(--brand)' : SEV[s]?.color
            return (
              <button key={s} onClick={() => setSevFilter(s)}
                style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  fontFamily: s !== 'all' ? 'Bebas Neue, sans-serif' : 'inherit',
                  letterSpacing: s !== 'all' ? '0.07em' : 'normal',
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? (s === 'all' ? 'var(--brand-light)' : SEV[s]?.bg) : 'transparent',
                  color: active ? c : 'var(--text-3)',
                  border: `1px solid ${active ? (s === 'all' ? 'rgba(91,155,255,0.3)' : `${c}44`) : 'var(--border)'}`,
                }}>
                {s === 'all' ? 'All' : s.toUpperCase()}
              </button>
            )
          })}
          {sevFilter !== 'all' && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {filtered.length} of {anomalies.length} shown
            </span>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && <AiLoader type="anomaly" title="Financial Forensics · Scanning" />}

      {/* ── Empty state ── */}
      {!loading && anomalies.length === 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '52px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', margin: '0 auto 12px',
            background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>✓</div>
          <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>All Clear</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No anomalies detected in this period</p>
        </div>
      )}

      {/* ── Anomaly cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((txn, i) => (
          <ScrollFade key={txn.id} delay={i * 35}>
            <AnomalyCard
              txn={txn}
              onDelete={setConfirmTxn}
              onExplain={explain}
              explaining={explaining}
              explanation={explanations[txn.id]}
            />
          </ScrollFade>
        ))}
      </div>

      {/* ── Recheck confirm ── */}
      {recheckConfirm && (
        <ConfirmDialog
          title="Recheck anomalies?"
          message="This re-runs the Isolation Forest model on all transactions in this period. Existing anomaly scores and signals will be overwritten."
          confirmLabel="Recheck"
          onConfirm={recheck}
          onCancel={() => setRecheckConfirm(false)}
        />
      )}

      {/* ── Delete confirm ── */}
      {confirmTxn && (
        <ConfirmDialog
          title="Delete transaction?"
          message={`"${confirmTxn.description}" on ${confirmTxn.transactionDate} will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmTxn)}
          onCancel={() => setConfirmTxn(null)}
        />
      )}
    </div>
  )
}
