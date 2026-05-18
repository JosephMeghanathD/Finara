import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { budgetApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { format, parseISO, getDaysInMonth } from 'date-fns'
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid, Line, ReferenceLine,
} from 'recharts'
import {
  Sparkles, Zap, Brain, ChevronDown, Save, Plus, Check,
  TrendingUp, RefreshCw, Target, CalendarRange,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useCategories } from '../hooks/useCategories'
import AiText from '../components/AiText'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'
import ConfirmDialog from '../components/ConfirmDialog'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtD     = v => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtK     = v => `$${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : Number(v).toFixed(0)}`
const fmtMo    = m => { try { return format(parseISO(m + '-01'), 'MMM yy') } catch { return m } }
const moLabel  = m => { try { return format(parseISO(m + '-01'), 'MMM') } catch { return m.slice(5) } }
const utilColor = pct => pct > 100 ? '#EF4444' : pct > 88 ? '#F59E0B' : '#10B981'

function prevMonth(m) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Shared: Chart Tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0f1322', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', fontSize: 12, minWidth: 148 }}>
      <p style={{ color: '#6b729a', fontSize: 10, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke || 'var(--text)', margin: '3px 0', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
          {typeof p.value === 'number' ? fmtD(p.value) : p.value}
          <span style={{ fontSize: 10, color: '#6b729a', marginLeft: 6 }}>{p.name}</span>
        </p>
      ))}
    </div>
  )
}

// ── Monthly: Thinking indicator ───────────────────────────────────────────────

function ThinkingIndicator() {
  const delays = [0, 0.13, 0.26, 0.39, 0.26, 0.13, 0]
  return (
    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
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
        <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: 'var(--brand)', marginBottom: 1, lineHeight: 1 }}>
          Fiana is thinking
        </p>
        <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-3)' }}>Analyzing budget vs actuals…</p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton" style={{ height: 9, borderRadius: 5 }} />
        <div className="skeleton" style={{ height: 9, borderRadius: 5, width: '82%' }} />
        <div className="skeleton" style={{ height: 9, borderRadius: 5, width: '58%' }} />
      </div>
    </div>
  )
}

// ── Monthly: Animated fill bar ────────────────────────────────────────────────

function AnimBar({ pct, color, delay = 0, height = 5 }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(pct, 100)), delay)
    return () => clearTimeout(t)
  }, [pct, delay])
  return (
    <div style={{ height, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 999,
        background: `linear-gradient(90deg, ${color}77, ${color})`,
        width: `${w}%`, transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: `0 0 6px ${color}44`,
      }} />
    </div>
  )
}

// ── Monthly: Health ring ──────────────────────────────────────────────────────

function HealthRing({ pct, grade }) {
  const radius    = 52
  const circ      = 2 * Math.PI * radius
  const clamped   = Math.min(Math.max(pct, 0), 100)
  const dashOff   = circ - (clamped / 100) * circ
  const ringColor = pct > 100 ? '#EF4444' : pct > 88 ? '#F59E0B' : '#10B981'
  const gradeColor= grade === 'A' ? '#10B981' : grade === 'B' ? '#F59E0B' : grade === 'C' ? '#F97316' : '#EF4444'
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 120); return () => clearTimeout(t) }, [pct])
  return (
    <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="13" />
        <circle cx="65" cy="65" r={radius} fill="none" stroke={ringColor} strokeWidth="13"
          strokeDasharray={circ} strokeDashoffset={on ? dashOff : circ}
          strokeLinecap="round" transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 46, color: gradeColor, letterSpacing: '-0.01em', lineHeight: 1 }}>{grade}</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--text-3)', lineHeight: 1.3 }}>{Math.round(pct)}% used</span>
      </div>
    </div>
  )
}

// ── Monthly: Category row ─────────────────────────────────────────────────────

function CategoryRow({ cat, budgetVal, actual, context, color, isCurrentMonth, daysElapsed, daysInMonth, onChange, idx }) {
  const pct      = budgetVal > 0 ? (actual / budgetVal) * 100 : 0
  const barColor = utilColor(pct)
  const remaining  = (budgetVal || 0) - (actual || 0)
  const daysLeft   = Math.max(daysInMonth - daysElapsed, 1)
  const dailyAllow = isCurrentMonth && budgetVal > 0 ? remaining / daysLeft : null

  const ctxAmounts = context?.amounts || []
  const ctxLabels  = context?.months_short || []
  const ctxMax     = Math.max(...ctxAmounts.filter(Boolean), budgetVal || 0, 1)

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 136, flexShrink: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
        </div>
        <div style={{ flex: 1 }}>
          <AnimBar pct={Math.min(pct, 100)} color={barColor} delay={80 + idx * 25} height={5} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: pct > 100 ? '#EF4444' : 'var(--text-2)', minWidth: 60, textAlign: 'right' }}>
            {actual > 0 ? fmtD(actual) : '—'}
          </span>
          <span style={{ color: 'var(--text-3)', fontSize: 10, flexShrink: 0 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>$</span>
            <input
              type="number" min="0"
              value={budgetVal || ''}
              onChange={e => onChange(cat, Number(e.target.value))}
              placeholder={context?.suggested ? Math.round(context.suggested) : '—'}
              title={context?.suggested ? `3-mo avg: $${Math.round(context.avg)} · suggested: $${Math.round(context.suggested)}` : 'Set budget'}
              style={{
                width: 68, fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600,
                color: 'var(--text)', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)', borderRadius: 7,
                padding: '3px 5px', outline: 'none', textAlign: 'right',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.6)'; e.target.style.background = 'rgba(99,102,241,0.06)'; e.target.select() }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.background = 'rgba(255,255,255,0.04)' }}
            />
          </div>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: barColor, fontWeight: 700, width: 36, textAlign: 'right', flexShrink: 0 }}>
            {budgetVal > 0 ? `${Math.round(pct)}%` : ''}
          </span>
        </div>
      </div>

      {(ctxAmounts.length > 0 || (isCurrentMonth && dailyAllow !== null && budgetVal > 0)) && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginTop: 5, paddingLeft: 148, flexWrap: 'wrap' }}>
          {ctxAmounts.map((amt, i) => (
            <div key={i} title={`${ctxLabels[i] || ''}: ${fmtD(amt)}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <div style={{ width: 20, height: 18, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{
                  width: '100%', borderRadius: 2,
                  background: budgetVal > 0 && amt > budgetVal ? 'rgba(239,68,68,0.45)' : `${color}44`,
                  height: ctxMax > 0 ? `${Math.min((amt / ctxMax) * 100, 100)}%` : '0%',
                  transition: 'height 0.7s ease',
                }} />
              </div>
              {ctxLabels[i] && <span style={{ fontSize: 7, color: 'var(--text-3)', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>{ctxLabels[i]}</span>}
            </div>
          ))}
          {context?.avg > 0 && <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 3, lineHeight: 1.2 }}>avg {fmtD(context.avg)}</span>}
          {context?.trend && context.trend !== 'stable' && (
            <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, color: context.trend === 'increasing' ? '#EF4444' : '#10B981' }}>
              {context.trend === 'increasing' ? '↑' : '↓'}
            </span>
          )}
          {isCurrentMonth && dailyAllow !== null && budgetVal > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'JetBrains Mono', color: remaining < 0 ? '#EF4444' : 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {remaining >= 0 ? `${fmtD(dailyAllow)}/day · ${daysLeft}d left` : `${fmtD(Math.abs(remaining))} over`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Multi: Budget cell ────────────────────────────────────────────────────────

function BudgetCell({ month, cat, actual, forecast, budgetVal, isPast, isCurrent, onChange }) {
  const hasActual = isPast || isCurrent
  const displayAmt = hasActual ? actual : forecast
  const hasBudget  = budgetVal > 0
  const overActual = hasActual && hasBudget && actual > budgetVal
  const overFc     = !hasActual && hasBudget && forecast > budgetVal * 1.05
  const underFc    = !hasActual && hasBudget && forecast < budgetVal * 0.8
  const pct        = hasBudget && displayAmt > 0 ? Math.round((displayAmt / budgetVal) * 100) : null

  const bgColor  = overActual ? 'rgba(239,68,68,0.07)' : overFc ? 'rgba(245,158,11,0.07)' : underFc ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.02)'
  const amtColor = overActual ? '#EF4444' : hasActual ? 'var(--text)' : overFc ? '#F59E0B' : 'var(--text-3)'
  const borderColor = overActual ? 'rgba(239,68,68,0.18)' : overFc ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)'

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 8, padding: '6px 8px', minWidth: 88, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: amtColor, lineHeight: 1 }}>
          {displayAmt > 0 ? fmtD(displayAmt) : '—'}
        </span>
        {pct !== null && (
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 600, color: overActual ? '#EF4444' : overFc ? '#F59E0B' : '#10B981', lineHeight: 1 }}>
            {pct}%
          </span>
        )}
      </div>
      <span style={{ fontSize: 8, color: 'var(--text-3)', lineHeight: 1 }}>
        {hasActual ? 'actual' : forecast > 0 ? 'forecast' : '—'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>$</span>
        <input
          type="number" min="0"
          value={budgetVal || ''}
          placeholder={forecast > 0 ? Math.round(forecast) : ''}
          onChange={e => onChange(month, cat, Number(e.target.value))}
          style={{
            width: '100%', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
            color: 'var(--text)', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5,
            padding: '2px 4px', outline: 'none', textAlign: 'right',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; e.target.style.background = 'rgba(99,102,241,0.06)'; e.target.select() }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(255,255,255,0.04)' }}
        />
      </div>
    </div>
  )
}

// ── Monthly: Loading skeleton ─────────────────────────────────────────────────

function MonthlySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="skeleton" style={{ height: 130, borderRadius: 14 }} />
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)' }}>
        {[1, 0.85, 0.7, 0.55, 0.4].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 36, borderRadius: 6, width: `${w * 100}%`, marginBottom: 10 }} />
        ))}
      </div>
    </div>
  )
}

// ── Multi: Loading skeleton ───────────────────────────────────────────────────

function MultiSkeleton({ periods }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {[1, 0.9, 0.8, 0.7].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 58, flex: 1, borderRadius: 10, opacity: w }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <div className="skeleton" style={{ height: 52, width: 118, borderRadius: 6, flexShrink: 0 }} />
            {[...Array(periods)].map((_, j) => (
              <div key={j} className="skeleton" style={{ height: 52, flex: 1, borderRadius: 8, opacity: 1 - j * 0.1 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Monthly view
// ══════════════════════════════════════════════════════════════════════════════

function MonthlyView({ month, months, registerSave }) {
  const { getColor, categories, addCategory } = useCategories()
  const [budgets, setBudgets]   = useState({})
  const [result, setResult]     = useState(null)
  const [context, setContext]   = useState(null)
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [copiedFrom, setCopiedFrom]     = useState('')
  const [showAnalysis, setShowAnalysis] = useState(true)
  const [addingCat, setAddingCat]       = useState(false)
  const [newCatName, setNewCatName]     = useState('')
  const [aiAnalysis, setAiAnalysis]         = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  const budgetsRef     = useRef(budgets)
  const saveTimer      = useRef(null)
  const activeMonthRef = useRef('')

  const isCurrentMonth = month === format(new Date(), 'yyyy-MM')
  const daysInMonth    = month ? getDaysInMonth(parseISO(month + '-01')) : 30
  const daysElapsed    = isCurrentMonth ? Math.min(new Date().getDate(), daysInMonth) : daysInMonth

  // ── Load fast data + AI in parallel ────────────────────────────────────────

  const loadData = useCallback(() => {
    if (!month) return
    activeMonthRef.current = month
    setLoading(true)
    setCopiedFrom('')
    setAiAnalysis(null)
    setAnalysisLoading(true)

    budgetApi.get(month, false).then(r => {
      setResult(r.data)
      const saved = r.data?.budget || {}
      if (Object.keys(saved).length > 0) {
        setBudgets(saved); budgetsRef.current = saved
      } else {
        budgetApi.get(prevMonth(month), false).then(pr => {
          const prevB = pr.data?.budget || {}
          if (Object.keys(prevB).length > 0) {
            setBudgets(prevB); budgetsRef.current = prevB; setCopiedFrom(prevMonth(month))
          } else {
            setBudgets({}); budgetsRef.current = {}
          }
        }).catch(() => { setBudgets({}); budgetsRef.current = {} })
      }
    }).finally(() => setLoading(false))

    const thisMonth = month
    budgetApi.analysis(thisMonth)
      .then(r => { if (activeMonthRef.current === thisMonth) setAiAnalysis(r.data?.analysis || null) })
      .catch(() => { if (activeMonthRef.current === thisMonth) setAiAnalysis(null) })
      .finally(() => { if (activeMonthRef.current === thisMonth) setAnalysisLoading(false) })
  }, [month])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!month) return
    budgetApi.context(month).then(r => setContext(r.data)).catch(() => setContext(null))
  }, [month])

  useEffect(() => {
    budgetApi.history().then(r => setHistory(r.data || [])).catch(() => {})
  }, [])

  // ── Register save function with parent ──────────────────────────────────────

  const doSave = useCallback(async () => {
    const toSave = Object.fromEntries(Object.entries(budgetsRef.current).filter(([, v]) => Number(v) > 0))
    await budgetApi.save({ month, budgets: toSave })
    toast.success('Budget saved!')
    setCopiedFrom('')
    budgetApi.get(month, false).then(r => setResult(r.data))
    setAiAnalysis(null)
    setAnalysisLoading(true)
    const thisMonth = month
    budgetApi.analysis(thisMonth)
      .then(r => { if (activeMonthRef.current === thisMonth) setAiAnalysis(r.data?.analysis || null) })
      .catch(() => { if (activeMonthRef.current === thisMonth) setAiAnalysis(null) })
      .finally(() => { if (activeMonthRef.current === thisMonth) setAnalysisLoading(false) })
  }, [month])

  useEffect(() => { registerSave(doSave) }, [registerSave, doSave])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleBudgetChange = (cat, val) => {
    const updated = { ...budgetsRef.current, [cat]: val }
    setBudgets(updated); budgetsRef.current = updated
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const toSave = Object.fromEntries(Object.entries(updated).filter(([, v]) => Number(v) > 0))
        await budgetApi.save({ month, budgets: toSave })
      } catch { /* silent auto-save fail */ }
    }, 1800)
  }

  const handleFillActuals = () => {
    const filled = {}
    Object.entries(actualMap).forEach(([cat, amt]) => { filled[cat] = Math.ceil(amt) })
    setBudgets(prev => { const u = { ...prev, ...filled }; budgetsRef.current = u; return u })
    toast.success("Filled from this month's actuals")
  }

  const handleSmartSuggest = () => {
    if (!context?.categories) return
    const suggested = {}
    Object.entries(context.categories).forEach(([cat, d]) => { if (d.suggested) suggested[cat] = Math.round(d.suggested) })
    setBudgets(prev => { const u = { ...prev, ...suggested }; budgetsRef.current = u; return u })
    toast.success('Smart suggestions applied — review and save')
  }

  const handleAddCat = () => {
    if (!addCategory(newCatName)) { toast.error('Already exists or empty'); return }
    setAddingCat(false); setNewCatName('')
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const actualMap     = result?.actual || {}
  const income        = result?.income || 0
  const totalBudgeted = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0)
  const totalActual   = Object.values(actualMap).reduce((s, v) => s + v, 0)
  const usagePct      = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0
  const netDelta      = totalBudgeted - totalActual

  const allCats = useMemo(() => {
    const set = new Set([...categories, ...Object.keys(actualMap), ...Object.keys(budgets)])
    return [...set].filter(c => c !== 'Income' && c !== 'Transfer')
  }, [categories, actualMap, budgets])

  const sortedCats = useMemo(() => [...allCats].sort((a, b) => {
    const aOver = (actualMap[a] || 0) > (Number(budgets[a]) || 0) && Number(budgets[a]) > 0
    const bOver = (actualMap[b] || 0) > (Number(budgets[b]) || 0) && Number(budgets[b]) > 0
    if (aOver !== bOver) return aOver ? -1 : 1
    return (actualMap[b] || 0) - (actualMap[a] || 0)
  }), [allCats, actualMap, budgets])

  const { grade, overCount, underCount } = useMemo(() => {
    const budgeted = sortedCats.filter(c => Number(budgets[c]) > 0)
    const over     = budgeted.filter(c => (actualMap[c] || 0) > Number(budgets[c]))
    const under    = budgeted.filter(c => (actualMap[c] || 0) <= Number(budgets[c]))
    const score    = budgeted.length > 0 ? under.length / budgeted.length * 100 : 0
    const g        = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D'
    return { grade: g, overCount: over.length, underCount: under.length }
  }, [sortedCats, actualMap, budgets])

  const ctxMonths = context?.months || []
  const getCatCtx = cat => {
    const d = context?.categories?.[cat]
    if (!d) return null
    return { ...d, months_short: ctxMonths.map(m => { try { return format(parseISO(m + '-01'), 'MMM') } catch { return m.slice(5) } }) }
  }

  const showAiPanel = totalBudgeted > 0 && (analysisLoading || !!aiAnalysis)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Action chips ── */}
      <ScrollFade delay={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {copiedFrom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 11, color: 'var(--brand)' }}>
              <Sparkles size={10} /> Pre-filled from <strong>{copiedFrom}</strong>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginLeft: copiedFrom ? 0 : 'auto', flexWrap: 'wrap' }}>
            {Object.keys(actualMap).length > 0 && (
              <button onClick={handleFillActuals}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9, fontSize: 11, fontWeight: 600, background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                <Zap size={11} /> Fill from actuals
              </button>
            )}
            {context?.categories && Object.keys(context.categories).length > 0 && (
              <button onClick={handleSmartSuggest}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9, fontSize: 11, fontWeight: 600, background: 'rgba(167,139,250,0.1)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.25)', cursor: 'pointer' }}>
                <Brain size={11} /> Smart suggest
              </button>
            )}
          </div>
        </div>
      </ScrollFade>

      {/* ── Hero card ── */}
      {loading ? <MonthlySkeleton /> : (
        <>
          {totalBudgeted > 0 && (
            <ScrollFade delay={30}>
              <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px 24px', border: '1px solid var(--border)', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.3)' }}>
                <div style={{ position: 'relative' }}>
                  <HealthRing pct={usagePct} grade={grade} />
                  <div style={{ position: 'absolute', top: 0, right: -4 }}>
                    <InfoTooltip
                      title="Budget health grade"
                      content="A = ≥90% of categories within budget. B = ≥70%. C = ≥50%. D = below 50%. Based on categories where you've set a target."
                      side="right"
                    />
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 10, minWidth: 220 }}>
                  {[
                    { label: 'Budgeted',       value: fmtD(totalBudgeted), color: 'var(--brand)',
                      tip: 'Total dollar amount set across all category budget targets for this month.' },
                    { label: 'Spent',          value: fmtD(totalActual),   color: usagePct > 100 ? '#EF4444' : 'var(--text)',
                      tip: 'Total actual spending recorded for this month across all tracked categories.' },
                    { label: netDelta >= 0 ? 'Remaining' : 'Over budget',
                      value: (netDelta >= 0 ? '+' : '−') + fmtD(Math.abs(netDelta)),
                      color: netDelta >= 0 ? '#10B981' : '#EF4444',
                      tip: 'How much of your total budget is left (green) or how much you\'ve exceeded it (red).' },
                    { label: 'Categories over', value: `${overCount} / ${overCount + underCount}`, color: overCount > 0 ? '#EF4444' : '#10B981',
                      tip: 'Categories where actual spending has exceeded the set budget target this month.' },
                    ...(income > 0 ? [{
                      label: 'Income left',
                      value: fmtD(income - totalActual),
                      color: income - totalActual > 0 ? '#10B981' : '#EF4444',
                      tip: 'Your registered monthly income minus total spending this month.',
                    }] : []),
                  ].map(({ label, value, color, tip }) => (
                    <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 14px', minWidth: 110, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                        <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                        <InfoTooltip content={tip} side="top" />
                      </div>
                      <p style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollFade>
          )}

          {/* ── Category rows ── */}
          <ScrollFade delay={50}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                    {month} · Monthly Budget
                  </span>
                  <InfoTooltip
                    title="Category Budgets"
                    content="Set spending limits per category. Click the $ input to edit. Auto-saves 1.8s after you stop typing. Mini bars show the last 3 months of actuals for context."
                    side="right"
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>click $ to edit · auto-saves</span>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', minWidth: 60, textAlign: 'right' }}>Spent</span>
                  <span style={{ width: 12 }} />
                  <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', width: 68, textAlign: 'right' }}>Budget</span>
                  <span style={{ width: 36 }} />
                </div>
              </div>

              {sortedCats.map((cat, idx) => (
                <CategoryRow key={cat} cat={cat} idx={idx}
                  budgetVal={Number(budgets[cat]) || 0}
                  actual={actualMap[cat] || 0}
                  context={getCatCtx(cat)}
                  color={getColor(cat)}
                  isCurrentMonth={isCurrentMonth}
                  daysElapsed={daysElapsed}
                  daysInMonth={daysInMonth}
                  onChange={handleBudgetChange}
                />
              ))}

              {addingCat ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    placeholder="New category name"
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
                  <button onClick={handleAddCat} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: 'var(--brand)', color: 'white', border: 'none', cursor: 'pointer' }}>Add</button>
                  <button onClick={() => { setAddingCat(false); setNewCatName('') }} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11, background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => setAddingCat(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 12, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--brand)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                  <Plus size={11} /> Add category
                </button>
              )}
            </div>
          </ScrollFade>

          {/* ── Budget History Chart ── */}
          {history.length >= 2 && (
            <ScrollFade delay={70}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)' }}>Budget History</p>
                  <InfoTooltip
                    title="Budget History"
                    content="6-month chart of total budgeted vs. actual spending. Red actual bars = over-budget months. Dashed line = total budget target for that month."
                    side="right"
                  />
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Last 6 months · bars = actual · dashed line = budget</p>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={history} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={42} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="totalBudgeted" name="Budget" fill="rgba(255,255,255,0.07)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="totalActual" name="Actual" radius={[3, 3, 0, 0]} maxBarSize={28}>
                      {history.map((h, i) => (
                        <Cell key={i} fill={h.hasBudget && h.totalActual > h.totalBudgeted ? 'rgba(239,68,68,0.65)' : 'rgba(99,102,241,0.65)'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="totalBudgeted" name="Budget line"
                      stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} legendType="none" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ScrollFade>
          )}

          {/* ── AI Analysis ── */}
          {showAiPanel && (
            <ScrollFade delay={85}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, border: `1px solid ${analysisLoading ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.22)'}`, overflow: 'hidden', transition: 'border-color 0.4s ease' }}>
                <button onClick={() => setShowAnalysis(v => !v)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Sparkles size={12} style={{ color: analysisLoading ? 'var(--text-3)' : 'var(--brand)', transition: 'color 0.3s' }} />
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: analysisLoading ? 'var(--text-3)' : 'var(--brand)', transition: 'color 0.3s' }}>
                      Fiana AI Analysis
                    </span>
                    {analysisLoading && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--text-3)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>thinking…</span>}
                    <InfoTooltip
                      content="AI analysis of your budget vs. actuals for this month. Runs asynchronously — the page loads instantly while Fiana thinks in the background."
                      side="right"
                    />
                  </div>
                  <ChevronDown size={14} style={{ color: 'var(--text-3)', transform: showAnalysis ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {showAnalysis && (
                  <div style={{ borderTop: '1px solid rgba(99,102,241,0.10)' }}>
                    {analysisLoading ? <ThinkingIndicator /> : aiAnalysis ? (
                      <div className="analysis-fade-in" style={{ padding: '0 20px 16px' }}>
                        <AiText content={aiAnalysis} compact />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </ScrollFade>
          )}
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Multi-month view
// ══════════════════════════════════════════════════════════════════════════════

function MultiView({ month, periods, registerSave }) {
  const { getColor } = useCategories()
  const [plan, setPlan]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [budgets, setBudgets] = useState({})
  const budgetsRef = useRef({})

  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const loadPlan = useCallback(() => {
    setLoading(true)
    setPlan(null)
    setBudgets({})
    budgetsRef.current = {}

    budgetApi.getMulti(month, periods)
      .then(r => {
        const data = r.data
        setPlan(data)
        const initial = {}
        const cats   = data.categories || {}
        const months = data.months || []
        months.forEach((m, mi) => {
          Object.entries(cats).forEach(([cat, d]) => {
            const val = (d.budget || [])[mi] || 0
            if (val > 0) initial[`${m}_${cat}`] = val
          })
        })
        setBudgets(initial)
        budgetsRef.current = initial
      })
      .catch(() => toast.error('Failed to load plan'))
      .finally(() => setLoading(false))
  }, [month, periods])

  useEffect(() => { loadPlan() }, [loadPlan])

  const handleCellChange = (m, cat, val) => {
    const key     = `${m}_${cat}`
    const updated = { ...budgetsRef.current, [key]: val }
    setBudgets(updated)
    budgetsRef.current = updated
  }

  const handleFillFromForecast = () => {
    if (!plan) return
    const filled = { ...budgetsRef.current }
    const cats   = plan.categories || {}
    const months = plan.months || []
    months.forEach((m, mi) => {
      Object.entries(cats).forEach(([cat, d]) => {
        const fc = (d.forecast || [])[mi] || 0
        if (fc > 0) filled[`${m}_${cat}`] = Math.ceil(fc)
      })
    })
    setBudgets(filled)
    budgetsRef.current = filled
    toast.success('Budget targets filled from ML forecast')
  }

  const doSave = useCallback(async () => {
    const payload = {}
    Object.entries(budgetsRef.current).forEach(([key, val]) => {
      if (!val || val <= 0) return
      const sep   = key.indexOf('_')
      const m     = key.slice(0, sep)
      const cat   = key.slice(sep + 1)
      if (!payload[m]) payload[m] = {}
      payload[m][cat] = val
    })
    await budgetApi.saveMulti({ months: payload })
    toast.success('6-month budgets saved!')
  }, [])

  useEffect(() => { registerSave(doSave) }, [registerSave, doSave])

  // ── Derived ─────────────────────────────────────────────────────────────────

  const planMonths = plan?.months    || []
  const categories = plan?.categories || {}
  const totals     = plan?.totals    || {}

  const sortedCats = useMemo(() => Object.keys(categories).sort((a, b) => {
    const aAct = (categories[a]?.actual || []).reduce((s, v) => s + v, 0)
    const bAct = (categories[b]?.actual || []).reduce((s, v) => s + v, 0)
    if (bAct !== aAct) return bAct - aAct
    return (categories[b]?.forecast || []).reduce((s, v) => s + v, 0) -
           (categories[a]?.forecast || []).reduce((s, v) => s + v, 0)
  }), [categories])

  const chartData = useMemo(() => planMonths.map((m, i) => {
    const budgTotal = sortedCats.reduce((s, cat) => s + (budgets[`${m}_${cat}`] || 0), 0)
    return {
      label:    moLabel(m),
      actual:   m <= today ? ((totals.actual  || [])[i] || 0) : null,
      forecast: (totals.forecast || [])[i] || 0,
      budget:   budgTotal || null,
      isPast:   m < today,
    }
  }), [planMonths, totals, budgets, today, sortedCats])

  const totalBudgeted = useMemo(() =>
    planMonths.reduce((s, m) => s + sortedCats.reduce((s2, cat) => s2 + (budgets[`${m}_${cat}`] || 0), 0), 0),
    [planMonths, sortedCats, budgets])

  const totalForecast = useMemo(() => (totals.forecast || []).reduce((s, v) => s + v, 0), [totals])
  const coverageCount = useMemo(() => planMonths.filter(m => sortedCats.some(cat => budgets[`${m}_${cat}`] > 0)).length, [planMonths, sortedCats, budgets])

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <MultiSkeleton periods={periods} />

  if (!plan) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Summary chips ── */}
      <ScrollFade delay={20}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Months planned', value: `${coverageCount} / ${planMonths.length}`, color: 'var(--brand)',
              tip: 'Number of months in the window where you\'ve set at least one budget target.' },
            { label: 'Total budgeted', value: totalBudgeted > 0 ? fmtD(totalBudgeted) : '—', color: 'var(--text)',
              tip: 'Sum of all budget targets you\'ve set across all months and categories.' },
            { label: `${periods}-mo forecast`, value: totalForecast > 0 ? fmtD(totalForecast) : '—', color: '#34d399',
              tip: 'ML model\'s total predicted spending across the window, based on your historical transaction patterns.' },
            ...(totalBudgeted > 0 && totalForecast > 0 ? [{
              label: totalBudgeted >= totalForecast ? 'Forecast covered' : 'Budget gap',
              value: (totalBudgeted >= totalForecast ? '+' : '−') + fmtD(Math.abs(totalBudgeted - totalForecast)),
              color: totalBudgeted >= totalForecast ? '#10B981' : '#EF4444',
              tip: 'Difference between your total budget targets and the ML forecast. Positive = budgeted more than forecast. Negative = uncovered spending.',
            }] : []),
          ].map(({ label, value, color, tip }) => (
            <div key={label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '10px 16px', border: '1px solid var(--border)', flex: '1 1 120px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                <InfoTooltip content={tip} side="top" />
              </div>
              <p style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
            </div>
          ))}
        </div>
      </ScrollFade>

      {/* ── Overview chart ── */}
      <ScrollFade delay={35}>
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)' }}>Spending Overview</p>
                <InfoTooltip
                  title="Spending Overview Chart"
                  content="Solid bars = actual spending (past months). Translucent bars = ML forecast. Amber dashed line = your budget targets. The chart updates as you edit targets."
                  side="right"
                />
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)' }}>bars = actual · shaded = forecast · line = budget target</p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {[
                { color: 'rgba(99,102,241,0.7)', label: 'Actual' },
                { color: 'rgba(52,211,153,0.35)', label: 'Forecast' },
                { color: '#f59e0b', label: 'Budget', dashed: true },
              ].map(({ color, label, dashed }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: dashed ? 18 : 10, height: dashed ? 0 : 10, background: dashed ? 'none' : color, borderRadius: dashed ? 0 : 2, borderTop: dashed ? `2px dashed ${color}` : 'none', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b729a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} maxBarSize={32}>
                {chartData.map((d, i) => <Cell key={i} fill={d.budget && d.actual > d.budget ? 'rgba(239,68,68,0.65)' : 'rgba(99,102,241,0.7)'} />)}
              </Bar>
              <Bar dataKey="forecast" name="Forecast" fill="rgba(52,211,153,0.22)" radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Line type="monotone" dataKey="budget" name="Budget" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: '#f59e0b', r: 3 }} activeDot={{ r: 5 }} connectNulls />
              {planMonths.includes(today) && (
                <ReferenceLine x={moLabel(today)} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3"
                  label={{ value: 'now', fill: '#6b729a', fontSize: 9, position: 'top' }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ScrollFade>

      {/* ── Category grid ── */}
      <ScrollFade delay={55}>
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-2)' }}>Per-Category Budget Targets</span>
              <InfoTooltip
                title="Category Budget Grid"
                content="Each cell shows actual (past months) or ML forecast (future months). The $ input below sets your budget target. Color coding: red = over budget, amber = forecast exceeds target, green = well under target."
                side="right"
              />
            </div>
            <button onClick={handleFillFromForecast}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)', cursor: 'pointer' }}>
              <TrendingUp size={11} /> Fill from forecast
            </button>
          </div>

          <div style={{ overflowX: 'auto', padding: '0 20px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px 4px 0', fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', width: 128 }}>Category</th>
                  {planMonths.map(m => {
                    const isPast = m < today, isCurr = m === today
                    return (
                      <th key={m} style={{ textAlign: 'center', padding: '6px 4px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 88 }}>
                        <span style={{ color: isCurr ? 'var(--brand)' : isPast ? 'var(--text-3)' : '#34d399' }}>{fmtMo(m)}</span>
                        <span style={{ display: 'block', fontSize: 7, color: 'var(--text-3)', marginTop: 1 }}>
                          {isCurr ? 'now' : isPast ? 'past' : 'forecast'}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedCats.map(cat => {
                  const catData = categories[cat] || {}
                  const color   = getColor(cat)
                  return (
                    <tr key={cat}>
                      <td style={{ paddingRight: 8, verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 108 }}>{cat}</span>
                        </div>
                      </td>
                      {planMonths.map((m, mi) => (
                        <td key={m} style={{ padding: '0 4px', verticalAlign: 'top' }}>
                          <BudgetCell
                            month={m} cat={cat}
                            actual={(catData.actual || [])[mi] || 0}
                            forecast={(catData.forecast || [])[mi] || 0}
                            budgetVal={budgets[`${m}_${cat}`] || 0}
                            isPast={m < today} isCurrent={m === today}
                            onChange={handleCellChange}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr>
                  <td style={{ paddingRight: 8, paddingTop: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, fontFamily: 'JetBrains Mono' }}>Total</span>
                  </td>
                  {planMonths.map((m, mi) => {
                    const budgTotal = sortedCats.reduce((s, cat) => s + (budgets[`${m}_${cat}`] || 0), 0)
                    const actTotal  = (totals.actual   || [])[mi] || 0
                    const fcTotal   = (totals.forecast || [])[mi] || 0
                    const isPast    = m <= today
                    const disp      = isPast ? actTotal : fcTotal
                    const over      = isPast && budgTotal > 0 && actTotal > budgTotal
                    return (
                      <td key={m} style={{ padding: '10px 4px 0', verticalAlign: 'top' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 800, color: over ? '#EF4444' : 'var(--text)', display: 'block', lineHeight: 1 }}>
                            {disp > 0 ? fmtD(disp) : '—'}
                          </span>
                          {budgTotal > 0 && <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>/ {fmtD(budgTotal)}</span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ScrollFade>

      {/* ── Legend ── */}
      <ScrollFade delay={70}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '2px 2px' }}>
          {[
            { color: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.18)', label: 'Actual over budget' },
            { color: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.15)', label: 'Forecast exceeds target' },
            { color: 'rgba(16,185,129,0.07)', border: 'rgba(255,255,255,0.05)', label: 'Forecast well under target' },
          ].map(({ color, border, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: color, border: `1px solid ${border}`, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</span>
            </div>
          ))}
        </div>
      </ScrollFade>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Main BudgetPage — tab shell + shared header + confirm dialog
// ══════════════════════════════════════════════════════════════════════════════

export default function BudgetPage() {
  const { months, endMonth } = useTimeFilter()
  const [tab, setTab]       = useState('monthly')   // 'monthly' | 'multi'
  const [month, setMonth]   = useState('')
  const [periods, setPeriods] = useState(6)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen]     = useState(false)
  const [confirmMsg, setConfirmMsg]       = useState('')
  const pendingSaveFn = useRef(null)

  // Each view registers its save function here via registerSave prop
  const monthlySaveFn = useRef(null)
  const multiSaveFn   = useRef(null)

  useEffect(() => { if (endMonth && !month) setMonth(endMonth) }, [endMonth])

  const handleSaveClick = () => {
    const fn = tab === 'monthly' ? monthlySaveFn.current : multiSaveFn.current
    if (!fn) return
    pendingSaveFn.current = fn

    const msg = tab === 'monthly'
      ? `Save budget targets for ${fmtMo(month)}? This will overwrite any existing targets for that month.`
      : `Save budget targets across ${periods} months? This will overwrite any existing targets for those months.`
    setConfirmMsg(msg)
    setConfirmOpen(true)
  }

  const handleSaveConfirm = async () => {
    setConfirmOpen(false)
    if (!pendingSaveFn.current) return
    setSaving(true)
    try {
      await pendingSaveFn.current()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      toast.error("Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Confirm dialog ── */}
      {confirmOpen && (
        <ConfirmDialog
          title={tab === 'monthly' ? 'Save budget?' : 'Save budget plan?'}
          message={confirmMsg}
          confirmLabel="Save"
          danger={false}
          onConfirm={handleSaveConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {/* ── Header ── */}
      <ScrollFade delay={0}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>

          {/* Title + tab toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.05em', color: 'var(--text)', lineHeight: 1 }}>
                Budget
              </h2>
              <InfoTooltip
                title="Budget Planner"
                content="Monthly view: track spending vs targets for one month with AI analysis. 6-Month Plan: set targets across 6 months using ML forecasts. Both tabs share the same month selector."
                side="right"
              />
            </div>

            {/* Tab pill toggle */}
            <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3, gap: 2 }}>
              {[
                { key: 'monthly', icon: Target,        label: 'Monthly' },
                { key: 'multi',   icon: CalendarRange, label: '6-Month Plan' },
              ].map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 9, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: tab === key ? (key === 'multi' ? 'rgba(52,211,153,0.15)' : 'rgba(91,155,255,0.15)') : 'transparent',
                    color: tab === key ? (key === 'multi' ? '#34d399' : 'var(--brand)') : 'var(--text-3)',
                    transition: 'all 0.18s ease',
                    boxShadow: tab === key ? `0 0 0 1px ${key === 'multi' ? 'rgba(52,211,153,0.3)' : 'rgba(91,155,255,0.3)'}` : 'none',
                  }}>
                  <Icon size={11} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {saving && <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>saving…</span>}
            {saved && !saving && (
              <span style={{ fontSize: 11, color: '#10B981', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={11} /> saved
              </span>
            )}

            {/* Periods toggle — only visible in multi tab */}
            {tab === 'multi' && (
              <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {[3, 6].map(p => (
                  <button key={p} onClick={() => setPeriods(p)}
                    style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: periods === p ? 'var(--brand)' : 'var(--surface)', color: periods === p ? 'white' : 'var(--text-3)', transition: 'all 0.15s' }}>
                    {p}mo
                  </button>
                ))}
              </div>
            )}

            {/* Month selector */}
            <select value={month} onChange={e => setMonth(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 9, fontSize: 11, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* Save button */}
            <button onClick={handleSaveClick} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: tab === 'multi' ? '#34d399' : 'var(--brand)', color: tab === 'multi' ? '#0a1a14' : 'white', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1, transition: 'all 0.18s' }}>
              <Save size={11} /> Save
            </button>
          </div>
        </div>
      </ScrollFade>

      {/* ── Tab content ── */}
      {month && (
        tab === 'monthly'
          ? <MonthlyView
              key={month}
              month={month}
              months={months}
              registerSave={fn => { monthlySaveFn.current = fn }}
            />
          : <MultiView
              key={`${month}_${periods}`}
              month={month}
              periods={periods}
              registerSave={fn => { multiSaveFn.current = fn }}
            />
      )}
    </div>
  )
}
