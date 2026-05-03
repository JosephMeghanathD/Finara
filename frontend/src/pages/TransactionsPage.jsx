import React, { useState, useEffect } from 'react'
import { txnApi, aiApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts'
import { ArrowDownRight, ArrowUpRight, HelpCircle, AlertTriangle, Info, Flag, FlagOff, Pencil, Trash2, Plus, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import AiText from '../components/AiText'
import AiLoader, { FianaApiLoader } from '../components/AiLoader'
import RangeForecastCard from '../components/RangeForecastCard'
import ConfirmDialog from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useCategories } from '../hooks/useCategories'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

const EMPTY_FORM = { description: '', amount: '', transactionDate: '', transactionType: 'DEBIT', category: '' }

function fmtAmt(n) { return Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) }

function TxnModal({ txn, onClose, onSaved }) {
  const editing = !!txn?.id
  const [form, setForm] = React.useState(
    editing
      ? { description: txn.description, amount: txn.amount, transactionDate: txn.transactionDate, transactionType: txn.transactionType || 'DEBIT', category: txn.category || '' }
      : { ...EMPTY_FORM, transactionDate: new Date().toISOString().slice(0,10) }
  )
  const [saving, setSaving] = React.useState(false)
  const { categories, addCategory } = useCategories()
  const [addingCat, setAddingCat]   = React.useState(false)
  const [newCatName, setNewCatName] = React.useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAddCat = () => {
    if (!addCategory(newCatName)) {
      toast.error('Category already exists or name is empty'); return
    }
    set('category', newCatName.trim())
    setAddingCat(false); setNewCatName('')
  }

  const save = async () => {
    if (!form.description.trim() || !form.amount || !form.transactionDate) {
      toast.error('Description, amount and date are required'); return
    }
    setSaving(true)
    try {
      if (editing) await txnApi.update(txn.id, form)
      else         await txnApi.create(form)
      toast.success(editing ? 'Transaction updated' : 'Transaction added')
      onSaved()
    } catch { toast.error('Failed to save transaction') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>
            {editing ? 'Edit Transaction' : 'Add Transaction'}
          </h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-3)' }} /></button>
        </div>

        {[
          { label: 'Description', key: 'description', type: 'text', placeholder: 'e.g. Starbucks' },
          { label: 'Amount ($)', key: 'amount', type: 'number', placeholder: '0.00' },
          { label: 'Date', key: 'transactionDate', type: 'date' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</label>
            <input type={type} value={form[key]} placeholder={placeholder}
              onChange={e => set(key, e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Type</label>
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {['DEBIT','CREDIT'].map(t => (
                <button key={t} onClick={() => set('transactionType', t)}
                  className="flex-1 py-2 text-xs font-medium transition-all"
                  style={form.transactionType === t
                    ? { background: t === 'DEBIT' ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)', color: t === 'DEBIT' ? '#f87171' : '#34d399' }
                    : { background: 'transparent', color: 'var(--text-3)' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Category</label>
            <select value={addingCat ? '' : form.category} onChange={e => {
              if (e.target.value === '__add__') { setAddingCat(true); return }
              set('category', e.target.value)
            }}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="">Uncategorized</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__add__">＋ Add new category…</option>
            </select>
          </div>
        </div>

        {addingCat && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="New category name"
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
            />
            <button onClick={handleAddCat}
              className="px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'var(--brand)', color: 'white' }}>Add</button>
            <button onClick={() => { setAddingCat(false); setNewCatName('') }}
              className="w-9 flex items-center justify-center rounded-xl"
              style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="flex-1 btn-primary py-2.5 rounded-xl text-sm font-medium">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}

const TOOLTIP_STYLE = {
  background:'#1E293B', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8,
  color:'#F1F5F9', fontSize:12, boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
}

export default function TransactionsPage() {
  const { startDate, endDate, startMonth, endMonth } = useTimeFilter()
  const { getColor } = useCategories()
  const [txns, setTxns]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [explaining, setExplaining]       = useState(null)
  const [explanations, setExplanations]   = useState({})
  const [merchantCache, setMerchantCache] = useState({})
  const [merchantLoading, setMerchantLoading] = useState(null)
  const [openMerchant, setOpenMerchant]   = useState(null)
  const [modalOpen, setModalOpen]         = useState(false)
  const [editingTxn, setEditingTxn]       = useState(null)
  const [togglingAnomaly, setTogglingAnomaly] = useState(null)
  const [confirmTxn, setConfirmTxn]       = useState(null)

  useEffect(() => {
    if (!startDate || !endDate) return
    setLoading(true); setTxns([])
    txnApi.list(startDate, endDate).then(r => setTxns(r.data)).finally(() => setLoading(false))
  }, [startDate, endDate])

  const explainMerchantFor = async (txn) => {
    if (openMerchant === txn.id) { setOpenMerchant(null); return }
    setOpenMerchant(txn.id)
    const key = txn.description
    if (merchantCache[key]) return
    setMerchantLoading(key)
    try {
      const { data } = await aiApi.explainMerchant(key)
      setMerchantCache(prev => ({ ...prev, [key]: data }))
    } catch { toast.error("Fiana couldn't place that merchant — try again"); setOpenMerchant(null) }
    finally { setMerchantLoading(null) }
  }

  const explainTxn = async (txn) => {
    if (explanations[txn.id]) {
      setExplanations(prev => { const n = {...prev}; delete n[txn.id]; return n })
      return
    }
    setExplaining(txn.id)
    try {
      const { data } = await aiApi.explainAnomaly(txn.id)
      setExplanations(prev => ({ ...prev, [txn.id]: data.explanation }))
    } catch { toast.error('Fiana went quiet — is the AI service up?') }
    finally { setExplaining(null) }
  }

  const handleAnomaly = async (txn) => {
    setTogglingAnomaly(txn.id)
    try {
      const { data } = await txnApi.toggleAnomaly(txn.id, !txn.isAnomaly)
      setTxns(prev => prev.map(t => t.id === txn.id ? data : t))
      toast.success(txn.isAnomaly ? 'Anomaly flag removed' : 'Flagged as anomaly')
    } catch { toast.error('Failed to update') }
    finally { setTogglingAnomaly(null) }
  }

  const handleDelete = async (txn) => {
    try {
      await txnApi.delete(txn.id)
      setTxns(prev => prev.filter(t => t.id !== txn.id))
      toast.success('Transaction deleted')
    } catch { toast.error('Failed to delete') }
    finally { setConfirmTxn(null) }
  }

  const handleSaved = () => {
    setModalOpen(false); setEditingTxn(null)
    if (!startDate || !endDate) return
    setLoading(true)
    txnApi.list(startDate, endDate).then(r => setTxns(r.data)).finally(() => setLoading(false))
  }

  const isCredit = t => t.transactionType === 'CREDIT'
  const debits   = txns.filter(t => !isCredit(t))
  const credits  = txns.filter(isCredit)
  const debitTotal  = debits.reduce((s,t)  => s+parseFloat(t.amount), 0)
  const creditTotal = credits.reduce((s,t) => s+parseFloat(t.amount), 0)

  const chartMap = {}
  debits.forEach(t => { const c = t.category||'Uncategorized'; chartMap[c]=(chartMap[c]||0)+parseFloat(t.amount) })
  const chartData = Object.entries(chartMap).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}))

  const dailyMap = {}
  debits.forEach(t => {
    if (!dailyMap[t.transactionDate]) dailyMap[t.transactionDate] = { spent: 0, income: 0 }
    dailyMap[t.transactionDate].spent += parseFloat(t.amount)
  })
  credits.forEach(t => {
    if (!dailyMap[t.transactionDate]) dailyMap[t.transactionDate] = { spent: 0, income: 0 }
    dailyMap[t.transactionDate].income += parseFloat(t.amount)
  })
  const dailyData = Object.entries(dailyMap)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date, label: format(parseISO(date), 'MMM d'),
      spent: Math.round(v.spent*100)/100,
      income: Math.round(v.income*100)/100,
    }))

  // Choose aggregation based on range width
  const [sy, sm] = (startMonth||'2026-01').split('-').map(Number)
  const [ey, em] = (endMonth||startMonth||'2026-01').split('-').map(Number)
  const numMonths = (ey - sy) * 12 + (em - sm) + 1
  const aggLevel = numMonths <= 1 ? 'day' : numMonths <= 3 ? 'week' : 'month'

  const bucketKey = dateStr => {
    if (aggLevel === 'day') return dateStr
    if (aggLevel === 'month') return dateStr.slice(0, 7)
    // ISO week: find Monday of that week
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const offset = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  const bucketLabel = key => {
    if (aggLevel === 'day')   return format(parseISO(key), 'MMM d')
    if (aggLevel === 'month') return format(parseISO(key + '-01'), 'MMM yy')
    return 'Wk ' + format(parseISO(key), 'MMM d')
  }

  const aggMap = {}
  dailyData.forEach(({ date, spent, income }) => {
    const k = bucketKey(date)
    if (!aggMap[k]) aggMap[k] = { spent: 0, income: 0 }
    aggMap[k].spent  += spent
    aggMap[k].income += income
  })
  const aggData = Object.entries(aggMap)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k, v]) => ({
      label: bucketLabel(k),
      spent:  Math.round(v.spent*100)/100,
      income: Math.round(v.income*100)/100,
    }))

  const aggAvg = aggData.length > 0 ? aggData.reduce((s, d) => s + d.spent, 0) / aggData.length : 0
  const aggLevelLabel = aggLevel === 'day' ? 'daily' : aggLevel === 'week' ? 'weekly' : 'monthly'

  const actualByDay = {}
  debits.forEach(t => {
    actualByDay[t.transactionDate] = (actualByDay[t.transactionDate] || 0) + parseFloat(t.amount)
  })

  const filtered = txns.filter(t => {
    const ok = typeFilter==='All' || (typeFilter==='Credit'&&isCredit(t)) || (typeFilter==='Debit'&&!isCredit(t))
    const q  = search.toLowerCase()
    return ok && (t.description.toLowerCase().includes(q) || (t.category||'').toLowerCase().includes(q))
  })

  return (
    <div className="space-y-5">
      <ScrollFade delay={0}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Transactions</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => { setEditingTxn(null); setModalOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--brand)', color: 'white' }}>
              <Plus size={14} /> Add Transaction
            </button>
          </div>
        </div>
      </ScrollFade>

      {txns.length > 0 && (
        <ScrollFade delay={80}>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 flex flex-col gap-3">
            <div className="card stat-card card-i flex-1 flex flex-col gap-2" style={{ '--c': '#EF4444' }}>
              <div className="flex items-center justify-between">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'rgba(239,68,68,0.22)' }}>
                  <ArrowDownRight size={14} style={{ color:'#EF4444' }} />
                </div>
                <InfoTooltip content="Total debits (spending) for the selected period. Excludes credit/incoming transactions." />
              </div>
              <div>
                <p className="stat-value">${fmtAmt(debitTotal)}</p>
                <p className="text-xs font-medium mt-1" style={{ color:'var(--text-3)' }}>Money out</p>
                <p className="text-xs mt-0.5" style={{ color:'rgba(239,68,68,0.6)', fontSize:'0.7rem' }}>{debits.length} transactions</p>
              </div>
            </div>
            <div className="card stat-card card-i flex-1 flex flex-col gap-2" style={{ '--c': '#10b981' }}>
              <div className="flex items-center justify-between">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'rgba(16,185,129,0.22)' }}>
                  <ArrowUpRight size={14} style={{ color:'#10B981' }} />
                </div>
                <InfoTooltip content="Total credits (income, refunds, incoming transfers) for the selected period." />
              </div>
              <div>
                <p className="stat-value" style={{ color:'#34d399' }}>${fmtAmt(creditTotal)}</p>
                <p className="text-xs font-medium mt-1" style={{ color:'var(--text-3)' }}>Money in</p>
                <p className="text-xs mt-0.5" style={{ color:'rgba(16,185,129,0.6)', fontSize:'0.7rem' }}>{credits.length} transactions</p>
              </div>
            </div>
          </div>

          <div className="card col-span-2 card-i">
            <div className="flex items-center gap-1.5 mb-3">
              <h3 className="text-sm font-semibold" style={{ color:'var(--text)' }}>Spending by category</h3>
              <InfoTooltip content="Debit transactions grouped by category. Categories auto-assigned by our TF-IDF + Logistic Regression ML model. Pie shows proportional split." />
            </div>
            <div className="flex gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={38} outerRadius={64}
                    dataKey="value" paddingAngle={2}>
                    {chartData.map((e,i) => <Cell key={i} fill={getColor(e.name)} />)}
                  </Pie>
                  <Tooltip formatter={v=>`$${fmtAmt(v)}`} contentStyle={TOOLTIP_STYLE}
                    itemStyle={{color:'#e1e2ec'}} labelStyle={{color:'#8c909f',marginBottom:4}} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 overflow-y-auto" style={{ maxHeight:140 }}>
                {chartData.map(({name,value},i) => {
                  const color = getColor(name)
                  const pct = debitTotal>0 ? ((value/debitTotal)*100).toFixed(0) : 0
                  return (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:color }} />
                      <span className="flex-1 truncate text-xs" style={{ color:'var(--text-2)' }}>{name}</span>
                      <span className="font-mono text-xs font-medium" style={{ color:'var(--text)' }}>${fmtAmt(value)}</span>
                      <span className="text-xs w-8 text-right" style={{ color:'var(--text-3)' }}>{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        </ScrollFade>
      )}

      {aggData.length > 1 && (
        <ScrollFade delay={60}>
        <div className="card card-i">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold" style={{ color:'var(--text)' }}>Spending &amp; income</h3>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:'var(--surface-2)', color:'var(--text-3)', border:'1px solid var(--border)' }}>
                {aggLevelLabel}
              </span>
              <InfoTooltip content={`${aggLevelLabel.charAt(0).toUpperCase()+aggLevelLabel.slice(1)} spending (purple) vs income (green). Dashed amber line = average ${aggLevel} spend. Aggregation auto-adjusts: daily ≤1 month, weekly ≤3 months, monthly otherwise.`} />
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color:'var(--text-3)' }}>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 rounded" style={{ background:'#6366F1' }}/>
                Spending
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 rounded" style={{ background:'#10B981' }}/>
                Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 border-t border-dashed" style={{ borderColor:'#F59E0B' }}/>
                Avg ${fmtAmt(aggAvg)}/{aggLevel}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={aggData} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false}
                interval={aggData.length > 20 ? Math.floor(aggData.length/10) : 'preserveStartEnd'} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${v>=1000?(v/1000).toFixed(0)+'k':v}`} width={38} />
              <Tooltip
                formatter={(v, name) => [`$${fmtAmt(v)}`, name === 'spent' ? 'Spending' : 'Income']}
                contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, color:'var(--text)' }}
                itemStyle={{ color:'var(--text)' }} labelStyle={{ color:'var(--text-2)', marginBottom:2 }}
              />
              <ReferenceLine y={aggAvg} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.5} />
              <Line type="monotone" dataKey="spent" stroke="#6366F1" strokeWidth={2}
                dot={aggData.length <= 20 ? { r: 3, fill: '#6366F1', strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: '#6366F1', strokeWidth: 0 }} />
              <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2}
                dot={aggData.length <= 20 ? { r: 3, fill: '#10B981', strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: '#10B981', strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        </ScrollFade>
      )}

      {startDate && endDate && debits.length > 0 && (
        <ScrollFade delay={60}>
          <RangeForecastCard
            startDate={startDate}
            endDate={endDate}
            actualByDay={actualByDay}
            title="Forecast vs actual spend"
            compact
          />
        </ScrollFade>
      )}

      <ScrollFade delay={80}>
      <div className="card card-i">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-0.5 rounded-lg border"
            style={{ background:'var(--surface-2)', borderColor:'var(--border)' }}>
            {['All','Debit','Credit'].map(f => (
              <button key={f} onClick={() => setTypeFilter(f)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={typeFilter===f
                  ? { background:'var(--brand)', color:'white' }
                  : { color:'var(--text-3)', background:'transparent' }}>
                {f==='Debit'&&<ArrowDownRight size={10} className="inline mr-1" style={{color: typeFilter==='Debit'?'white':'#EF4444'}}/>}
                {f==='Credit'&&<ArrowUpRight size={10} className="inline mr-1" style={{color: typeFilter==='Credit'?'white':'#10B981'}}/>}
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs" style={{ color:'var(--text-3)' }}>{filtered.length} transactions</span>
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background:'var(--surface-2)', border:'1px solid var(--border)',
                color:'var(--text)', width:180 }} />
          </div>
        </div>

        {loading ? (
          <FianaApiLoader text="Communicating with Fiana…" />
        ) : filtered.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color:'var(--text-3)' }}>No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom:'2px solid var(--border)' }}>
                  {['Date','Description','Category','Type','Amount',''].map(h => (
                    <th key={h} className="text-left pb-2.5 pr-4 font-medium"
                      style={{ color:'var(--text-3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const credit = isCredit(t)
                  const catColor = getColor(t.category)
                  const hasExplanation   = !!explanations[t.id]
                  const isExplaining     = explaining === t.id
                  const isMerchantOpen   = openMerchant === t.id
                  const isMerchantLoading = merchantLoading === t.description
                  const merchantData     = merchantCache[t.description]
                  const anyExpanded      = isMerchantOpen || hasExplanation
                  return (
                    <React.Fragment key={t.id}>
                      <tr style={{ borderBottom: anyExpanded ? 'none' : '1px solid var(--border)' }}
                        className="tr-hover transition-colors">
                        <td className="py-3 pr-4 font-mono text-xs" style={{ color:'var(--text-3)' }}>{t.transactionDate}</td>
                        <td className="py-3 pr-4 max-w-[220px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium truncate" style={{ color:'var(--text)' }}>{t.description}</span>
                            <button onClick={() => explainMerchantFor(t)}
                              title="What is this merchant?"
                              className="flex-shrink-0 transition-opacity"
                              style={{ opacity: isMerchantOpen ? 1 : 0.35 }}
                              onMouseEnter={e => e.currentTarget.style.opacity=1}
                              onMouseLeave={e => e.currentTarget.style.opacity = isMerchantOpen ? 1 : 0.35}>
                              <Info size={12} style={{ color: isMerchantOpen ? 'var(--brand)' : 'var(--text-3)' }} />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background:`${catColor}15`, color:catColor }}>
                            {t.category||'Uncategorized'}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                            style={credit
                              ? { background:'rgba(52,211,153,0.12)', color:'#34d399' }
                              : { background:'rgba(239,68,68,0.1)', color:'#f87171' }}>
                            {credit ? <><ArrowUpRight size={10}/> Credit</> : <><ArrowDownRight size={10}/> Debit</>}
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono font-semibold text-sm"
                          style={{ color:credit?'#34d399':'var(--text)' }}>
                          {credit?'+':'−'}${fmtAmt(t.amount)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {t.isAnomaly && (
                              <button onClick={() => explainTxn(t)} disabled={isExplaining}
                                title="Explain anomaly"
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-all"
                                style={hasExplanation
                                  ? { background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid rgba(99,102,241,0.2)' }
                                  : { background:'rgba(245,158,11,0.1)', color:'#D97706', border:'1px solid rgba(245,158,11,0.25)',
                                      opacity: isExplaining ? 0.6 : 1 }}>
                                {isExplaining
                                  ? <><AlertTriangle size={10} /> …</>
                                  : hasExplanation
                                    ? <><HelpCircle size={10} /> Hide</>
                                    : <><HelpCircle size={10} /> Why?</>}
                              </button>
                            )}
                            <button
                              onClick={() => handleAnomaly(t)}
                              disabled={togglingAnomaly === t.id}
                              title={t.isAnomaly ? 'Remove anomaly flag' : 'Flag as anomaly'}
                              className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                              style={{ opacity: togglingAnomaly === t.id ? 0.4 : 0.6,
                                color: t.isAnomaly ? '#F59E0B' : 'var(--text-3)' }}
                              onMouseEnter={e => e.currentTarget.style.opacity = 1}
                              onMouseLeave={e => e.currentTarget.style.opacity = togglingAnomaly === t.id ? 0.4 : 0.6}>
                              {t.isAnomaly ? <FlagOff size={13} /> : <Flag size={13} />}
                            </button>
                            <button
                              onClick={() => { setEditingTxn(t); setModalOpen(true) }}
                              title="Edit transaction"
                              className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                              style={{ opacity: 0.5, color: 'var(--text-3)' }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--brand)' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--text-3)' }}>
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => setConfirmTxn(t)}
                              title="Delete transaction"
                              className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
                              style={{ opacity: 0.5, color: 'var(--text-3)' }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = '#f87171' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--text-3)' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isMerchantOpen && (
                        <tr style={{ borderBottom: hasExplanation ? 'none' : '1px solid var(--border)' }}>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="px-4 py-2.5 mx-1 mb-1 rounded-xl"
                              style={{ background:'rgba(14,165,233,0.07)', borderLeft:'3px solid #0EA5E9' }}>
                              {isMerchantLoading ? (
                                <div className="flex items-center gap-2 text-xs py-0.5" style={{ color:'#0EA5E9' }}>
                                  <Info size={11} />
                                  <span>Identifying merchant…</span>
                                </div>
                              ) : merchantData ? (
                                <div className="flex items-start gap-2">
                                  <Info size={11} className="mt-0.5 flex-shrink-0" style={{ color:'#0EA5E9' }} />
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-semibold" style={{ color:'#0EA5E9' }}>Merchant insight</span>
                                      {merchantData.likely_category && (
                                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                          style={{ background:'rgba(14,165,233,0.12)', color:'#0EA5E9' }}>
                                          {merchantData.likely_category}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs" style={{ color:'var(--text-2)' }}>{merchantData.explanation}</p>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                      {hasExplanation && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="px-4 py-3 mx-1 mb-2 rounded-xl"
                              style={{ background: 'var(--brand-light)', borderLeft: '3px solid var(--brand)' }}>
                              <div className="flex items-center gap-1.5 mb-2">
                                <HelpCircle size={12} style={{ color: 'var(--brand)' }} />
                                <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                                  Fiana explains
                                </span>
                              </div>
                              <AiText content={explanations[t.id]} compact />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </ScrollFade>

      {modalOpen && (
        <TxnModal
          txn={editingTxn}
          onClose={() => { setModalOpen(false); setEditingTxn(null) }}
          onSaved={handleSaved}
        />
      )}

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
