import { useState, useEffect, useMemo } from 'react'
import { budgetApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { Sparkles, Zap, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import AiLoader from '../components/AiLoader'
import AiText from '../components/AiText'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell, LabelList,
} from 'recharts'

const DEFAULT_CATEGORIES = ['Food & Drink','Groceries','Transport','Shopping',
  'Entertainment','Healthcare','Utilities','Rent & Housing','Travel','Subscriptions']

const CATEGORY_COLORS = {
  'Food & Drink':'#6366F1','Groceries':'#8B5CF6','Transport':'#0EA5E9',
  'Shopping':'#F59E0B','Entertainment':'#10B981','Healthcare':'#EF4444',
  'Utilities':'#6B7280','Rent & Housing':'#84CC16','Travel':'#F97316',
  'Financial':'#64748B','Subscriptions':'#A78BFA','Personal Care':'#EC4899',
  'Other':'#94A3B8',
}

const fmtDollar = v =>
  `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const TOOLTIP_STYLE = {
  background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#F1F5F9', fontSize: 12,
}

function prevMonth(m) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function BudgetPage() {
  const { months, endMonth } = useTimeFilter()
  const [month, setMonth]       = useState('')
  const [budgets, setBudgets]   = useState({})
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [tab, setTab]           = useState('set')
  const [copiedFrom, setCopiedFrom] = useState('')   // non-empty = inputs pre-filled from prior month

  useEffect(() => {
    if (endMonth && !month) setMonth(endMonth)
  }, [endMonth])

  const loadBudgetData = () => {
    if (!month) return
    setLoading(true)
    setCopiedFrom('')
    budgetApi.get(month, tab === 'compare').then(r => {
      setResult(r.data)
      const saved = r.data?.budget || {}
      if (Object.keys(saved).length > 0) {
        setBudgets(saved)
      } else {
        // No budget saved for this month — try to pre-fill from previous month
        const prev = prevMonth(month)
        budgetApi.get(prev, false).then(pr => {
          const prevBudget = pr.data?.budget || {}
          if (Object.keys(prevBudget).length > 0) {
            setBudgets(prevBudget)
            setCopiedFrom(prev)
          } else {
            setBudgets({})
          }
        }).catch(() => setBudgets({}))
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadBudgetData() }, [tab, month])

  const saveBudgets = async () => {
    setSaving(true)
    try {
      await budgetApi.save({ month, budgets: Object.fromEntries(
        Object.entries(budgets).filter(([,v]) => v > 0)
      )})
      toast.success('Budget saved!')
      setCopiedFrom('')
      loadBudgetData()
    } catch { toast.error('Failed to save budget') }
    finally { setSaving(false) }
  }

  const actualMap  = result?.actual   || {}
  const budgetMap  = result?.budget   || {}
  const analysis   = result?.analysis || ''
  const income     = result?.income   || 0

  const totalBudgeted = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0)
  const totalActual   = Object.values(actualMap).reduce((s, v) => s + v, 0)
  const totalBudgetSaved = Object.values(budgetMap).reduce((s, v) => s + v, 0)

  // Categories in compare tab, sorted: over budget first, then by % desc
  const compareCategories = useMemo(() => {
    const cats = [...new Set([...Object.keys(budgetMap), ...Object.keys(actualMap)])]
    return cats
      .map(cat => {
        const b   = budgetMap[cat] || 0
        const a   = actualMap[cat] || 0
        const pct = b > 0 ? (a / b) * 100 : null
        return { cat, b, a, pct, over: b > 0 && a > b }
      })
      .sort((x, y) => {
        if (x.over !== y.over) return x.over ? -1 : 1
        return (y.pct ?? 0) - (x.pct ?? 0)
      })
  }, [budgetMap, actualMap])

  const overBudgetCount = compareCategories.filter(c => c.over).length
  const netDelta        = totalBudgetSaved - totalActual

  // Bar chart data
  const barData = compareCategories
    .filter(c => c.b > 0 || c.a > 0)
    .map(c => ({
      name: c.cat.length > 12 ? c.cat.slice(0, 12) + '…' : c.cat,
      Budget: c.b,
      Actual: c.a,
      over: c.over,
    }))

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Budget Tracker</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Set monthly budgets and track actuals</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5"
            style={{ background: 'var(--brand-light)', color: 'var(--brand)',
              border: '1px solid rgba(99,102,241,0.2)' }}>
            <Sparkles size={11} /> Finara AI
          </span>
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {[['set','Set budget'],['compare','vs Actual']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
            style={tab===t
              ? { background: 'var(--brand)', color: 'white' }
              : { color: 'var(--text-3)', background: 'transparent' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── SET TAB ──────────────────────────────────────────────────────── */}
      {tab === 'set' && (
        <div className="space-y-4">
          {/* Running total + income context */}
          {(totalActual > 0 || totalBudgeted > 0 || income > 0) && (
            <div className="flex gap-3 flex-wrap">
              {totalActual > 0 && (
                <div className="flex-1 min-w-[140px] px-4 py-3 rounded-xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Spent this month</p>
                  <p className="text-xl font-semibold mt-0.5"
                    style={{ color: totalBudgeted > 0 && totalActual > totalBudgeted ? '#f87171' : 'var(--text)' }}>
                    {fmtDollar(totalActual)}
                  </p>
                </div>
              )}
              {totalBudgeted > 0 && (
                <div className="flex-1 min-w-[140px] px-4 py-3 rounded-xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Total budgeted</p>
                  <p className="text-xl font-semibold mt-0.5" style={{ color: 'var(--brand)' }}>
                    {fmtDollar(totalBudgeted)}
                  </p>
                </div>
              )}
              {income > 0 && (
                <div className="flex-1 min-w-[140px] px-4 py-3 rounded-xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Monthly income</p>
                  <p className="text-xl font-semibold mt-0.5" style={{ color: '#4ade80' }}>
                    {fmtDollar(income)}
                  </p>
                </div>
              )}
              {totalBudgeted > 0 && totalActual > 0 && (() => {
                const rem = totalBudgeted - totalActual
                const over = rem < 0
                return (
                  <div className="flex-1 min-w-[140px] px-4 py-3 rounded-xl"
                    style={{
                      background: over ? 'rgba(239,68,68,0.06)' : 'rgba(74,222,128,0.06)',
                      border: `1px solid ${over ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`,
                    }}>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {over ? 'Over budget' : 'Remaining'}
                    </p>
                    <p className="text-xl font-semibold mt-0.5" style={{ color: over ? '#f87171' : '#4ade80' }}>
                      {over ? '−' : '+'}{fmtDollar(Math.abs(rem))}
                    </p>
                  </div>
                )
              })()}
              {totalBudgeted > 0 && income > 0 && (
                <div className="flex-1 min-w-[140px] px-4 py-3 rounded-xl"
                  style={{
                    background: totalBudgeted > income ? 'rgba(239,68,68,0.06)' : 'rgba(74,222,128,0.06)',
                    border: `1px solid ${totalBudgeted > income ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`,
                  }}>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Budget vs income</p>
                  <p className="text-xl font-semibold mt-0.5"
                    style={{ color: totalBudgeted > income ? '#f87171' : '#4ade80' }}>
                    {totalBudgeted > income ? '−' : '+'}{fmtDollar(Math.abs(income - totalBudgeted))}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="card space-y-1">
            {copiedFrom && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-xs"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                  color: 'var(--brand)' }}>
                <Sparkles size={11} />
                Pre-filled from your <strong>{copiedFrom}</strong> budget — adjust and save to lock in this month.
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Monthly budget for {month}
              </h3>
              {Object.keys(actualMap).length > 0 && (
                <button
                  onClick={() => {
                    const filled = {}
                    DEFAULT_CATEGORIES.forEach(cat => {
                      if (actualMap[cat]) filled[cat] = Math.ceil(actualMap[cat])
                    })
                    setBudgets(p => ({ ...p, ...filled }))
                    toast.success('Filled from this month\'s actuals')
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: 'var(--brand-light)', color: 'var(--brand)',
                    border: '1px solid rgba(99,102,241,0.2)' }}>
                  <Zap size={11} /> Fill from actuals
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {DEFAULT_CATEGORIES.map(cat => {
                const actual  = actualMap[cat]
                const color   = CATEGORY_COLORS[cat] || '#94A3B8'
                const bVal    = Number(budgets[cat]) || 0
                const over    = actual && bVal > 0 && actual > bVal
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: 'var(--text-2)' }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: color }} />
                        {cat}
                      </label>
                      {actual != null && (
                        <span className="text-xs" style={{ color: over ? '#f87171' : 'var(--text-3)' }}>
                          spent {fmtDollar(actual)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center">
                      <span className="px-3 py-2 rounded-l-lg text-sm font-medium"
                        style={{ background: 'var(--bg)', color: 'var(--text-3)',
                          border: '1px solid var(--border)', borderRight: 'none' }}>
                        $
                      </span>
                      <input type="number" min="0" placeholder={actual ? Math.ceil(actual) : '0'}
                        value={budgets[cat] || ''}
                        onChange={e => setBudgets(p => ({ ...p, [cat]: Number(e.target.value) }))}
                        className="flex-1 px-3 py-2 rounded-r-lg text-sm outline-none"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
                          color: 'var(--text)',
                          borderColor: over ? 'rgba(239,68,68,0.4)' : 'var(--border)' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <button onClick={saveBudgets} disabled={saving} className="btn-primary mt-4 w-full">
              {saving ? 'Saving…' : 'Save budget'}
            </button>
          </div>
        </div>
      )}

      {/* ── COMPARE TAB ──────────────────────────────────────────────────── */}
      {tab === 'compare' && (
        <div className="space-y-4">
          {loading ? (
            <AiLoader type="budget" title="Budget Analysis" compact />
          ) : (
            <>
              {/* Summary stats */}
              {totalBudgetSaved > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    {
                      label: 'Total budgeted',
                      value: fmtDollar(totalBudgetSaved),
                      color: 'var(--brand)',
                      icon: null,
                    },
                    {
                      label: 'Total spent',
                      value: fmtDollar(totalActual),
                      color: totalActual > totalBudgetSaved ? '#f87171' : 'var(--text)',
                      icon: null,
                    },
                    {
                      label: netDelta >= 0 ? 'Under budget by' : 'Over budget by',
                      value: fmtDollar(Math.abs(netDelta)),
                      color: netDelta >= 0 ? '#4ade80' : '#f87171',
                      icon: netDelta >= 0
                        ? <CheckCircle size={13} style={{ color: '#4ade80' }} />
                        : <AlertTriangle size={13} style={{ color: '#f87171' }} />,
                    },
                    {
                      label: 'Categories over',
                      value: `${overBudgetCount} of ${compareCategories.filter(c => c.b > 0).length}`,
                      color: overBudgetCount > 0 ? '#f87171' : '#4ade80',
                      icon: overBudgetCount > 0
                        ? <TrendingUp size={13} style={{ color: '#f87171' }} />
                        : <TrendingDown size={13} style={{ color: '#4ade80' }} />,
                    },
                  ].map(({ label, value, color, icon }) => (
                    <div key={label} className="px-4 py-3 rounded-xl"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                        {icon}{label}
                      </p>
                      <p className="text-lg font-semibold mt-0.5" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* AI analysis */}
              {analysis && (
                <div className="card" style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'var(--brand-light)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-1 h-4 rounded-full" style={{ background: 'var(--brand)' }} />
                    <p className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>Finara analysis</p>
                  </div>
                  <AiText content={analysis} compact />
                </div>
              )}

              {compareCategories.length === 0 ? (
                <div className="card text-center py-10">
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>No budget data for {month}</p>
                </div>
              ) : (
                <>
                  {/* Progress bars — sorted, over budget first */}
                  <div className="card">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
                      Budget vs Actual
                    </h3>
                    <div className="space-y-4">
                      {compareCategories.map(({ cat, b, a, pct, over }) => {
                        const color   = CATEGORY_COLORS[cat] || '#94A3B8'
                        const barPct  = b > 0 ? Math.min((a / b) * 100, 100) : 0
                        const noB     = b === 0
                        return (
                          <div key={cat}>
                            <div className="flex justify-between items-center mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: color }} />
                                <span className="text-sm" style={{ color: 'var(--text-2)' }}>{cat}</span>
                                {over && (
                                  <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                                    over
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                {pct !== null && (
                                  <span style={{ color: over ? '#f87171' : 'var(--text-3)' }}>
                                    {pct.toFixed(0)}%
                                  </span>
                                )}
                                <span className="font-mono font-medium"
                                  style={{ color: over ? '#f87171' : noB ? 'var(--text-2)' : '#4ade80' }}>
                                  {fmtDollar(a)}
                                </span>
                                {b > 0 && (
                                  <span style={{ color: 'var(--text-3)' }}>/ {fmtDollar(b)}</span>
                                )}
                              </div>
                            </div>
                            {b > 0 ? (
                              <div className="h-2 rounded-full overflow-hidden"
                                style={{ background: 'var(--border)' }}>
                                <div className="h-2 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${barPct}%`,
                                    background: over
                                      ? 'linear-gradient(90deg,#f87171,#ef4444)'
                                      : `linear-gradient(90deg,${color}bb,${color})`,
                                  }} />
                              </div>
                            ) : (
                              <div className="h-2 rounded-full"
                                style={{ background: 'var(--border)' }}>
                                <div className="h-2 w-full rounded-full opacity-30"
                                  style={{ background: color }} />
                              </div>
                            )}
                            {b > 0 && over && (
                              <p className="text-xs mt-1" style={{ color: '#f87171' }}>
                                {fmtDollar(a - b)} over budget
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Grouped bar chart */}
                  {barData.length > 0 && (
                    <div className="card">
                      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                        Budget vs Actual — side by side
                      </h3>
                      <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                        Grey = budget, colour = actual
                      </p>
                      <ResponsiveContainer width="100%"
                        height={Math.max(220, barData.length * 40 + 60)}>
                        <BarChart data={barData} layout="vertical"
                          margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
                          <XAxis type="number" tick={{ fill: '#8c909f', fontSize: 11 }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
                          <YAxis type="category" dataKey="name"
                            tick={{ fill: '#94A3B8', fontSize: 11 }}
                            width={108} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            itemStyle={{ color: '#F1F5F9' }}
                            labelStyle={{ color: '#94A3B8', marginBottom: 4 }}
                            formatter={v => fmtDollar(v)} />
                          <Legend wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
                          <Bar dataKey="Budget" fill="#334155" radius={[0,3,3,0]} maxBarSize={14} />
                          <Bar dataKey="Actual" radius={[0,3,3,0]} maxBarSize={14}>
                            {barData.map((entry, i) => (
                              <Cell key={i}
                                fill={entry.over ? '#ef4444' : (CATEGORY_COLORS[
                                  compareCategories[i]?.cat] || '#6366F1')}
                                fillOpacity={0.85} />
                            ))}
                            <LabelList dataKey="Actual" position="right"
                              style={{ fill: '#94A3B8', fontSize: 10 }}
                              formatter={v => v > 0 ? fmtDollar(v) : ''} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
