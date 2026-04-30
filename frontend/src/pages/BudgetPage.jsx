import { useState, useEffect } from 'react'
import { budgetApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import AiLoader from '../components/AiLoader'

const DEFAULT_CATEGORIES = ['Food & Drink','Groceries','Transport','Shopping',
  'Entertainment','Healthcare','Utilities','Rent & Housing','Travel','Subscriptions']

const CATEGORY_COLORS = {
  'Food & Drink':'#6366F1','Groceries':'#8B5CF6','Transport':'#0EA5E9',
  'Shopping':'#F59E0B','Entertainment':'#10B981','Healthcare':'#EF4444',
  'Utilities':'#6366F1','Rent & Housing':'#84CC16','Travel':'#F97316',
  'Financial':'#64748B','Subscriptions':'#A78BFA','Personal Care':'#EC4899',
}

export default function BudgetPage() {
  const { months, endMonth } = useTimeFilter()
  const [month, setMonth]     = useState('')
  const [budgets, setBudgets] = useState({})
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [tab, setTab]         = useState('set')

  // Sync with global filter's end month when it first loads
  useEffect(() => {
    if (endMonth && !month) setMonth(endMonth)
  }, [endMonth])

  const loadBudgetData = () => {
    if (!month) return
    setLoading(true)
    const includeAnalysis = tab === 'compare'
    budgetApi.get(month, includeAnalysis).then(r => {
      setResult(r.data)
      setBudgets(r.data?.budget || {})
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
    } catch { toast.error('Failed to save budget') }
    finally { setSaving(false) }
  }

  const actualMap = result?.actual  || {}
  const budgetMap = result?.budget  || {}
  const analysis  = result?.analysis || ''

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Budget Tracker</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Set monthly budgets and track actuals</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 flex-shrink-0"
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

      <div className="flex gap-1 p-1 rounded-lg w-fit"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {[['set','Set budget'],['compare','vs Actual']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
            style={tab===t ? { background: 'var(--brand)', color: 'white' } : { color: 'var(--text-3)', background: 'transparent' }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'set' && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Monthly budget for {month}</h3>
          <div className="grid grid-cols-2 gap-3">
            {DEFAULT_CATEGORIES.map(cat => (
              <div key={cat}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{cat}</label>
                <div className="flex items-center">
                  <span className="px-3 py-2 rounded-l-lg text-sm font-medium"
                    style={{ background: 'var(--bg)', color: 'var(--text-3)',
                      border: '1px solid var(--border)', borderRight: 'none' }}>
                    $
                  </span>
                  <input type="number" min="0" placeholder="0"
                    value={budgets[cat] || ''}
                    onChange={e => setBudgets(p => ({ ...p, [cat]: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 rounded-r-lg text-sm outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              </div>
            ))}
          </div>
          <button onClick={saveBudgets} disabled={saving} className="btn-primary mt-2">
            {saving ? 'Saving…' : 'Save budget'}
          </button>
        </div>
      )}

      {tab === 'compare' && (
        <div className="space-y-4">
          {analysis && (
            <div className="card" style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'var(--brand-light)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-1 h-4 rounded-full" style={{ background: 'var(--brand)' }} />
                <p className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>Finara analysis</p>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{analysis}</p>
            </div>
          )}

          {loading ? (
            <AiLoader type="budget" title="Budget Analysis" compact />
          ) : (
            <div className="card">
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Budget vs Actual</h3>
              {[...new Set([...Object.keys(budgetMap), ...Object.keys(actualMap)])].length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>
                  No budget data for {month}
                </p>
              ) : (
                <div className="space-y-4">
                  {[...new Set([...Object.keys(budgetMap), ...Object.keys(actualMap)])].map(cat => {
                    const b   = budgetMap[cat] || 0
                    const a   = actualMap[cat] || 0
                    const pct = b > 0 ? Math.min((a / b) * 100, 100) : 0
                    const over = a > b && b > 0
                    const color = CATEGORY_COLORS[cat] || '#94A3B8'
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span style={{ color: 'var(--text-2)' }}>{cat}</span>
                          <span>
                            <span className="font-mono font-medium"
                              style={{ color: over ? '#DC2626' : '#059669' }}>
                              ${a.toFixed(0)}
                            </span>
                            {b > 0 && (
                              <span style={{ color: 'var(--text-3)' }}> / ${b.toFixed(0)}</span>
                            )}
                          </span>
                        </div>
                        {b > 0 && (
                          <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                            <div className="h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: over ? '#EF4444' : color }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
