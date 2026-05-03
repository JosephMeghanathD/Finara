import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { aiApi } from '../utils/api'
import {
  RefreshCw, Sparkles, Zap, CheckCircle2, Circle, Copy,
  Lightbulb, ChevronDown, ChevronUp, MessageCircle, Flame,
  AlertTriangle, TrendingDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import AiLoader from '../components/AiLoader'
import { format, getISOWeek, getYear, startOfISOWeek, endOfISOWeek } from 'date-fns'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

// ── Config ────────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  Reduce:  { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)' },
  Save:    { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)' },
  Habit:   { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)' },
  Goal:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)' },
  Warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  Tip:     { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)' },
}

const IMPACT_CONFIG = {
  high:   { color: '#10b981', label: 'High impact' },
  medium: { color: '#f59e0b', label: 'Med impact'  },
  low:    { color: '#6b7194', label: 'Low impact'  },
}

const CARD_COLORS = ['#6366F1', '#8B5CF6', '#0EA5E9', '#F59E0B', '#10B981']
const CARD_BG     = ['var(--brand-light)', 'rgba(139,92,246,0.08)', 'rgba(14,165,233,0.08)',
                     'rgba(245,158,11,0.08)', 'rgba(16,185,129,0.08)']
const CARD_ICONS  = ['💡', '🎯', '📊', '💰', '🏦']
const ALL_CATS    = ['Reduce', 'Save', 'Habit', 'Goal', 'Warning']

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekKey() {
  const now = new Date()
  return `coach_${getYear(now)}_W${String(getISOWeek(now)).padStart(2, '0')}`
}

function weekRangeLabel(date = new Date()) {
  return `${format(startOfISOWeek(date), 'MMM d')} – ${format(endOfISOWeek(date), 'MMM d, yyyy')}`
}

function inferCategory(text) {
  const t = (text || '').toLowerCase()
  if (/cut|reduc|less|lower|stop|avoid|limit|skip/.test(t)) return 'Reduce'
  if (/save|set aside|transfer|put away|stash|build/.test(t)) return 'Save'
  if (/habit|routine|track|monitor|review|check/.test(t))    return 'Habit'
  if (/goal|target|aim|plan|budget/.test(t))                 return 'Goal'
  if (/warning|alert|watch|careful|over/.test(t))            return 'Warning'
  return 'Tip'
}

function normalizeTip(tip) {
  if (typeof tip === 'string') return { text: tip, category: inferCategory(tip), impact: 'medium', how_to: '' }
  return {
    text:     tip.text     || '',
    category: tip.category || inferCategory(tip.text || ''),
    impact:   tip.impact   || 'medium',
    how_to:   tip.how_to   || '',
  }
}

function fmt0(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) }

// ── Done state ────────────────────────────────────────────────────────────────

const doneStorageKey = () => `done_${weekKey()}`
function loadDone() {
  try { return new Set(JSON.parse(localStorage.getItem(doneStorageKey()) || '[]')) }
  catch { return new Set() }
}
function saveDone(set) {
  localStorage.setItem(doneStorageKey(), JSON.stringify([...set]))
}

// ── Archive ───────────────────────────────────────────────────────────────────

const ARCHIVE_KEY = 'coach_archive'
const MAX_ARCHIVE = 8

function loadArchive() {
  try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]') }
  catch { return [] }
}

function saveToArchive(wk, weekLabel, tips, context) {
  try {
    const archive = loadArchive()
    const idx = archive.findIndex(a => a.week === wk)
    const entry = { week: wk, weekLabel, tips, context }
    if (idx >= 0) archive[idx] = entry
    else archive.unshift(entry)
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.slice(0, MAX_ARCHIVE)))
  } catch {}
}

function getStreak(archive) {
  // Count consecutive completed weeks (most recent first, excluding current)
  const current = weekKey()
  const past = [...archive]
    .filter(a => a.week !== current)
    .sort((a, b) => b.week.localeCompare(a.week))
  let streak = 0
  for (const entry of past) {
    try {
      const done  = new Set(JSON.parse(localStorage.getItem(`done_${entry.week}`) || '[]'))
      const total = (entry.tips || []).length
      if (total > 0 && done.size >= total) streak++
      else break
    } catch { break }
  }
  return streak
}

function getRecurringCategories(archive) {
  const current = weekKey()
  const past = [...archive]
    .filter(a => a.week !== current)
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 3)
  if (past.length < 2) return []
  const counts = {}
  past.forEach(entry => {
    const cats = new Set((entry.tips || []).map(t => normalizeTip(t).category))
    cats.forEach(c => { counts[c] = (counts[c] || 0) + 1 })
  })
  return Object.entries(counts).filter(([, n]) => n >= past.length).map(([c]) => c)
}

function parseSavingsEstimate(tips) {
  let total = 0
  tips.forEach(tip => {
    const norm = normalizeTip(tip)
    const match = norm.text.match(/\$[\d,]+(?:\.\d{2})?/)
    if (match) {
      const val = parseFloat(match[0].replace(/[$,]/g, ''))
      if (!isNaN(val) && val > 0 && val < 10000) total += val
    }
  })
  return total
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ContextCard({ ctx }) {
  if (!ctx || ctx.total === 0) return null
  const over = ctx.vs_avg_pct > 0
  return (
    <div className="card card-accent flex flex-wrap items-center gap-6 px-5 py-4">
      <div>
        <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-3)' }}>Spent this week</p>
        <p className="stat-value" style={{ fontSize: '1.25rem' }}>${fmt0(ctx.total)}</p>
      </div>
      {ctx.vs_avg_pct !== 0 && (
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-3)' }}>vs 4-week avg</p>
          <p className="text-lg font-bold" style={{ color: over ? '#f87171' : '#34d399' }}>
            {over ? '+' : ''}{Number(ctx.vs_avg_pct).toFixed(0)}%
          </p>
        </div>
      )}
      {ctx.income > 0 && (
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-3)' }}>Income</p>
          <p className="text-lg font-bold" style={{ color: '#34d399' }}>${fmt0(ctx.income)}</p>
        </div>
      )}
      {ctx.top_category && (
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-3)' }}>Top category</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{ctx.top_category}</p>
        </div>
      )}
      <div className="ml-auto">
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Week of {weekRangeLabel()}</p>
      </div>
    </div>
  )
}

function FilterChips({ active, onSelect, tips }) {
  const available = ALL_CATS.filter(c => tips.some(t => normalizeTip(t).category === c))
  if (available.length < 2) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>Filter:</span>
      <button
        onClick={() => onSelect(null)}
        className="text-xs px-2.5 py-1 rounded-full font-medium transition-all"
        style={{
          background: active === null ? 'var(--brand)' : 'var(--surface-2)',
          color: active === null ? 'white' : 'var(--text-3)',
          border: `1px solid ${active === null ? 'var(--brand)' : 'var(--border)'}`,
        }}>
        All
      </button>
      {available.map(cat => {
        const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.Tip
        const isActive = active === cat
        return (
          <button
            key={cat}
            onClick={() => onSelect(isActive ? null : cat)}
            className="text-xs px-2.5 py-1 rounded-full font-medium transition-all"
            style={{
              background: isActive ? cfg.bg : 'var(--surface-2)',
              color: isActive ? cfg.color : 'var(--text-3)',
              border: `1px solid ${isActive ? cfg.border : 'var(--border)'}`,
            }}>
            {cat}
          </button>
        )
      })}
    </div>
  )
}

function TipCard({ tip, index, done, onToggleDone, onCopy }) {
  const [expanded, setExpanded] = useState(false)
  const norm    = normalizeTip(tip)
  const catCfg  = CATEGORY_CONFIG[norm.category] || CATEGORY_CONFIG.Tip
  const impCfg  = IMPACT_CONFIG[norm.impact]     || IMPACT_CONFIG.medium
  const cardBg  = CARD_BG[index % CARD_BG.length]

  return (
    <div className="card card-i flex gap-4 h-full"
      style={{ opacity: done ? 0.5 : 1, transition: 'opacity 0.2s' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
        style={{ background: cardBg }}>
        {CARD_ICONS[index % CARD_ICONS.length]}
      </div>

      <div className="flex-1 min-w-0">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>
            {norm.category}
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: impCfg.color }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: impCfg.color }} />
            {impCfg.label}
          </span>
          <div className="flex-1" />
          {/* Ask Fiana */}
          <Link
            to="/chat"
            state={{ prefillMessage: `Tell me more about this tip: "${norm.text}"` }}
            title="Ask Fiana about this tip"
            className="p-1 rounded transition-colors flex items-center"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--brand)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            <MessageCircle size={12} />
          </Link>
          {/* Copy */}
          <button onClick={() => onCopy(norm.text)} title="Copy tip"
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            <Copy size={12} />
          </button>
          {/* Done toggle */}
          <button onClick={() => onToggleDone(index)}
            title={done ? 'Mark undone' : 'Mark as done'}
            className="p-1 rounded transition-colors"
            style={{ color: done ? '#10b981' : 'var(--text-3)' }}
            onMouseEnter={e => e.currentTarget.style.color = done ? '#34d399' : '#10b981'}
            onMouseLeave={e => e.currentTarget.style.color = done ? '#10b981' : 'var(--text-3)'}>
            {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
          </button>
        </div>

        {/* Tip text */}
        <p style={{
          fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
          fontSize: '0.9rem', lineHeight: 1.75,
          color: done ? 'var(--text-3)' : 'var(--text-2)',
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {norm.text}
        </p>

        {/* How-to action step */}
        {norm.how_to && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: catCfg.color }}>
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? 'Hide action step' : 'How to act on this'}
            </button>
            {expanded && (
              <div className="mt-1.5 px-3 py-2 rounded-lg text-xs leading-relaxed"
                style={{ background: catCfg.bg, color: 'var(--text-2)', border: `1px solid ${catCfg.border}` }}>
                {norm.how_to}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ArchiveSection({ archive }) {
  const [open, setOpen] = useState(false)
  const current = weekKey()
  const past = [...archive]
    .filter(a => a.week !== current)
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 4)
  if (past.length === 0) return null

  return (
    <div className="card">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setOpen(v => !v)}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Previous weeks
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{past.length} week{past.length !== 1 ? 's' : ''}</span>
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />}
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {past.map(entry => {
            let doneSet = new Set()
            try { doneSet = new Set(JSON.parse(localStorage.getItem(`done_${entry.week}`) || '[]')) }
            catch {}
            const total     = (entry.tips || []).length
            const doneCount = [...doneSet].filter(i => i < total).length
            const allDone   = total > 0 && doneCount === total

            return (
              <div key={entry.week}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                    {entry.weekLabel || entry.week}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: allDone ? 'rgba(16,185,129,0.1)' : 'var(--surface-2)',
                      color: allDone ? '#34d399' : 'var(--text-3)',
                    }}>
                    {allDone ? '✓ All done' : `${doneCount}/${total} done`}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {(entry.tips || []).map((tip, i) => {
                    const norm   = normalizeTip(tip)
                    const catCfg = CATEGORY_CONFIG[norm.category] || CATEGORY_CONFIG.Tip
                    const wasDone = doneSet.has(i)
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded-lg"
                        style={{ background: 'var(--surface-2)', opacity: wasDone ? 0.6 : 1 }}>
                        <span className="font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                          style={{ background: catCfg.bg, color: catCfg.color, fontSize: '0.65rem' }}>
                          {norm.category}
                        </span>
                        <span style={{ color: wasDone ? 'var(--text-3)' : 'var(--text-2)',
                          textDecoration: wasDone ? 'line-through' : 'none', lineHeight: 1.6 }}>
                          {norm.text}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const [tips, setTips]             = useState([])
  const [context, setContext]       = useState(null)
  const [loading, setLoading]       = useState(false)
  const [timing, setTiming]         = useState(null)
  const [cached, setCached]         = useState(false)
  const [done, setDone]             = useState(() => loadDone())
  const [archive, setArchive]       = useState(() => loadArchive())
  const [activeFilter, setFilter]   = useState(null)
  const [showCelebration, setCelebration] = useState(false)
  const celebratedRef               = useRef(false)

  // Mark coach page as visited (for mid-week nudge)
  useEffect(() => {
    localStorage.setItem(`coach_visited_${weekKey()}`, '1')
  }, [])

  // Celebration when all tips done
  useEffect(() => {
    if (tips.length > 0 && done.size >= tips.length && !celebratedRef.current) {
      celebratedRef.current = true
      setCelebration(true)
      setTimeout(() => setCelebration(false), 5000)
    }
  }, [done.size, tips.length])

  const fetchTips = async (forceRefresh = false) => {
    const key = weekKey()
    if (!forceRefresh) {
      const stored = localStorage.getItem(key)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          const t = parsed.tips || []
          const c = parsed.context || null
          setTips(t)
          setContext(c)
          setTiming(parsed.gemma_ms || null)
          setCached(true)
          saveToArchive(key, weekRangeLabel(), t, c)
          setArchive(loadArchive())
          return
        } catch {}
      }
    }
    setLoading(true)
    setTips([])
    setContext(null)
    setCached(false)
    celebratedRef.current = false
    try {
      const { data } = await aiApi.coach()
      const t = data.tips    || []
      const c = data.context || null
      setTips(t)
      setContext(c)
      setTiming(data.timing?.gemma_ms || null)
      localStorage.setItem(key, JSON.stringify({ tips: t, context: c, gemma_ms: data.timing?.gemma_ms }))
      saveToArchive(key, weekRangeLabel(), t, c)
      setArchive(loadArchive())
    } catch {
      toast.error("Fiana's off the clock — is the AI service running?")
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchTips() }, [])

  const handleToggleDone = useCallback((i) => {
    setDone(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      saveDone(next)
      return next
    })
  }, [])

  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Tip copied!'))
  }, [])

  const doneCount       = [...done].filter(i => i < tips.length).length
  const totalTips       = tips.length
  const streak          = getStreak(archive)
  const recurringCats   = getRecurringCategories(archive)
  const savingsEstimate = parseSavingsEstimate(tips)

  const filteredTips = activeFilter
    ? tips.map((t, i) => ({ tip: t, origIndex: i })).filter(({ tip }) => normalizeTip(tip).category === activeFilter)
    : tips.map((t, i) => ({ tip: t, origIndex: i }))

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <ScrollFade delay={0}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Weekly Coach</h2>
              <InfoTooltip
                title="Weekly Coach"
                content="Gemma 3 generates 5 personalized spending tips from your transactions this week. Each tip includes a category, impact level, and an action step. Results are cached for the week — Refresh to regenerate."
              />
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
              {totalTips > 0
                ? `${weekRangeLabel()} · ${doneCount}/${totalTips} completed`
                : `${weekRangeLabel()} · Personalized tips from Fiana AI`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Streak badge */}
            {streak > 0 && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-semibold"
                style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.25)' }}>
                <Flame size={11} /> {streak} week streak
              </span>
            )}
            <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5"
              style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Sparkles size={11} /> Fiana AI
            </span>
            {cached && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                cached
              </span>
            )}
            {timing && !cached && (
              <span className="text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(16,185,129,0.08)', color: '#34d399' }}>
                <Zap size={9} /> {(timing / 1000).toFixed(1)}s
              </span>
            )}
            <button onClick={() => fetchTips(true)} disabled={loading} className="btn-ghost text-sm flex items-center gap-1.5">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </ScrollFade>

      {/* ── Recurring pattern warning ── */}
      {recurringCats.length > 0 && !loading && (
        <ScrollFade delay={30}>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)' }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>Persistent pattern detected</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                <span className="font-medium" style={{ color: 'var(--text-2)' }}>
                  {recurringCats.join(', ')}
                </span>{' '}
                tips have appeared for 2+ consecutive weeks — these habits may need more attention.
              </p>
            </div>
          </div>
        </ScrollFade>
      )}

      {/* ── Spending context ── */}
      {context && !loading && (
        <ScrollFade delay={40}>
          <ContextCard ctx={context} />
        </ScrollFade>
      )}

      {/* ── Loader ── */}
      {loading && <AiLoader type="coach" title="Fiana · Weekly Coach" />}

      {/* ── Savings estimate + progress bar ── */}
      {!loading && totalTips > 0 && (
        <ScrollFade delay={55}>
          <div className="flex items-center gap-4 flex-wrap">
            {savingsEstimate > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' }}>
                <TrendingDown size={12} />
                <span>Following all tips could save <strong>~${fmt0(savingsEstimate)}</strong> cited in advice</span>
              </div>
            )}
            <div className="flex flex-1 items-center gap-3 min-w-[180px]">
              <div className="flex-1 progress-track">
                <div className="progress-fill"
                  style={{
                    width: `${totalTips > 0 ? (doneCount / totalTips) * 100 : 0}%`,
                    background: doneCount === totalTips ? '#10b981' : 'var(--brand)',
                  }} />
              </div>
              <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                {doneCount}/{totalTips} done
              </span>
            </div>
          </div>
        </ScrollFade>
      )}

      {/* ── All-done celebration banner ── */}
      {showCelebration && (
        <div className="px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2"
          style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}>
          🎉 You completed all your tips this week — great work!
          <button onClick={() => setCelebration(false)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Filter chips ── */}
      {!loading && totalTips > 0 && (
        <ScrollFade delay={60}>
          <FilterChips active={activeFilter} onSelect={setFilter} tips={tips} />
        </ScrollFade>
      )}

      {/* ── Tip cards — 2-column grid ── */}
      {!loading && filteredTips.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTips.map(({ tip, origIndex }) => (
            <ScrollFade key={origIndex} delay={origIndex * 60}>
              <TipCard
                tip={tip}
                index={origIndex}
                done={done.has(origIndex)}
                onToggleDone={handleToggleDone}
                onCopy={handleCopy}
              />
            </ScrollFade>
          ))}
        </div>
      )}

      {/* No tips match filter */}
      {!loading && tips.length > 0 && filteredTips.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>No tips in this category this week.</p>
        </div>
      )}

      {/* ── Previous weeks archive ── */}
      {!loading && (
        <ScrollFade delay={80}>
          <ArchiveSection archive={archive} />
        </ScrollFade>
      )}

      {/* ── Empty state ── */}
      {!loading && tips.length === 0 && (
        <ScrollFade>
          <div className="card text-center py-12">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ background: 'var(--brand-light)' }}>
              <Lightbulb size={22} style={{ color: 'var(--brand)' }} />
            </div>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>No tips yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              Upload some transaction data to get personalized coaching
            </p>
          </div>
        </ScrollFade>
      )}
    </div>
  )
}
