import React, { useState, useEffect, useMemo } from 'react'
import { txnApi, aiApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  ArrowDownRight, ArrowUpRight, HelpCircle, AlertTriangle,
  Info, Flag, FlagOff, Pencil, Trash2, Plus, X,
  TrendingDown, TrendingUp, Activity, ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronRight, Layers, Minus,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import AiText from '../components/AiText'
import { FianaApiLoader } from '../components/AiLoader'
import RangeForecastCard from '../components/RangeForecastCard'
import ConfirmDialog from '../components/ConfirmDialog'
import FlagReasonDialog from '../components/FlagReasonDialog'
import toast from 'react-hot-toast'
import { useCategories } from '../hooks/useCategories'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

const EMPTY_FORM = { description: '', amount: '', transactionDate: '', transactionType: 'DEBIT', category: '' }
function fmtAmt(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

/* ── Date helpers ───────────────────────────────────────────────────────────── */
// Local-safe date → YYYY-MM-DD string (avoids UTC shift from toISOString)
function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Returns "YYYY-MM-DD_YYYY-MM-DD" for the portion of the ISO week that falls
// within the same calendar month as dateStr.  Splits at month boundaries.
function getWeekSegmentKey(dateStr) {
  const date = new Date(dateStr + 'T12:00:00')
  const dow = date.getDay() // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow  // days back to Monday

  const monday = new Date(date); monday.setDate(date.getDate() + offset)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)

  const year = parseInt(dateStr.slice(0, 4), 10)
  const month = parseInt(dateStr.slice(5, 7), 10)
  const firstOfMonth = new Date(year, month - 1, 1, 12)
  const lastOfMonth  = new Date(year, month, 0, 12)   // day-0 of next month

  const segStart = monday < firstOfMonth ? firstOfMonth : monday
  const segEnd   = sunday > lastOfMonth  ? lastOfMonth  : sunday
  return `${dateToStr(segStart)}_${dateToStr(segEnd)}`
}

function getWeekSegmentLabel(weekKey) {
  const [s, e] = weekKey.split('_')
  const start = parseISO(s), end = parseISO(e)
  // Both are in same month since we clamp — just show "MMM d – d"
  return `${format(start, 'MMM d')} – ${format(end, 'd')}`
}

/* ── Build two-level month→week groups ─────────────────────────────────────── */
function buildGroups(filtered, isCredit) {
  const monthMap = {}
  filtered.forEach(t => {
    const mKey = t.transactionDate.slice(0, 7)
    const wKey = getWeekSegmentKey(t.transactionDate)
    if (!monthMap[mKey]) monthMap[mKey] = {
      monthKey: mKey,
      monthLabel: format(parseISO(mKey + '-01'), 'MMMM yyyy').toUpperCase(),
      spend: 0, income: 0, weekMap: {},
    }
    const m = monthMap[mKey]
    if (!m.weekMap[wKey]) m.weekMap[wKey] = { weekKey: wKey, weekLabel: getWeekSegmentLabel(wKey), spend: 0, income: 0, txns: [] }
    const w = m.weekMap[wKey]
    w.txns.push(t)
    const amt = parseFloat(t.amount)
    if (isCredit(t)) { w.income += amt; m.income += amt }
    else              { w.spend  += amt; m.spend  += amt }
  })

  return Object.values(monthMap)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .map(m => ({
      ...m,
      txnCount: Object.values(m.weekMap).reduce((s, w) => s + w.txns.length, 0),
      weeks: Object.values(m.weekMap)
        .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
        .map(w => ({ ...w, txns: w.txns.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)) })),
    }))
}

/* ── Modal ─────────────────────────────────────────────────────────────────── */
function TxnModal({ txn, onClose, onSaved }) {
  const editing = !!txn?.id
  const [form, setForm] = React.useState(
    editing
      ? { description: txn.description, amount: txn.amount, transactionDate: txn.transactionDate, transactionType: txn.transactionType || 'DEBIT', category: txn.category || '' }
      : { ...EMPTY_FORM, transactionDate: new Date().toISOString().slice(0, 10) }
  )
  const [saving, setSaving] = React.useState(false)
  const { categories, addCategory } = useCategories()
  const [addingCat, setAddingCat] = React.useState(false)
  const [newCatName, setNewCatName] = React.useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAddCat = () => {
    if (!addCategory(newCatName)) { toast.error('Category already exists or name is empty'); return }
    set('category', newCatName.trim()); setAddingCat(false); setNewCatName('')
  }
  const save = async () => {
    if (!form.description.trim() || !form.amount || !form.transactionDate) { toast.error('Description, amount and date are required'); return }
    setSaving(true)
    try {
      if (editing) await txnApi.update(txn.id, form)
      else await txnApi.create(form)
      toast.success(editing ? 'Transaction updated' : 'Transaction added'); onSaved()
    } catch { toast.error('Failed to save transaction') }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>{editing ? 'Edit Transaction' : 'Add Transaction'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--text-3)' }} /></button>
        </div>
        {[
          { label: 'Description', key: 'description', type: 'text', placeholder: 'e.g. Starbucks' },
          { label: 'Amount ($)', key: 'amount', type: 'number', placeholder: '0.00' },
          { label: 'Date', key: 'transactionDate', type: 'date' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</label>
            <input type={type} value={form[key]} placeholder={placeholder} onChange={e => set(key, e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Type</label>
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {['DEBIT','CREDIT'].map(t => (
                <button key={t} onClick={() => set('transactionType', t)} className="flex-1 py-2 text-xs font-medium transition-all"
                  style={form.transactionType===t ? {background:t==='DEBIT'?'rgba(239,68,68,0.15)':'rgba(52,211,153,0.15)',color:t==='DEBIT'?'#f87171':'#34d399'} : {background:'transparent',color:'var(--text-3)'}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Category</label>
            <select value={addingCat ? '' : form.category} onChange={e => { if (e.target.value==='__add__') { setAddingCat(true); return } set('category', e.target.value) }}
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
            <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name"
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)' }}
              onKeyDown={e => { if (e.key==='Enter') handleAddCat(); if (e.key==='Escape') { setAddingCat(false); setNewCatName('') } }} />
            <button onClick={handleAddCat} className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background:'var(--brand)',color:'white' }}>Add</button>
            <button onClick={() => { setAddingCat(false); setNewCatName('') }} className="w-9 flex items-center justify-center rounded-xl"
              style={{ background:'var(--surface-2)', color:'var(--text-3)', border:'1px solid var(--border)' }}><X size={13} /></button>
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background:'var(--surface-2)', color:'var(--text-2)', border:'1px solid var(--border)' }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 btn-primary py-2.5 rounded-xl text-sm font-medium">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── KPI card ───────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon: Icon, color, onClick, clickable }) {
  return (
    <div onClick={onClick} className="card flex flex-col gap-2"
      style={{
        cursor: clickable ? 'pointer' : 'default',
        background: `linear-gradient(135deg, color-mix(in srgb, ${color} 6%, transparent) 0%, var(--surface) 70%)`,
        border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
        transition: 'transform 0.18s ease',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.transform = 'translateY(0)' }}>
      <div className="flex items-center justify-between">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
          <Icon size={14} style={{ color }} />
        </div>
        {clickable && <span className="text-xs" style={{ color:'var(--text-3)' }}>tap to filter</span>}
      </div>
      <div>
        <p className="font-bold text-xl tracking-tight" style={{ color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>{value}</p>
        <p className="text-xs font-medium mt-0.5" style={{ color:'var(--text-3)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color:`color-mix(in srgb, ${color} 70%, transparent)`, fontSize:'0.68rem' }}>{sub}</p>}
      </div>
    </div>
  )
}

/* ── Category stacked bar ───────────────────────────────────────────────────── */
function CategoryBar({ chartData, debitTotal, getColor, activeCat, onCatClick }) {
  const [hovered, setHovered] = useState(null)
  if (!chartData.length) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-sm font-semibold" style={{ color:'var(--text)' }}>Spending breakdown</h3>
        <InfoTooltip content="Click any segment or chip to filter the transaction list by category." />
        {activeCat && (
          <button onClick={() => onCatClick(null)} className="ml-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background:'var(--surface-3)', color:'var(--text-2)', border:'1px solid var(--border)' }}>
            <X size={10} /> Clear filter
          </button>
        )}
      </div>
      <div className="flex rounded-full overflow-hidden h-7 mb-4" style={{ gap:1 }}>
        {chartData.map(({ name, value }) => {
          const pct = debitTotal > 0 ? (value/debitTotal)*100 : 0
          const color = getColor(name)
          const isActive = activeCat === name
          return (
            <div key={name} onClick={() => onCatClick(name===activeCat?null:name)}
              onMouseEnter={() => setHovered(name)} onMouseLeave={() => setHovered(null)}
              title={`${name}: $${fmtAmt(value)} (${pct.toFixed(1)}%)`}
              style={{ width:`${pct}%`, background:color, cursor:'pointer', minWidth:pct>0?4:0,
                opacity:activeCat&&!isActive?0.25:hovered===name?0.9:0.75, transition:'opacity 0.15s',
                outline:isActive?`2px solid ${color}`:'none', outlineOffset:1 }} />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {chartData.map(({ name, value }) => {
          const pct = debitTotal>0?((value/debitTotal)*100).toFixed(0):0
          const color = getColor(name), isActive = activeCat===name
          return (
            <button key={name} onClick={() => onCatClick(name===activeCat?null:name)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{ background:isActive?`color-mix(in srgb, ${color} 18%, transparent)`:'var(--surface-2)',
                border:`1px solid ${isActive?color:'var(--border)'}`, color:isActive?color:'var(--text-2)' }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:color }} />
              {name}
              <span style={{ color:isActive?color:'var(--text-3)', opacity:0.8 }}>{pct}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Dual mini bar ──────────────────────────────────────────────────────────── */
function DualMiniBar({ spend, income, maxVal, width = 80 }) {
  const sp = maxVal > 0 ? Math.min((spend/maxVal)*100, 100) : 0
  const ip = maxVal > 0 ? Math.min((income/maxVal)*100, 100) : 0
  return (
    <div style={{ width, flexShrink:0 }}>
      <div style={{ height:3, borderRadius:999, background:'rgba(255,255,255,0.06)', overflow:'hidden', marginBottom:4 }}>
        <div style={{ height:'100%', width:`${sp}%`, borderRadius:999,
          background:'linear-gradient(90deg,#dc2626,#f87171)',
          transition:'width 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />
      </div>
      <div style={{ height:3, borderRadius:999, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${ip}%`, borderRadius:999,
          background:'linear-gradient(90deg,#059669,#34d399)',
          transition:'width 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />
      </div>
    </div>
  )
}

/* ── Month header row ───────────────────────────────────────────────────────── */
function MonthHeader({ month, maxMonthVal, isExpanded, onToggle }) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center gap-4 text-left"
      style={{
        padding: '14px 20px',
        background: isExpanded ? 'rgba(91,155,255,0.05)' : 'transparent',
        borderBottom: `1px solid ${isExpanded ? 'rgba(91,155,255,0.14)' : 'var(--border)'}`,
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}>

      {/* Left stripe indicator */}
      <div style={{
        width: 3, height: 32, borderRadius: 2, flexShrink: 0,
        background: month.spend > month.income ? '#EF4444' : '#10B981',
        opacity: 0.7,
      }} />

      {/* Month label — Bebas Neue */}
      <span style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 20, letterSpacing: '0.07em', color: 'var(--text)',
        minWidth: 160, flexShrink: 0,
      }}>
        {month.monthLabel}
      </span>

      <div style={{ flex: 1 }} />

      {/* Mini bar */}
      <DualMiniBar spend={month.spend} income={month.income} maxVal={maxMonthVal} width={96} />

      {/* Totals */}
      <div className="hidden sm:flex items-center gap-3" style={{ minWidth: 210 }}>
        {month.spend > 0 && (
          <span style={{ color:'#f87171', fontSize:12, fontFamily:"'JetBrains Mono',monospace", fontWeight:500 }}>
            −${fmtAmt(month.spend)}
          </span>
        )}
        {month.income > 0 && (
          <span style={{ color:'#34d399', fontSize:12, fontFamily:"'JetBrains Mono',monospace", fontWeight:500 }}>
            +${fmtAmt(month.income)}
          </span>
        )}
        <span style={{ color:'var(--text-3)', fontSize:11 }}>
          {month.txnCount} txn{month.txnCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Chevron */}
      <ChevronRight size={16} style={{
        color: isExpanded ? 'var(--brand)' : 'var(--text-3)', flexShrink: 0,
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), color 0.15s',
      }} />
    </button>
  )
}

/* ── Week header row (nested inside month) ──────────────────────────────────── */
function WeekHeader({ week, maxWeekVal, isExpanded, onToggle }) {
  const netColor = week.spend > week.income ? '#EF4444' : '#10B981'
  return (
    <button onClick={onToggle}
      className="w-full flex items-center gap-3 text-left"
      style={{
        padding: '9px 20px 9px 40px',
        background: isExpanded ? 'rgba(255,255,255,0.025)' : 'transparent',
        borderBottom: `1px solid ${isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)'}`,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.015)' }}
      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}>

      {/* Indent marker */}
      <div style={{ width: 2, height: 20, borderRadius: 1, flexShrink: 0, background: netColor, opacity: 0.5 }} />

      {/* Week label */}
      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
        fontFamily: 'Manrope, sans-serif', minWidth: 110, flexShrink: 0,
      }}>
        {week.weekLabel}
      </span>

      <div style={{ flex: 1 }} />

      {/* Mini bar (smaller) */}
      <DualMiniBar spend={week.spend} income={week.income} maxVal={maxWeekVal} width={64} />

      {/* Totals */}
      <div className="hidden sm:flex items-center gap-2" style={{ minWidth: 190 }}>
        {week.spend > 0 && (
          <span style={{ color:'rgba(248,113,113,0.85)', fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>
            −${fmtAmt(week.spend)}
          </span>
        )}
        {week.income > 0 && (
          <span style={{ color:'rgba(52,211,153,0.85)', fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>
            +${fmtAmt(week.income)}
          </span>
        )}
        <span style={{ color:'var(--text-3)', fontSize:10 }}>
          {week.txns.length} txn{week.txns.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Chevron (smaller) */}
      <ChevronRight size={13} style={{
        color: isExpanded ? 'var(--brand)' : 'var(--text-3)', flexShrink: 0,
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1), color 0.15s',
      }} />
    </button>
  )
}

/* ── Transaction row (div-based, inside week accordion) ─────────────────────── */
const ROW_COLS = '1fr 140px 88px 130px 116px'

function TxnRowDiv({
  t, isCredit, getColor, maxAmount,
  explaining, explanations, merchantCache, merchantLoading, openMerchant, togglingAnomaly,
  onExplainMerchant, onExplainAnomaly, onToggleAnomaly, onEdit, onDelete,
}) {
  const credit = isCredit(t)
  const catColor = getColor(t.category)
  const hasExplanation = !!explanations[t.id]
  const isExplaining = explaining === t.id
  const isMerchantOpen = openMerchant === t.id
  const isMerchantLoading = merchantLoading === t.description
  const merchantData = merchantCache[t.description]
  const hasUserNote = t.manuallyFlagged && !!t.userFlagReason
  const anyExpanded = isMerchantOpen || hasExplanation || hasUserNote
  const amtPct = Math.min((parseFloat(t.amount) / maxAmount) * 100, 100)
  const accentColor = t.isAnomaly ? '#F59E0B' : catColor

  return (
    <div style={{ borderBottom: anyExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
      <div className="group flex items-stretch transition-colors"
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {/* Category accent stripe */}
        <div style={{ width:3, flexShrink:0, background:accentColor, opacity:t.isAnomaly?0.9:0.4 }} />
        <div style={{ flex:1, display:'grid', gridTemplateColumns:ROW_COLS, alignItems:'center', gap:8, padding:'0 16px 0 52px' }}>
          {/* Description */}
          <div className="flex items-center gap-1.5 min-w-0 py-3">
            {t.isAnomaly && <AlertTriangle size={11} style={{ color:'#F59E0B', flexShrink:0 }} />}
            <span className="font-medium truncate" style={{ color:'var(--text)', fontSize:13 }}>{t.description}</span>
          </div>
          {/* Category */}
          <div className="py-3">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background:`${catColor}15`, color:catColor }}>
              {t.category || 'Uncategorized'}
            </span>
          </div>
          {/* Type */}
          <div className="py-3">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={credit ? {background:'rgba(52,211,153,0.1)',color:'#34d399'} : {background:'rgba(239,68,68,0.08)',color:'#f87171'}}>
              {credit ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}
              {credit ? 'Credit' : 'Debit'}
            </span>
          </div>
          {/* Amount */}
          <div className="py-3" style={{ position:'relative' }}>
            <div style={{
              position:'absolute', left:0, top:'50%', transform:'translateY(-50%)',
              height:'65%', width:`${amtPct*0.88}%`,
              background:credit?'rgba(52,211,153,0.07)':'rgba(239,68,68,0.06)',
              borderRadius:3, pointerEvents:'none',
            }} />
            <span className="relative font-mono font-semibold text-sm" style={{ color:credit?'#34d399':'var(--text)' }}>
              {credit?'+':'−'}${fmtAmt(t.amount)}
            </span>
          </div>
          {/* Actions */}
          <div className="py-3 flex items-center gap-1 justify-end">
            <button onClick={() => onExplainMerchant(t)} title="Merchant info"
              className="w-6 h-6 rounded-md flex items-center justify-center transition-all opacity-0 group-hover:opacity-60 hover:!opacity-100"
              style={{ color:isMerchantOpen?'var(--brand)':'var(--text-3)' }}>
              <Info size={12}/>
            </button>
            {t.isAnomaly && (
              <button onClick={() => onExplainAnomaly(t)} disabled={isExplaining}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-all"
                style={hasExplanation
                  ? {background:'var(--brand-light)',color:'var(--brand)',border:'1px solid rgba(91,155,255,0.2)'}
                  : {background:'rgba(245,158,11,0.1)',color:'#D97706',border:'1px solid rgba(245,158,11,0.25)',opacity:isExplaining?0.6:1}}>
                {isExplaining ? <><AlertTriangle size={10}/> …</> : hasExplanation ? <><HelpCircle size={10}/> Hide</> : <><HelpCircle size={10}/> Why?</>}
              </button>
            )}
            <button onClick={() => onToggleAnomaly(t)} disabled={togglingAnomaly===t.id}
              className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
              style={{ color:t.isAnomaly?'#F59E0B':'var(--text-3)' }}>
              {t.isAnomaly ? <FlagOff size={13}/> : <Flag size={13}/>}
            </button>
            <button onClick={() => onEdit(t)}
              className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
              style={{ color:'var(--text-3)' }}
              onMouseEnter={e => e.currentTarget.style.color='var(--brand)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>
              <Pencil size={12}/>
            </button>
            <button onClick={() => onDelete(t)}
              className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
              style={{ color:'var(--text-3)' }}
              onMouseEnter={e => e.currentTarget.style.color='#f87171'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>
              <Trash2 size={12}/>
            </button>
          </div>
        </div>
      </div>

      {/* Merchant expand */}
      {isMerchantOpen && (
        <div style={{ padding:'0 16px 10px 55px' }}>
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background:'rgba(14,165,233,0.07)', border:'1px solid rgba(14,165,233,0.14)' }}>
            {isMerchantLoading ? (
              <div className="flex items-center gap-2 text-xs" style={{ color:'#0EA5E9' }}><Info size={11}/> Identifying merchant…</div>
            ) : merchantData ? (
              <div className="flex items-start gap-2">
                <Info size={11} className="mt-0.5 flex-shrink-0" style={{ color:'#0EA5E9' }}/>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color:'#0EA5E9' }}>Merchant insight</span>
                    {merchantData.likely_category && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:'rgba(14,165,233,0.12)',color:'#0EA5E9' }}>
                        {merchantData.likely_category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color:'var(--text-2)' }}>{merchantData.explanation}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Anomaly explain */}
      {hasExplanation && (
        <div style={{ padding:'0 16px 10px 55px' }}>
          <div className="px-3 py-3 rounded-xl" style={{ background:'var(--brand-light)', border:'1px solid rgba(91,155,255,0.14)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <HelpCircle size={12} style={{ color:'var(--brand)' }}/>
              <span className="text-xs font-semibold" style={{ color:'var(--brand)' }}>Fiana explains</span>
            </div>
            <AiText content={explanations[t.id]} compact/>
          </div>
        </div>
      )}

      {hasUserNote && (
        <div style={{ padding:'0 16px 10px 55px' }}>
          <div className="px-3 py-3 rounded-xl" style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.18)' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Flag size={11} style={{ color:'#F59E0B' }}/>
              <span className="text-xs font-semibold" style={{ color:'#F59E0B' }}>Your note</span>
            </div>
            <p className="text-xs" style={{ color:'var(--text-2)' }}>{t.userFlagReason}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Column header strip (shown at top of expanded week) ────────────────────── */
function ColHeaders() {
  return (
    <div style={{
      display:'grid', gridTemplateColumns:`3px ${ROW_COLS}`,
      alignItems:'center', gap:8, padding:'6px 16px 6px 52px',
      borderBottom:'1px solid rgba(255,255,255,0.04)',
      background:'rgba(255,255,255,0.01)',
    }}>
      <div/>
      {['Description','Category','Type','Amount',''].map(h => (
        <div key={h} style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:600 }}>{h}</div>
      ))}
    </div>
  )
}

/* ── Week section (inside month) ────────────────────────────────────────────── */
function WeekSection({ week, maxWeekVal, isExpanded, onToggle, rowProps }) {
  return (
    <div>
      <WeekHeader week={week} maxWeekVal={maxWeekVal} isExpanded={isExpanded} onToggle={onToggle} />
      <div style={{
        display:'grid',
        gridTemplateRows: isExpanded ? '1fr' : '0fr',
        transition:'grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ overflow:'hidden' }}>
          <ColHeaders />
          {week.txns.map(t => <TxnRowDiv key={t.id} t={t} {...rowProps} />)}
        </div>
      </div>
    </div>
  )
}

/* ── Month section ──────────────────────────────────────────────────────────── */
function MonthSection({ month, maxMonthVal, maxWeekVal, isExpanded, onToggle, expandedWeeks, onToggleWeek, rowProps }) {
  return (
    <div>
      <MonthHeader month={month} maxMonthVal={maxMonthVal} isExpanded={isExpanded} onToggle={onToggle} />
      <div style={{
        display:'grid',
        gridTemplateRows: isExpanded ? '1fr' : '0fr',
        transition:'grid-template-rows 0.38s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ overflow:'hidden' }}>
          {month.weeks.map(week => (
            <WeekSection key={week.weekKey}
              week={week} maxWeekVal={maxWeekVal}
              isExpanded={expandedWeeks.has(week.weekKey)}
              onToggle={() => onToggleWeek(week.weekKey)}
              rowProps={rowProps} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Flat table row (used when sorting by non-date field) ───────────────────── */
function TxnRow({
  t, isCredit, getColor, maxAmount,
  explaining, explanations, merchantCache, merchantLoading, openMerchant, togglingAnomaly,
  onExplainMerchant, onExplainAnomaly, onToggleAnomaly, onEdit, onDelete,
}) {
  const credit = isCredit(t)
  const catColor = getColor(t.category)
  const hasExplanation = !!explanations[t.id]
  const isExplaining = explaining === t.id
  const isMerchantOpen = openMerchant === t.id
  const isMerchantLoading = merchantLoading === t.description
  const merchantData = merchantCache[t.description]
  const hasUserNote = t.manuallyFlagged && !!t.userFlagReason
  const anyExpanded = isMerchantOpen || hasExplanation || hasUserNote
  const amtPct = Math.min((parseFloat(t.amount)/maxAmount)*100, 100)
  const accentColor = t.isAnomaly ? '#F59E0B' : catColor
  return (
    <React.Fragment>
      <tr style={{ borderBottom:anyExpanded?'none':'1px solid var(--border)' }} className="tr-hover transition-colors group">
        <td style={{ padding:0, width:3, minWidth:3 }}>
          <div style={{ width:3, height:'100%', minHeight:44, background:accentColor, opacity:t.isAnomaly?1:0.45, borderRadius:'0 2px 2px 0' }}/>
        </td>
        <td className="py-3 pr-4 font-mono text-xs" style={{ color:'var(--text-3)', paddingLeft:12 }}>{t.transactionDate}</td>
        <td className="py-3 pr-4" style={{ maxWidth:240 }}>
          <div className="flex items-center gap-1.5 min-w-0">
            {t.isAnomaly && <AlertTriangle size={11} style={{ color:'#F59E0B', flexShrink:0 }}/>}
            <span className="font-medium truncate" style={{ color:'var(--text)' }}>{t.description}</span>
          </div>
        </td>
        <td className="py-3 pr-4">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background:`${catColor}15`, color:catColor }}>
            {t.category||'Uncategorized'}
          </span>
        </td>
        <td className="py-3 pr-4">
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={credit?{background:'rgba(52,211,153,0.1)',color:'#34d399'}:{background:'rgba(239,68,68,0.08)',color:'#f87171'}}>
            {credit?<ArrowUpRight size={10}/>:<ArrowDownRight size={10}/>}
            {credit?'Credit':'Debit'}
          </span>
        </td>
        <td className="py-3 pr-4" style={{ position:'relative', minWidth:110 }}>
          <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)',
            height:'70%', width:`${amtPct*0.9}%`, maxWidth:'88%',
            background:credit?'rgba(52,211,153,0.07)':'rgba(239,68,68,0.06)', borderRadius:4, pointerEvents:'none' }}/>
          <span className="relative font-mono font-semibold text-sm" style={{ color:credit?'#34d399':'var(--text)' }}>
            {credit?'+':'−'}${fmtAmt(t.amount)}
          </span>
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => onExplainMerchant(t)} title="Merchant info"
              className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
              style={{ color:isMerchantOpen?'var(--brand)':'var(--text-3)' }}><Info size={12}/></button>
            {t.isAnomaly && (
              <button onClick={() => onExplainAnomaly(t)} disabled={isExplaining}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-all"
                style={hasExplanation
                  ? {background:'var(--brand-light)',color:'var(--brand)',border:'1px solid rgba(91,155,255,0.2)'}
                  : {background:'rgba(245,158,11,0.1)',color:'#D97706',border:'1px solid rgba(245,158,11,0.25)',opacity:isExplaining?0.6:1}}>
                {isExplaining?<><AlertTriangle size={10}/> …</>:hasExplanation?<><HelpCircle size={10}/> Hide</>:<><HelpCircle size={10}/> Why?</>}
              </button>
            )}
            <button onClick={() => onToggleAnomaly(t)} disabled={togglingAnomaly===t.id}
              className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
              style={{ color:t.isAnomaly?'#F59E0B':'var(--text-3)' }}>
              {t.isAnomaly?<FlagOff size={13}/>:<Flag size={13}/>}
            </button>
            <button onClick={() => onEdit(t)}
              className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
              style={{ color:'var(--text-3)' }}
              onMouseEnter={e => e.currentTarget.style.color='var(--brand)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}><Pencil size={12}/></button>
            <button onClick={() => onDelete(t)}
              className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
              style={{ color:'var(--text-3)' }}
              onMouseEnter={e => e.currentTarget.style.color='#f87171'}
              onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}><Trash2 size={12}/></button>
          </div>
        </td>
      </tr>
      {isMerchantOpen && (
        <tr style={{ borderBottom:(hasExplanation||hasUserNote)?'none':'1px solid var(--border)' }}>
          <td style={{ padding:0, width:3 }}><div style={{ width:3, height:'100%', background:'#0EA5E9', opacity:0.6 }}/></td>
          <td colSpan={6} style={{ padding:'0 16px 10px 12px' }}>
            <div className="px-3 py-2.5 rounded-xl" style={{ background:'rgba(14,165,233,0.07)', border:'1px solid rgba(14,165,233,0.14)' }}>
              {isMerchantLoading
                ? <div className="flex items-center gap-2 text-xs" style={{ color:'#0EA5E9' }}><Info size={11}/> Identifying…</div>
                : merchantData ? (
                  <div className="flex items-start gap-2">
                    <Info size={11} className="mt-0.5 flex-shrink-0" style={{ color:'#0EA5E9' }}/>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold" style={{ color:'#0EA5E9' }}>Merchant insight</span>
                        {merchantData.likely_category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:'rgba(14,165,233,0.12)',color:'#0EA5E9' }}>{merchantData.likely_category}</span>}
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
        <tr style={{ borderBottom:hasUserNote?'none':'1px solid var(--border)' }}>
          <td style={{ padding:0, width:3 }}><div style={{ width:3, height:'100%', background:'var(--brand)', opacity:0.7 }}/></td>
          <td colSpan={6} style={{ padding:'0 16px 10px 12px' }}>
            <div className="px-3 py-3 rounded-xl" style={{ background:'var(--brand-light)', border:'1px solid rgba(91,155,255,0.14)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <HelpCircle size={12} style={{ color:'var(--brand)' }}/><span className="text-xs font-semibold" style={{ color:'var(--brand)' }}>Fiana explains</span>
              </div>
              <AiText content={explanations[t.id]} compact/>
            </div>
          </td>
        </tr>
      )}
      {hasUserNote && (
        <tr style={{ borderBottom:'1px solid var(--border)' }}>
          <td style={{ padding:0, width:3 }}><div style={{ width:3, height:'100%', background:'#F59E0B', opacity:0.7 }}/></td>
          <td colSpan={6} style={{ padding:'0 16px 10px 12px' }}>
            <div className="px-3 py-3 rounded-xl" style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.18)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Flag size={11} style={{ color:'#F59E0B' }}/><span className="text-xs font-semibold" style={{ color:'#F59E0B' }}>Your note</span>
              </div>
              <p className="text-xs" style={{ color:'var(--text-2)' }}>{t.userFlagReason}</p>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  )
}

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field
  return (
    <th className="text-left pb-3 pr-4 select-none"
      style={{ color:active?'var(--brand)':'var(--text-3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em', cursor:'pointer', whiteSpace:'nowrap' }}
      onClick={() => onSort(field)}>
      <span className="flex items-center gap-1">
        {label}
        {active ? sort.dir==='asc'?<ChevronUp size={11}/>:<ChevronDown size={11}/> : <ChevronsUpDown size={10} style={{ opacity:0.4 }}/>}
      </span>
    </th>
  )
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function TransactionsPage() {
  const { startDate, endDate, startMonth, endMonth } = useTimeFilter()
  const { getColor } = useCategories()
  const [txns, setTxns]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [activeCat, setActiveCat] = useState(null)
  const [sort, setSort]           = useState({ field:'date', dir:'desc' })
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [expandedWeeks, setExpandedWeeks]   = useState(new Set())
  const [explaining, setExplaining]           = useState(null)
  const [explanations, setExplanations]       = useState({})
  const [merchantCache, setMerchantCache]     = useState({})
  const [merchantLoading, setMerchantLoading] = useState(null)
  const [openMerchant, setOpenMerchant]       = useState(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingTxn, setEditingTxn] = useState(null)
  const [togglingAnomaly, setTogglingAnomaly] = useState(null)
  const [confirmTxn, setConfirmTxn] = useState(null)
  const [flaggingTxn, setFlaggingTxn] = useState(null)

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
    } catch { toast.error("Fiana couldn't place that merchant"); setOpenMerchant(null) }
    finally { setMerchantLoading(null) }
  }

  const explainTxn = async (txn) => {
    if (explanations[txn.id]) { setExplanations(prev => { const n={...prev}; delete n[txn.id]; return n }); return }
    setExplaining(txn.id)
    try {
      const { data } = await aiApi.explainAnomaly(txn.id)
      setExplanations(prev => ({ ...prev, [txn.id]: data.explanation }))
    } catch { toast.error('Fiana went quiet — is the AI service up?') }
    finally { setExplaining(null) }
  }

  const handleAnomaly = async (txn, reason) => {
    setTogglingAnomaly(txn.id)
    try {
      const { data } = await txnApi.toggleAnomaly(txn.id, !txn.isAnomaly, reason)
      setTxns(prev => prev.map(t => t.id===txn.id?data:t))
      toast.success(txn.isAnomaly ? 'Anomaly flag removed' : 'Flagged as anomaly')
    } catch { toast.error('Failed to update') }
    finally { setTogglingAnomaly(null); setFlaggingTxn(null) }
  }

  // Flagging asks for an optional reason first; unflagging happens immediately
  const requestToggleAnomaly = txn => txn.isAnomaly ? handleAnomaly(txn) : setFlaggingTxn(txn)

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
  const debitTotal  = debits.reduce((s,t) => s+parseFloat(t.amount), 0)
  const creditTotal = credits.reduce((s,t) => s+parseFloat(t.amount), 0)
  const netFlow = creditTotal - debitTotal
  const anomalyCount = txns.filter(t => t.isAnomaly).length

  const chartMap = {}
  debits.forEach(t => { const c=t.category||'Uncategorized'; chartMap[c]=(chartMap[c]||0)+parseFloat(t.amount) })
  const chartData = Object.entries(chartMap).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}))

  // Line chart aggregation
  const [sy,sm] = (startMonth||'2026-01').split('-').map(Number)
  const [ey,em] = (endMonth||startMonth||'2026-01').split('-').map(Number)
  const numMonthsRange = (ey-sy)*12+(em-sm)+1
  const aggLevel = numMonthsRange<=1?'day':numMonthsRange<=3?'week':'month'
  const aggLevelLabel = aggLevel==='day'?'daily':aggLevel==='week'?'weekly':'monthly'

  const dailyMap = {}
  txns.forEach(t => {
    if (!dailyMap[t.transactionDate]) dailyMap[t.transactionDate]={spent:0,income:0}
    if (isCredit(t)) dailyMap[t.transactionDate].income+=parseFloat(t.amount)
    else             dailyMap[t.transactionDate].spent +=parseFloat(t.amount)
  })
  const bKey = d => aggLevel==='day'?d:aggLevel==='month'?d.slice(0,7):dateToStr((() => { const dt=new Date(d+'T12:00:00'); const day=dt.getDay(); const off=day===0?-6:1-day; dt.setDate(dt.getDate()+off); return dt })())
  const bLabel = k => aggLevel==='day'?format(parseISO(k),'MMM d'):aggLevel==='month'?format(parseISO(k+'-01'),'MMM yy'):'Wk '+format(parseISO(k),'MMM d')
  const aggBuckets = {}
  Object.entries(dailyMap).forEach(([d,v]) => {
    const k=bKey(d)
    if (!aggBuckets[k]) aggBuckets[k]={spent:0,income:0}
    aggBuckets[k].spent+=v.spent; aggBuckets[k].income+=v.income
  })
  const aggData = Object.entries(aggBuckets).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>({label:bLabel(k),spent:Math.round(v.spent*100)/100,income:Math.round(v.income*100)/100}))
  const aggAvg = aggData.length>0?aggData.reduce((s,d)=>s+d.spent,0)/aggData.length:0

  const actualByDay = {}
  debits.forEach(t => { actualByDay[t.transactionDate]=(actualByDay[t.transactionDate]||0)+parseFloat(t.amount) })

  const maxAmount = useMemo(() => Math.max(...txns.map(t=>parseFloat(t.amount)),1), [txns])

  const handleSort = field => setSort(s => s.field===field ? {field,dir:s.dir==='asc'?'desc':'asc'} : {field,dir:'desc'})

  const filtered = useMemo(() => txns.filter(t => {
    const typeOk = typeFilter==='All'||(typeFilter==='Credit'&&isCredit(t))||(typeFilter==='Debit'&&!isCredit(t))
    const catOk  = !activeCat||(t.category||'Uncategorized')===activeCat
    const q = search.toLowerCase()
    return typeOk&&catOk&&(!q||t.description.toLowerCase().includes(q)||(t.category||'').toLowerCase().includes(q))
  }), [txns, typeFilter, activeCat, search])

  const showGroups = sort.field === 'date'

  const months = useMemo(() => showGroups ? buildGroups(filtered, isCredit) : [], [filtered, showGroups])

  const maxMonthVal = useMemo(() => Math.max(...months.map(m=>Math.max(m.spend,m.income)),1), [months])
  const maxWeekVal  = useMemo(() => Math.max(...months.flatMap(m=>m.weeks).map(w=>Math.max(w.spend,w.income)),1), [months])

  // Reset expand state + auto-expand single month
  useEffect(() => {
    setExpandedWeeks(new Set())
    if (months.length === 1) {
      setExpandedMonths(new Set([months[0].monthKey]))
    } else {
      setExpandedMonths(new Set())
    }
  }, [startDate, endDate, activeCat, typeFilter, search])

  const toggleMonth = key => setExpandedMonths(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n })
  const toggleWeek  = key => setExpandedWeeks (prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n })

  const allMonthsExpanded = months.length > 0 && expandedMonths.size === months.length
  const toggleAllMonths = () => setExpandedMonths(allMonthsExpanded ? new Set() : new Set(months.map(m=>m.monthKey)))

  const flatSorted = useMemo(() => {
    if (showGroups) return []
    return [...filtered].sort((a,b) => {
      let va,vb
      if (sort.field==='amount') { va=parseFloat(a.amount); vb=parseFloat(b.amount) }
      else if (sort.field==='category') { va=a.category||''; vb=b.category||'' }
      else { va=a.description||''; vb=b.description||'' }
      const cmp = typeof va==='string' ? va.localeCompare(vb) : va-vb
      return sort.dir==='asc'?cmp:-cmp
    })
  }, [filtered, sort, showGroups])

  const rowProps = {
    isCredit, getColor, maxAmount, explaining, explanations,
    merchantCache, merchantLoading, openMerchant, togglingAnomaly,
    onExplainMerchant:explainMerchantFor, onExplainAnomaly:explainTxn,
    onToggleAnomaly:requestToggleAnomaly, onEdit:t=>{setEditingTxn(t);setModalOpen(true)},
    onDelete:t=>setConfirmTxn(t),
  }

  return (
    <div className="space-y-5">
      <ScrollFade delay={0}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color:'var(--text)' }}>Transactions</h2>
            {txns.length > 0 && (
              <p className="text-xs mt-0.5" style={{ color:'var(--text-3)' }}>
                {txns.length} transactions · {startDate} – {endDate}
              </p>
            )}
          </div>
          <button onClick={() => { setEditingTxn(null); setModalOpen(true) }} className="flex items-center gap-1.5 btn-primary">
            <Plus size={14}/> Add Transaction
          </button>
        </div>
      </ScrollFade>

      {txns.length > 0 && (
        <ScrollFade delay={60}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Money out" value={`$${fmtAmt(debitTotal)}`} sub={`${debits.length} transactions`} icon={TrendingDown} color="#EF4444"/>
            <KpiCard label="Money in" value={`$${fmtAmt(creditTotal)}`} sub={`${credits.length} transactions`} icon={TrendingUp} color="#10B981"/>
            <KpiCard label="Net cash flow" value={`${netFlow>=0?'+':'−'}$${fmtAmt(Math.abs(netFlow))}`}
              sub={netFlow>=0?'Positive flow':'Negative flow'} icon={Activity} color={netFlow>=0?'#10B981':'#EF4444'}/>
            <KpiCard label="Transactions" value={txns.length} sub={`${debits.length} debit · ${credits.length} credit`} icon={ArrowDownRight} color="#5b9bff"/>
            <KpiCard label="Anomalies" value={anomalyCount} sub={anomalyCount>0?'Tap to filter':'None flagged'}
              icon={AlertTriangle} color="#F59E0B" clickable={anomalyCount>0}
              onClick={() => { if (anomalyCount>0) { setTypeFilter('Debit'); document.getElementById('txn-table')?.scrollIntoView({behavior:'smooth',block:'start'}) } }}/>
          </div>
        </ScrollFade>
      )}

      {txns.length > 0 && (
        <ScrollFade delay={80}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card card-i">
              <CategoryBar chartData={chartData} debitTotal={debitTotal} getColor={getColor} activeCat={activeCat}
                onCatClick={cat => { setActiveCat(cat); if (cat) setTypeFilter('Debit') }}/>
            </div>
            {aggData.length > 1 && (
              <div className="card card-i">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold" style={{ color:'var(--text)' }}>Spending &amp; income</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:'var(--surface-2)', color:'var(--text-3)', border:'1px solid var(--border)' }}>{aggLevelLabel}</span>
                    <InfoTooltip content={`${aggLevelLabel.charAt(0).toUpperCase()+aggLevelLabel.slice(1)} spend vs income.`}/>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color:'var(--text-3)' }}>
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 rounded" style={{ background:'#6366F1' }}/> Spend</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 rounded" style={{ background:'#10B981' }}/> Income</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={156}>
                  <LineChart data={aggData} margin={{ left:0, right:8, top:4, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="label" tick={{ fontSize:10, fill:'var(--text-3)' }} axisLine={false} tickLine={false}
                      interval={aggData.length>20?Math.floor(aggData.length/10):'preserveStartEnd'}/>
                    <YAxis tick={{ fontSize:10, fill:'var(--text-3)' }} axisLine={false} tickLine={false}
                      tickFormatter={v=>`$${v>=1000?(v/1000).toFixed(0)+'k':v}`} width={38}/>
                    <Tooltip formatter={(v,n)=>[`$${fmtAmt(v)}`,n==='spent'?'Spending':'Income']}
                      contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, color:'var(--text)' }}
                      itemStyle={{ color:'var(--text)' }} labelStyle={{ color:'var(--text-2)', marginBottom:2 }}/>
                    <ReferenceLine y={aggAvg} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.5}/>
                    <Line type="monotone" dataKey="spent" stroke="#6366F1" strokeWidth={2}
                      dot={aggData.length<=20?{r:3,fill:'#6366F1',strokeWidth:0}:false} activeDot={{ r:5, fill:'#6366F1', strokeWidth:0 }}/>
                    <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2}
                      dot={aggData.length<=20?{r:3,fill:'#10B981',strokeWidth:0}:false} activeDot={{ r:5, fill:'#10B981', strokeWidth:0 }}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </ScrollFade>
      )}

      {startDate && endDate && debits.length > 0 && (
        <ScrollFade delay={60}>
          <RangeForecastCard startDate={startDate} endDate={endDate} actualByDay={actualByDay} title="Forecast vs actual spend" compact/>
        </ScrollFade>
      )}

      {/* Chronicle */}
      <ScrollFade delay={100}>
        <div id="txn-table" className="card" style={{ padding:0, overflow:'hidden' }}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 p-4" style={{ borderBottom:'1px solid var(--border)' }}>
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {[null,...chartData.map(d=>d.name)].map(cat => {
                const isAll=cat===null, active=isAll?activeCat===null:activeCat===cat
                const color=isAll?'var(--brand)':getColor(cat)
                return (
                  <button key={cat??'__all__'}
                    onClick={() => { setActiveCat(isAll?null:cat); if (!isAll) setTypeFilter('Debit') }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={{ background:active?`color-mix(in srgb, ${color} 15%, transparent)`:'transparent',
                      border:`1px solid ${active?color:'var(--border)'}`, color:active?color:'var(--text-3)' }}>
                    {!isAll && <span className="w-1.5 h-1.5 rounded-full" style={{ background:color }}/>}
                    {isAll?'All':cat}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {showGroups && months.length > 1 && (
                <button onClick={toggleAllMonths}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                  style={{ background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text-3)' }}
                  onMouseEnter={e=>{e.currentTarget.style.color='var(--text)';e.currentTarget.style.borderColor='var(--border-2)'}}
                  onMouseLeave={e=>{e.currentTarget.style.color='var(--text-3)';e.currentTarget.style.borderColor='var(--border)'}}>
                  {allMonthsExpanded ? <><Minus size={11}/> Collapse</> : <><ChevronDown size={11}/> Expand months</>}
                </button>
              )}
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border:'1px solid var(--border)', background:'var(--surface-2)' }}>
                {['All','Debit','Credit'].map(f => (
                  <button key={f} onClick={() => setTypeFilter(f)} className="px-2.5 py-1.5 text-xs font-medium transition-all"
                    style={typeFilter===f
                      ? {background:f==='Debit'?'rgba(239,68,68,0.18)':f==='Credit'?'rgba(52,211,153,0.18)':'var(--brand)',color:f==='Debit'?'#f87171':f==='Credit'?'#34d399':'white'}
                      : {color:'var(--text-3)',background:'transparent'}}>
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-xs" style={{ color:'var(--text-3)' }}>{filtered.length}</span>
              <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm outline-none"
                style={{ background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)', width:160 }}/>
            </div>
          </div>

          {/* Flat sort header */}
          {!showGroups && (
            <div style={{ borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-1"/>
                    <th style={{ paddingLeft:12, paddingTop:10, paddingBottom:10, paddingRight:16, width:90 }}>
                      <button onClick={()=>handleSort('date')} className="flex items-center gap-1"
                        style={{ fontSize:11, color:sort.field==='date'?'var(--brand)':'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.05em', cursor:'pointer' }}>
                        Date {sort.field==='date'?sort.dir==='asc'?<ChevronUp size={11}/>:<ChevronDown size={11}/>:<ChevronsUpDown size={10} style={{ opacity:0.4 }}/>}
                      </button>
                    </th>
                    <SortHeader label="Description" field="description" sort={sort} onSort={handleSort}/>
                    <SortHeader label="Category" field="category" sort={sort} onSort={handleSort}/>
                    <th className="text-left pb-2.5 pr-4" style={{ color:'var(--text-3)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em' }}>Type</th>
                    <SortHeader label="Amount" field="amount" sort={sort} onSort={handleSort}/>
                    <th className="w-10"/>
                  </tr>
                </thead>
              </table>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div className="p-8"><FianaApiLoader text="Loading transactions…"/></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-14 text-sm" style={{ color:'var(--text-3)' }}>No transactions match your filters</p>
          ) : showGroups ? (
            <div>
              {months.map(month => (
                <MonthSection key={month.monthKey}
                  month={month} maxMonthVal={maxMonthVal} maxWeekVal={maxWeekVal}
                  isExpanded={expandedMonths.has(month.monthKey)}
                  onToggle={() => toggleMonth(month.monthKey)}
                  expandedWeeks={expandedWeeks} onToggleWeek={toggleWeek}
                  rowProps={rowProps}/>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>{flatSorted.map(t => <TxnRow key={t.id} t={t} {...rowProps}/>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollFade>

      {modalOpen && <TxnModal txn={editingTxn} onClose={()=>{setModalOpen(false);setEditingTxn(null)}} onSaved={handleSaved}/>}
      {confirmTxn && (
        <ConfirmDialog title="Delete transaction?"
          message={`"${confirmTxn.description}" on ${confirmTxn.transactionDate} will be permanently removed.`}
          confirmLabel="Delete" onConfirm={()=>handleDelete(confirmTxn)} onCancel={()=>setConfirmTxn(null)}/>
      )}
      {flaggingTxn && (
        <FlagReasonDialog txn={flaggingTxn}
          loading={togglingAnomaly === flaggingTxn.id}
          onCancel={() => setFlaggingTxn(null)}
          onConfirm={reason => handleAnomaly(flaggingTxn, reason)}/>
      )}
    </div>
  )
}
