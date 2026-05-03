import { useState, useEffect, useCallback } from 'react'
import { aiApi } from '../utils/api'
import {
  RefreshCw, Sparkles, Zap, CheckCircle2, Circle, Copy,
  Lightbulb,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekKey() {
  const now = new Date()
  return `coach_${getYear(now)}_W${String(getISOWeek(now)).padStart(2, '0')}`
}

function weekRange() {
  const now = new Date()
  return `${format(startOfISOWeek(now), 'MMM d')} – ${format(endOfISOWeek(now), 'MMM d, yyyy')}`
}

function inferCategory(text) {
  const t = (text || '').toLowerCase()
  if (/cut|reduc|less|lower|stop|avoid|limit|skip/.test(t)) return 'Reduce'
  if (/save|set aside|transfer|put away|stash|build/.test(t)) return 'Save'
  if (/habit|routine|track|monitor|review|check/.test(t)) return 'Habit'
  if (/goal|target|aim|plan|budget/.test(t))               return 'Goal'
  if (/warning|alert|watch|careful|over/.test(t))          return 'Warning'
  return 'Tip'
}

function normalizeTip(tip) {
  if (typeof tip === 'string') return { text: tip, category: inferCategory(tip), impact: 'medium' }
  return {
    text:     tip.text     || '',
    category: tip.category || inferCategory(tip.text || ''),
    impact:   tip.impact   || 'medium',
  }
}

const doneStorageKey = () => `done_${weekKey()}`
function loadDone() {
  try { return new Set(JSON.parse(localStorage.getItem(doneStorageKey()) || '[]')) }
  catch { return new Set() }
}
function saveDone(set) {
  localStorage.setItem(doneStorageKey(), JSON.stringify([...set]))
}

function fmt0(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) }

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
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Week of {weekRange()}</p>
      </div>
    </div>
  )
}

function TipCard({ tip, index, done, onToggleDone, onCopy }) {
  const norm    = normalizeTip(tip)
  const catCfg  = CATEGORY_CONFIG[norm.category] || CATEGORY_CONFIG.Tip
  const impCfg  = IMPACT_CONFIG[norm.impact]     || IMPACT_CONFIG.medium
  const cardColor = CARD_COLORS[index % CARD_COLORS.length]
  const cardBg    = CARD_BG[index % CARD_BG.length]

  return (
    <div className="card card-i flex gap-4 h-full"
      style={{ opacity: done ? 0.5 : 1, transition: 'opacity 0.2s' }}>
      {/* Icon circle */}
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

          {/* Copy */}
          <button
            onClick={() => onCopy(norm.text, index)}
            title="Copy tip"
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            <Copy size={12} />
          </button>

          {/* Done toggle */}
          <button
            onClick={() => onToggleDone(index)}
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
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const [tips, setTips]       = useState([])
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [timing, setTiming]   = useState(null)
  const [cached, setCached]   = useState(false)
  const [done, setDone]       = useState(() => loadDone())

  const fetchTips = async (forceRefresh = false) => {
    const key = weekKey()
    if (!forceRefresh) {
      const stored = localStorage.getItem(key)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setTips(parsed.tips || [])
          setContext(parsed.context || null)
          setTiming(parsed.gemma_ms || null)
          setCached(true)
          return
        } catch { /* stale — re-fetch */ }
      }
    }
    setLoading(true)
    setTips([])
    setContext(null)
    setCached(false)
    try {
      const { data } = await aiApi.coach()
      const tips    = data.tips    || []
      const context = data.context || null
      setTips(tips)
      setContext(context)
      setTiming(data.timing?.gemma_ms || null)
      localStorage.setItem(key, JSON.stringify({ tips, context, gemma_ms: data.timing?.gemma_ms }))
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

  const doneCount = [...done].filter(i => i < tips.length).length
  const totalTips = tips.length

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
                content="Gemma 3 generates 5 personalized tips from your transactions this week. Each tip includes a category (Reduce / Save / Habit / Goal / Warning) and impact level. Results are cached for the week — use Refresh to regenerate."
              />
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
              {totalTips > 0
                ? `${weekRange()} · ${doneCount}/${totalTips} completed`
                : `${weekRange()} · Personalized tips from Fiana AI`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5"
              style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <Sparkles size={11} /> Fiana AI
            </span>
            {cached && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                cached this week
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

      {/* ── Spending context ── */}
      {context && !loading && (
        <ScrollFade delay={40}>
          <ContextCard ctx={context} />
        </ScrollFade>
      )}

      {/* ── Loader ── */}
      {loading && <AiLoader type="coach" title="Fiana · Weekly Coach" />}

      {/* ── Progress bar ── */}
      {!loading && totalTips > 0 && (
        <ScrollFade delay={55}>
          <div className="flex items-center gap-3">
            <div className="flex-1 progress-track">
              <div className="progress-fill"
                style={{ width: `${totalTips > 0 ? (doneCount / totalTips) * 100 : 0}%`, background: '#10b981' }} />
            </div>
            <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--text-3)' }}>
              {doneCount}/{totalTips} done
            </span>
          </div>
        </ScrollFade>
      )}

      {/* ── Tip cards — 2-column grid ── */}
      {!loading && tips.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tips.map((tip, i) => (
            <ScrollFade key={i} delay={i * 60}>
              <TipCard
                tip={tip}
                index={i}
                done={done.has(i)}
                onToggleDone={handleToggleDone}
                onCopy={handleCopy}
              />
            </ScrollFade>
          ))}
        </div>
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
