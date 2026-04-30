import { useState, useEffect } from 'react'
import { aiApi, budgetApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { PiggyBank, CheckCircle, XCircle, Sparkles, TrendingDown, ChevronDown, Save } from 'lucide-react'
import AiText from '../components/AiText'
import AiLoader from '../components/AiLoader'
import toast from 'react-hot-toast'

const inputStyle = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)',
}

export default function SavingsPage() {
  const { months, startMonth, endMonth } = useTimeFilter()
  const [form, setForm]             = useState({ goalAmount: '', timeframeMonths: 3 })
  const [check, setCheck]           = useState(null)
  const [plan, setPlan]             = useState(null)
  const [loadingCheck, setLoadingCheck] = useState(false)
  const [loadingPlan, setLoadingPlan]   = useState(false)
  const [savingBudget, setSavingBudget] = useState(false)
  const [saveMonth, setSaveMonth]       = useState('')

  useEffect(() => {
    if (months.length > 0 && !saveMonth) setSaveMonth(months[0])
  }, [months])

  const payload = () => ({ ...form, startMonth, endMonth })

  const realityCheck = async () => {
    if (!form.goalAmount) return
    setLoadingCheck(true)
    setCheck(null); setPlan(null)
    try {
      const { data } = await aiApi.realityCheck(payload())
      setCheck(data)
    } catch { toast.error('Check failed. Is Finara AI running?') }
    finally { setLoadingCheck(false) }
  }

  const generatePlan = async () => {
    setLoadingPlan(true)
    try {
      const { data } = await aiApi.savingsPlan(payload())
      setPlan(data)
    } catch { toast.error('Plan failed. Is Finara AI running?') }
    finally { setLoadingPlan(false) }
  }

  const savePlan = async () => {
    if (!saveMonth) return
    setSavingBudget(true)
    try {
      // Use all_budgets (every category) when available, fall back to cuts only
      const budgets = plan.all_budgets
        ? Object.fromEntries(Object.entries(plan.all_budgets).map(([k, v]) => [k, parseFloat(v.toFixed(2))]))
        : Object.fromEntries((plan.cuts || []).filter(c => c.category).map(c => [c.category, parseFloat(c.target_monthly.toFixed(2))]))
      await budgetApi.save({ month: saveMonth, budgets })
      toast.success(`Budget saved for ${saveMonth} — ${Object.keys(budgets).length} categories`)
    } catch {
      toast.error('Failed to save budget')
    } finally { setSavingBudget(false) }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Savings Planner</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Set a goal — Finara checks if it's realistic and builds a plan
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 flex-shrink-0"
          style={{ background: 'var(--brand-light)', color: 'var(--brand)',
            border: '1px solid rgba(99,102,241,0.2)' }}>
          <Sparkles size={11} /> Finara AI
        </span>
      </div>

      <div className="card space-y-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Your savings goal</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>I want to save ($)</label>
            <input type="number" min="1" placeholder="500"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={inputStyle}
              value={form.goalAmount} onChange={e => f('goalAmount', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>In how many months?</label>
            <div className="relative">
              <select value={form.timeframeMonths} onChange={e => f('timeframeMonths', Number(e.target.value))}
                className="w-full px-4 py-2.5 pr-9 rounded-xl text-sm outline-none appearance-none"
                style={inputStyle}>
                {[1,2,3,6,12].map(n => <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-3)' }} />
            </div>
          </div>
        </div>


        <div className="flex gap-3 pt-1">
          <button onClick={realityCheck} disabled={loadingCheck || !form.goalAmount}
            className="btn-primary flex items-center gap-2">
            {loadingCheck ? 'Checking…' : <><CheckCircle size={15} /> Reality check</>}
          </button>
          <button onClick={generatePlan} disabled={loadingPlan || !form.goalAmount}
            className="btn-ghost flex items-center gap-2">
            {loadingPlan ? 'Building plan…' : <><Sparkles size={15} /> Build savings plan</>}
          </button>
        </div>
      </div>

      {loadingCheck && <AiLoader type="reality" title="Reality Check" />}

      {!loadingCheck && check && (
        <div className="card">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: check.is_realistic ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
              {check.is_realistic
                ? <CheckCircle size={18} style={{ color: '#34d399' }} />
                : <XCircle size={18} style={{ color: '#f87171' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold mb-3" style={{ color: 'var(--text)' }}>
                {check.is_realistic ? 'Goal is achievable!' : 'Goal may be difficult to reach'}
              </p>

              <AiText content={check.analysis} compact />

              {!check.is_realistic && (
                <div className="mt-4 p-3 rounded-xl space-y-2"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-3)' }}>Finara suggests</p>

                  {check.needed_monthly_cut != null ? (
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                      Cut spending by{' '}
                      <strong style={{ color: '#f87171' }}>${check.needed_monthly_cut.toFixed(0)}/mo</strong>
                      {' '}to break even and reach your goal
                    </p>
                  ) : (
                    <>
                      {check.suggested_target != null && (
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                          Realistic target in {form.timeframeMonths} months:{' '}
                          <strong style={{ color: 'var(--text)' }}>${check.suggested_target.toFixed(0)}</strong>
                        </p>
                      )}
                      {check.suggested_months != null && (
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                          Months needed for ${form.goalAmount}:{' '}
                          <strong style={{ color: 'var(--text)' }}>{check.suggested_months} months</strong>
                        </p>
                      )}
                    </>
                  )}

                  {check.biggest_opportunity && (
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                      Best category to cut:{' '}
                      <strong style={{ color: 'var(--text)' }}>{check.biggest_opportunity}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loadingPlan && <AiLoader type="savings" title="Savings Plan" />}

      {!loadingPlan && plan && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--brand-light)' }}>
              <PiggyBank size={16} style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Your savings plan</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Finara · powered by Gemma 3</p>
            </div>
          </div>

          <div className="h-px mb-5" style={{ background: 'var(--border)' }} />

          {plan.plan && <AiText content={plan.plan} />}

          {plan.cuts?.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={14} style={{ color: '#34d399' }} />
                <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Recommended cuts
                </h4>
              </div>
              <div className="space-y-2">
                {plan.cuts.map((cut, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 rounded-xl"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div className="min-w-0 mr-4">
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{cut.category}</p>
                      {cut.tip && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>{cut.tip}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold" style={{ color: '#34d399' }}>
                        −${cut.monthly_savings?.toFixed(0)}/mo
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                        ${cut.current_monthly?.toFixed(0)} → ${cut.target_monthly?.toFixed(0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {plan.total_monthly_savings != null && (
                <div className="mt-3 flex items-center justify-between px-3.5 py-3 rounded-xl"
                  style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <span className="text-sm font-medium" style={{ color: '#34d399' }}>Total monthly savings</span>
                  <span className="text-sm font-bold" style={{ color: '#34d399' }}>
                    ${plan.total_monthly_savings?.toFixed(0)}/mo
                  </span>
                </div>
              )}

              <div className="mt-4 pt-4 flex items-center gap-3 flex-wrap"
                style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>Apply as budget for:</p>
                <div className="relative flex-shrink-0">
                  <select value={saveMonth} onChange={e => setSaveMonth(e.target.value)}
                    className="px-3 py-1.5 pr-7 rounded-lg text-xs outline-none appearance-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-3)' }} />
                </div>
                <button onClick={savePlan} disabled={savingBudget}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex-shrink-0"
                  style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399',
                    border: '1px solid rgba(16,185,129,0.25)',
                    opacity: savingBudget ? 0.6 : 1 }}>
                  <Save size={12} />
                  {savingBudget ? 'Saving…' : 'Save Plan'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
