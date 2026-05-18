import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { Save, CalendarRange, TrendingUp, Check, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { budgetApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { useCategories } from '../hooks/useCategories'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtD  = v => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtK  = v => `$${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : Number(v).toFixed(0)}`
const fmtMo = m => { try { return format(parseISO(m + '-01'), 'MMM yy') } catch { return m } }

function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m) { try { return format(parseISO(m + '-01'), 'MMM') } catch { return m.slice(5) } }

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 26, width: 240, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 11, width: 160, borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton" style={{ height: 32, width: 110, borderRadius: 9 }} />
          <div className="skeleton" style={{ height: 32, width: 80, borderRadius: 9 }} />
          <div className="skeleton" style={{ height: 32, width: 90, borderRadius: 9 }} />
        </div>
      </div>
      {/* Overview chart skeleton */}
      <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
      {/* Grid skeleton */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 0.9, 0.8, 0.7, 0.6, 0.5].map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="skeleton" style={{ height: 52, width: 120, borderRadius: 6, flexShrink: 0 }} />
              {[...Array(6)].map((_, j) => (
                <div key={j} className="skeleton" style={{ height: 52, flex: 1, borderRadius: 8, opacity: 1 - j * 0.08 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Overview Chart Tooltip ────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0f1322', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', fontSize: 12, minWidth: 150 }}>
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

// ── Budget Cell ───────────────────────────────────────────────────────────────

function BudgetCell({ month, cat, actual, forecast, budgetVal, isPast, isCurrent, onChange }) {
  const hasActual   = isPast || isCurrent
  const displayAmt  = hasActual ? actual : forecast
  const hasBudget   = budgetVal > 0
  const overActual  = hasActual && hasBudget && actual > budgetVal
  const overFc      = !hasActual && hasBudget && forecast > budgetVal * 1.05
  const underFc     = !hasActual && hasBudget && forecast < budgetVal * 0.8
  const pct         = hasBudget && displayAmt > 0 ? Math.round((displayAmt / budgetVal) * 100) : null

  const bgColor = overActual  ? 'rgba(239,68,68,0.07)'
                : overFc      ? 'rgba(245,158,11,0.07)'
                : underFc     ? 'rgba(16,185,129,0.07)'
                : 'rgba(255,255,255,0.02)'

  const amtColor = overActual  ? '#EF4444'
                 : hasActual   ? 'var(--text)'
                 : overFc      ? '#F59E0B'
                 : 'var(--text-3)'

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${overActual ? 'rgba(239,68,68,0.18)' : overFc ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 8, padding: '6px 8px', minWidth: 90,
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      {/* Amount row */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: amtColor, lineHeight: 1 }}>
          {displayAmt > 0 ? fmtD(displayAmt) : '—'}
        </span>
        {pct !== null && (
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 600,
            color: overActual ? '#EF4444' : overFc ? '#F59E0B' : '#10B981', lineHeight: 1 }}>
            {pct}%
          </span>
        )}
      </div>
      {/* Label */}
      <span style={{ fontSize: 8, color: 'var(--text-3)', lineHeight: 1 }}>
        {hasActual ? 'actual' : forecast > 0 ? 'forecast' : '—'}
      </span>
      {/* Budget input */}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MultiMonthBudgetPage() {
  const { endMonth } = useTimeFilter()
  const { getColor } = useCategories()

  const [baseMonth, setBaseMonth]   = useState('')
  const [periods, setPeriods]       = useState(6)
  const [plan, setPlan]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)

  // budgets: { "2026-05_Food & Drink": 350 }
  const [budgets, setBudgets] = useState({})
  const budgetsRef = useRef({})

  // Derive base month: current month
  useEffect(() => {
    if (!baseMonth) {
      const now = new Date()
      setBaseMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    }
  }, [endMonth])

  const loadPlan = useCallback(() => {
    if (!baseMonth) return
    setLoading(true)
    setPlan(null)
    setBudgets({})
    budgetsRef.current = {}

    budgetApi.getMulti(baseMonth, periods)
      .then(r => {
        const data = r.data
        setPlan(data)
        // Pre-fill budgets from saved values
        const initial = {}
        const cats = data.categories || {}
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
  }, [baseMonth, periods])

  useEffect(() => { loadPlan() }, [loadPlan])

  const handleChange = (month, cat, val) => {
    const key = `${month}_${cat}`
    const updated = { ...budgetsRef.current, [key]: val }
    setBudgets(updated)
    budgetsRef.current = updated
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Build { months: { "2026-05": { "Food & Drink": 350 } } }
      const payload = {}
      Object.entries(budgetsRef.current).forEach(([key, val]) => {
        if (!val || val <= 0) return
        const sep = key.indexOf('_')
        const month = key.slice(0, sep)
        const cat   = key.slice(sep + 1)
        if (!payload[month]) payload[month] = {}
        payload[month][cat] = val
      })
      await budgetApi.saveMulti({ months: payload })
      toast.success('6-month budgets saved!')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      toast.error("Couldn't save budgets")
    } finally {
      setSaving(false)
    }
  }

  const handleFillFromForecast = () => {
    if (!plan) return
    const filled = { ...budgetsRef.current }
    const cats = plan.categories || {}
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

  // ── Derived ─────────────────────────────────────────────────────────────────

  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const planMonths  = plan?.months || []
  const categories  = plan?.categories || {}
  const totals      = plan?.totals || {}

  const sortedCats = useMemo(() => {
    const cats = Object.keys(categories)
    // Sort by total actual desc, then forecast desc
    return cats.sort((a, b) => {
      const aAct = (categories[a]?.actual || []).reduce((s, v) => s + v, 0)
      const bAct = (categories[b]?.actual || []).reduce((s, v) => s + v, 0)
      if (bAct !== aAct) return bAct - aAct
      const aFc = (categories[a]?.forecast || []).reduce((s, v) => s + v, 0)
      const bFc = (categories[b]?.forecast || []).reduce((s, v) => s + v, 0)
      return bFc - aFc
    })
  }, [categories])

  // Overview chart data: one entry per month
  const chartData = useMemo(() => planMonths.map((m, i) => {
    const budgTotal = sortedCats.reduce((s, cat) => s + (budgets[`${m}_${cat}`] || 0), 0)
    return {
      label: monthLabel(m),
      actual:   m <= today ? ((totals.actual  || [])[i] || 0) : null,
      forecast: (totals.forecast || [])[i] || 0,
      budget:   budgTotal || null,
      isPast:   m < today,
    }
  }), [planMonths, totals, budgets, today, sortedCats])

  // Month selector options: last 2 + next 10
  const monthOptions = useMemo(() => {
    const opts = []
    const now = new Date()
    let y = now.getFullYear(), mo = now.getMonth() - 1
    for (let i = 0; i < 12; i++) {
      if (mo < 1) { mo = 12; y-- }
      const m = `${y}-${String(mo).padStart(2, '0')}`
      if (i < 2) opts.unshift(m)
      else opts.push(m)
      mo++
    }
    return opts
  }, [])

  // Summary stats
  const totalBudgeted = useMemo(() =>
    planMonths.reduce((s, m) =>
      s + sortedCats.reduce((s2, cat) => s2 + (budgets[`${m}_${cat}`] || 0), 0), 0),
    [planMonths, sortedCats, budgets])

  const totalForecast = useMemo(() =>
    (totals.forecast || []).reduce((s, v) => s + v, 0), [totals])

  const coverageCount = useMemo(() =>
    planMonths.filter(m => sortedCats.some(cat => budgets[`${m}_${cat}`] > 0)).length,
    [planMonths, sortedCats, budgets])

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <ScrollFade delay={0}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.05em', color: 'var(--text)', lineHeight: 1 }}>
                6-Month Budget Planner
              </h2>
              <InfoTooltip
                title="6-Month Budget Planner"
                content="Set budget targets across up to 6 months at once. ML forecast is shown per cell — past months show real actuals, future months show forecast. Fill from forecast or type your own targets, then save all in one shot."
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              ML forecast · editable targets · one-shot save
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {saving && <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>saving…</span>}
            {saved && !saving && (
              <span style={{ fontSize: 11, color: '#10B981', fontFamily: 'JetBrains Mono', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={11} /> saved
              </span>
            )}

            {/* Periods toggle */}
            <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {[3, 6].map(p => (
                <button key={p} onClick={() => setPeriods(p)}
                  style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
                    background: periods === p ? 'var(--brand)' : 'var(--surface)',
                    color: periods === p ? 'white' : 'var(--text-3)',
                    transition: 'all 0.15s',
                  }}>
                  {p}mo
                </button>
              ))}
            </div>

            {/* Base month */}
            <select value={baseMonth} onChange={e => setBaseMonth(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 9, fontSize: 11, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
              {monthOptions.map(m => <option key={m} value={m}>{fmtMo(m)}</option>)}
            </select>

            <button onClick={loadPlan} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, fontSize: 11, fontWeight: 600, background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
              <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
            </button>

            <button onClick={handleSave} disabled={saving || loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: 'var(--brand)', color: 'white', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s' }}>
              <Save size={11} /> Save all
            </button>
          </div>
        </div>
      </ScrollFade>

      {loading ? <Skeleton /> : !plan ? null : (
        <>
          {/* ── Summary chips ── */}
          <ScrollFade delay={20}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Months planned', value: `${coverageCount} / ${planMonths.length}`, color: 'var(--brand)' },
                { label: 'Total budgeted', value: totalBudgeted > 0 ? fmtD(totalBudgeted) : '—', color: 'var(--text)' },
                { label: `${periods}-mo forecast`, value: totalForecast > 0 ? fmtD(totalForecast) : '—', color: '#34d399' },
                ...(totalBudgeted > 0 && totalForecast > 0 ? [{
                  label: totalBudgeted >= totalForecast ? 'Forecast covered' : 'Budget gap',
                  value: (totalBudgeted >= totalForecast ? '+' : '−') + fmtD(Math.abs(totalBudgeted - totalForecast)),
                  color: totalBudgeted >= totalForecast ? '#10B981' : '#EF4444',
                }] : []),
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '10px 16px', border: '1px solid var(--border)', flex: '1 1 120px' }}>
                  <p style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
                  <p style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
                </div>
              ))}
            </div>
          </ScrollFade>

          {/* ── Overview chart ── */}
          <ScrollFade delay={40}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                    Spending Overview
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    bars = actual · dashed = forecast · line = budget target
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {[
                    { color: 'rgba(99,102,241,0.7)', label: 'Actual' },
                    { color: 'rgba(52,211,153,0.5)', label: 'Forecast' },
                    { color: '#f59e0b', label: 'Budget', dashed: true },
                  ].map(({ color, label, dashed }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: dashed ? 18 : 10, height: dashed ? 2 : 10,
                        background: color, borderRadius: dashed ? 0 : 2,
                        borderTop: dashed ? `2px dashed ${color}` : 'none',
                        flexShrink: 0,
                      }} />
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
                  {/* Actual bars (past only) */}
                  <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} maxBarSize={32}>
                    {chartData.map((d, i) => (
                      <Cell key={i}
                        fill={d.budget && d.actual > d.budget
                          ? 'rgba(239,68,68,0.65)'
                          : 'rgba(99,102,241,0.7)'}
                      />
                    ))}
                  </Bar>
                  {/* Forecast bars (lighter, future) */}
                  <Bar dataKey="forecast" name="Forecast" fill="rgba(52,211,153,0.25)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  {/* Budget line */}
                  <Line type="monotone" dataKey="budget" name="Budget"
                    stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3"
                    dot={{ fill: '#f59e0b', r: 3 }} activeDot={{ r: 5 }} connectNulls />
                  {/* Today reference */}
                  {planMonths.includes(today) && (
                    <ReferenceLine x={monthLabel(today)} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" label={{ value: 'now', fill: '#6b729a', fontSize: 9, position: 'top' }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ScrollFade>

          {/* ── Category grid ── */}
          <ScrollFade delay={60}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>

              {/* Table header */}
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-2)' }}>
                  Per-Category Budget Targets
                </span>
                <button onClick={handleFillFromForecast}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)', cursor: 'pointer' }}>
                  <TrendingUp size={11} /> Fill from forecast
                </button>
              </div>

              {/* Scrollable grid */}
              <div style={{ overflowX: 'auto', padding: '0 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 8px 4px 0', fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', width: 130 }}>
                        Category
                      </th>
                      {planMonths.map(m => {
                        const isPast = m < today
                        const isCurr = m === today
                        return (
                          <th key={m} style={{ textAlign: 'center', padding: '6px 4px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 90 }}>
                            <span style={{ color: isCurr ? 'var(--brand)' : isPast ? 'var(--text-3)' : '#34d399' }}>
                              {fmtMo(m)}
                            </span>
                            {isCurr && (
                              <span style={{ display: 'block', fontSize: 7, color: 'var(--brand)', marginTop: 1 }}>now</span>
                            )}
                            {!isCurr && !isPast && (
                              <span style={{ display: 'block', fontSize: 7, color: 'var(--text-3)', marginTop: 1 }}>forecast</span>
                            )}
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
                          {/* Category label */}
                          <td style={{ paddingRight: 8, verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 112 }}>
                                {cat}
                              </span>
                            </div>
                          </td>
                          {/* Month cells */}
                          {planMonths.map((m, mi) => {
                            const actual   = (catData.actual   || [])[mi] || 0
                            const forecast = (catData.forecast || [])[mi] || 0
                            const budgetVal = budgets[`${m}_${cat}`] || 0
                            return (
                              <td key={m} style={{ padding: '0 4px', verticalAlign: 'top' }}>
                                <BudgetCell
                                  month={m} cat={cat}
                                  actual={actual} forecast={forecast}
                                  budgetVal={budgetVal}
                                  isPast={m < today} isCurrent={m === today}
                                  onChange={handleChange}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}

                    {/* Totals row */}
                    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ paddingRight: 8, paddingTop: 10 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, fontFamily: 'JetBrains Mono' }}>Total</span>
                      </td>
                      {planMonths.map((m, mi) => {
                        const budgTotal = sortedCats.reduce((s, cat) => s + (budgets[`${m}_${cat}`] || 0), 0)
                        const actTotal  = (totals.actual   || [])[mi] || 0
                        const fcTotal   = (totals.forecast || [])[mi] || 0
                        const isPast    = m < today || m === today
                        const disp      = isPast ? actTotal : fcTotal
                        const over      = isPast && budgTotal > 0 && actTotal > budgTotal
                        return (
                          <td key={m} style={{ padding: '10px 4px 0', verticalAlign: 'top' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 800, color: over ? '#EF4444' : 'var(--text)', display: 'block', lineHeight: 1 }}>
                                {disp > 0 ? fmtD(disp) : '—'}
                              </span>
                              {budgTotal > 0 && (
                                <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>
                                  / {fmtD(budgTotal)}
                                </span>
                              )}
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
          <ScrollFade delay={75}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '4px 2px' }}>
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
        </>
      )}

    </div>
  )
}
