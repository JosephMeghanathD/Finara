import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { aiApi } from '../utils/api'
import {
  RefreshCw, Sparkles, Zap, CheckCircle2, Circle, Copy,
  Lightbulb, ChevronDown, ChevronUp, MessageCircle, Flame,
  AlertTriangle, TrendingDown, TrendingUp, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, getISOWeek, getYear, startOfISOWeek, endOfISOWeek, formatDistanceToNow, parseISO, getISODay } from 'date-fns'
import ScrollFade from '../components/ScrollFade'

// ── Config ────────────────────────────────────────────────────────────────────

const CAT_CONFIG = {
  Reduce:  { color: '#f97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.25)',  glyph: '↓' },
  Save:    { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  glyph: '↑' },
  Habit:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)', glyph: '⟳' },
  Goal:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)',  glyph: '◎' },
  Warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  glyph: '⚠' },
  Tip:     { color: '#818cf8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.25)', glyph: '●' },
}

const IMPACT_COLOR = { high: '#10b981', medium: '#f59e0b', low: '#6b7194' }
const ALL_CATS     = ['Reduce', 'Save', 'Habit', 'Goal', 'Warning']
const DAY_LABELS   = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

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

// Chat treats every message as a data question, so the prefill has to read like
// one. A bare "tell me more about this tip" gave the planner nothing to fetch and
// the model answered that it couldn't see how tips are generated.
//
// The category is deliberately NOT named here: the tip prose already carries the
// real category name (tips are generated from live category totals, and the
// backend matches category names exactly), so the planner reads it from the quote.
function tipPrefill(norm) {
  const how = norm.how_to ? ` It suggests: "${norm.how_to}"` : ''
  return `My Finara weekly coach tip says: "${norm.text || ''}"${how} ` +
         'Break down the spending behind this tip by merchant, show how it has trended ' +
         'over the last 6 months, and give me specific ways to act on it.'
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

const doneStorageKey = () => `done_${weekKey()}`
function loadDone()     { try { return new Set(JSON.parse(localStorage.getItem(doneStorageKey()) || '[]')) } catch { return new Set() } }
function saveDone(set)  { localStorage.setItem(doneStorageKey(), JSON.stringify([...set])) }

const ARCHIVE_KEY = 'coach_archive'
const MAX_ARCHIVE = 8

function loadArchive() { try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]') } catch { return [] } }

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
  const current = weekKey()
  const past = [...archive].filter(a => a.week !== current).sort((a, b) => b.week.localeCompare(a.week))
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
  const past = [...archive].filter(a => a.week !== current).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 3)
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
    const norm  = normalizeTip(tip)
    const match = norm.text.match(/\$[\d,]+(?:\.\d{2})?/)
    if (match) {
      const val = parseFloat(match[0].replace(/[$,]/g, ''))
      if (!isNaN(val) && val > 0 && val < 10000) total += val
    }
  })
  return total
}

function fmtAge(iso) {
  if (!iso) return null
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }) }
  catch { return null }
}

// ── Week Day Progress ─────────────────────────────────────────────────────────

function WeekDayDots() {
  const today = getISODay(new Date())  // 1=Mon, 7=Sun
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {DAY_LABELS.map((label, i) => {
        const day     = i + 1
        const isToday = day === today
        const isPast  = day < today
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: isToday ? 8 : 6,
              height: isToday ? 8 : 6,
              borderRadius: '50%',
              background: isToday ? 'var(--brand)' : isPast ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
              boxShadow: isToday ? '0 0 6px var(--brand)' : 'none',
              transition: 'all 0.2s',
            }} />
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 7,
              color: isToday ? 'var(--brand)' : isPast ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)',
              lineHeight: 1, fontWeight: isToday ? 700 : 400,
            }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Cache freshness badge ─────────────────────────────────────────────────────

function FreshnessBadge({ generatedAt, cached }) {
  const age = fmtAge(generatedAt)
  if (!age) return null

  const hoursOld = generatedAt
    ? (Date.now() - new Date(generatedAt).getTime()) / 3600000
    : 999
  const isStale  = hoursOld > 48
  const color    = isStale ? '#f59e0b' : '#10b981'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6,
      background: `${color}0F`, border: `1px solid ${color}28`,
      flexShrink: 0,
    }}>
      <Clock size={9} style={{ color }} />
      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color, fontWeight: 600 }}>
        {age}
      </span>
    </div>
  )
}

// ── Progress Ring ─────────────────────────────────────────────────────────────

function ProgressRing({ done, total }) {
  const r    = 36
  const circ = 2 * Math.PI * r
  const pct  = total > 0 ? done / total : 0
  const dash = circ * pct
  const allDone = done === total && total > 0
  const stroke  = allDone ? '#10b981' : '#5b9bff'

  return (
    <svg width="96" height="96" viewBox="0 0 96 96" style={{ overflow: 'visible' }}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="5.5" />
      <circle cx="48" cy="48" r={r} fill="none"
        stroke={stroke} strokeWidth="5.5" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s' }}
      />
      {pct > 0 && pct < 1 && (
        <circle
          cx={48 + r * Math.cos((pct * 2 * Math.PI) - Math.PI / 2)}
          cy={48 + r * Math.sin((pct * 2 * Math.PI) - Math.PI / 2)}
          r="4" fill={stroke}
          style={{ filter: `drop-shadow(0 0 4px ${stroke})` }}
        />
      )}
      <text x="48" y="44" textAnchor="middle" fill="var(--text)"
        fontSize="22" fontWeight="800" fontFamily="Manrope" dominantBaseline="middle">
        {done}
      </text>
      <text x="48" y="60" textAnchor="middle" fill="var(--text-3)"
        fontSize="11" fontFamily="DM Sans" dominantBaseline="middle">
        of {total}
      </text>
    </svg>
  )
}

// ── Tip Card ──────────────────────────────────────────────────────────────────

function TipCard({ tip, index, done, onToggleDone, onCopy }) {
  const norm    = normalizeTip(tip)
  const cfg     = CAT_CONFIG[norm.category] || CAT_CONFIG.Tip
  const num     = String(index + 1).padStart(2, '0')
  const impDots = norm.impact === 'high' ? 3 : norm.impact === 'medium' ? 2 : 1
  const impClr  = IMPACT_COLOR[norm.impact] || IMPACT_COLOR.medium
  const impLbl  = norm.impact === 'high' ? 'High' : norm.impact === 'medium' ? 'Medium' : 'Low'

  return (
    <div className="tip-slide-in" style={{ animationDelay: `${index * 65}ms` }}>
      <div style={{
        display:    'flex',
        background: 'var(--surface)',
        border:     `1px solid ${done ? 'var(--border)' : cfg.border}`,
        borderRadius: 14,
        overflow:   'hidden',
        opacity:    done ? 0.5 : 1,
        transition: 'opacity 0.25s ease, border-color 0.25s ease',
        boxShadow:  done ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.35)',
      }}>
        {/* Number column */}
        <div style={{
          width: 76, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: done ? 'var(--surface-2)' : cfg.bg,
          borderRight: `1px solid ${done ? 'var(--border)' : cfg.border}`,
          padding: '24px 0', gap: 6, transition: 'background 0.25s',
          position: 'relative', overflow: 'hidden',
        }}>
          <span aria-hidden style={{
            position: 'absolute', fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 72, lineHeight: 1, color: cfg.color, opacity: 0.06,
            userSelect: 'none', bottom: -8, right: -4,
          }}>{num}</span>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, lineHeight: 1,
            color: done ? '#10b981' : cfg.color, letterSpacing: 1,
            transition: 'color 0.25s', zIndex: 1,
          }}>
            {done ? '✓' : num}
          </span>
          {!done && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: cfg.color, opacity: 0.7,
              fontFamily: "'Manrope', sans-serif", letterSpacing: '0.05em', zIndex: 1,
            }}>
              {cfg.glyph}
            </span>
          )}
        </div>

        {/* Content column */}
        <div style={{ flex: 1, minWidth: 0, padding: '18px 20px 18px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'Manrope', sans-serif", fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderRadius: 4, padding: '2px 7px',
            }}>
              {norm.category}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {[0,1,2].map(d => (
                <div key={d} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: d < impDots ? impClr : 'var(--surface-3)',
                  transition: 'background 0.2s',
                }} />
              ))}
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4, fontFamily: "'DM Sans', sans-serif" }}>
                {impLbl} impact
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <Link
              to="/chat"
              state={{ prefillMessage: tipPrefill(norm) }}
              title="Ask Finara about this tip"
              style={{ color: 'var(--text-3)', padding: '4px', lineHeight: 0, display: 'flex', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--brand)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
              <MessageCircle size={13} />
            </Link>
            <button onClick={() => onCopy(norm.text)} title="Copy tip"
              style={{ color: 'var(--text-3)', padding: '4px', lineHeight: 0, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
              <Copy size={13} />
            </button>
            <button onClick={() => onToggleDone(index)} title={done ? 'Mark undone' : 'Mark done'}
              style={{ color: done ? '#10b981' : 'var(--text-3)', padding: '4px', lineHeight: 0, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = done ? '#34d399' : '#10b981'}
              onMouseLeave={e => e.currentTarget.style.color = done ? '#10b981' : 'var(--text-3)'}>
              {done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </button>
          </div>

          <p style={{
            fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
            fontSize: '0.9rem', lineHeight: 1.78,
            color: done ? 'var(--text-3)' : 'var(--text-2)',
            textDecoration: done ? 'line-through' : 'none',
            marginBottom: norm.how_to && !done ? 12 : 0,
          }}>
            {norm.text}
          </p>

          {norm.how_to && !done && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '9px 12px', borderRadius: 8,
              background: cfg.bg, border: `1px solid ${cfg.border}`,
            }}>
              <Zap size={11} style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-2)', margin: 0 }}>
                {norm.how_to}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Archive ───────────────────────────────────────────────────────────────────

function ArchiveSection({ archive }) {
  const [open, setOpen] = useState(false)
  const current = weekKey()
  const past = [...archive].filter(a => a.week !== current).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 4)
  if (past.length === 0) return null

  return (
    <div className="card">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(v => !v)}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Previous weeks</span>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{past.length} week{past.length !== 1 ? 's' : ''}</span>
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />}
        </div>
      </button>

      {open && (
        <div className="mt-5 space-y-5">
          {past.map(entry => {
            let doneSet = new Set()
            try { doneSet = new Set(JSON.parse(localStorage.getItem(`done_${entry.week}`) || '[]')) } catch {}
            const total     = (entry.tips || []).length
            const doneCount = [...doneSet].filter(i => i < total).length
            const allDone   = total > 0 && doneCount === total

            return (
              <div key={entry.week}>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                    {entry.weekLabel || entry.week}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: allDone ? 'rgba(16,185,129,0.1)' : 'var(--surface-2)', color: allDone ? '#34d399' : 'var(--text-3)' }}>
                    {allDone ? '✓ All done' : `${doneCount}/${total} done`}
                  </span>
                </div>
                <div className="space-y-2">
                  {(entry.tips || []).map((tip, i) => {
                    const norm = normalizeTip(tip)
                    const cfg  = CAT_CONFIG[norm.category] || CAT_CONFIG.Tip
                    const wasDone = doneSet.has(i)
                    return (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                        style={{ background: 'var(--surface-2)', opacity: wasDone ? 0.55 : 1 }}>
                        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: cfg.color, flexShrink: 0, lineHeight: 1.6, letterSpacing: 1 }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-xs flex-shrink-0 px-1.5 py-0.5 rounded mt-0.5"
                          style={{ background: cfg.bg, color: cfg.color, fontWeight: 700, fontFamily: "'Manrope', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 9 }}>
                          {norm.category}
                        </span>
                        <span style={{ fontSize: '0.8125rem', lineHeight: 1.6, color: wasDone ? 'var(--text-3)' : 'var(--text-2)', textDecoration: wasDone ? 'line-through' : 'none', fontFamily: "'DM Sans', sans-serif" }}>
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

// ── Loader ────────────────────────────────────────────────────────────────────

function CoachLoader() {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '28px 24px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28, flexShrink: 0 }}>
          {[0, 0.13, 0.26, 0.39, 0.26, 0.13, 0].map((delay, i) => (
            <div key={i} className="wave-bar" style={{
              width: 3, height: '100%', borderRadius: 999,
              background: 'linear-gradient(180deg, var(--brand), rgba(167,139,250,0.65))',
              animationDelay: `${delay}s`, transformOrigin: 'center',
            }} />
          ))}
        </div>
        <div>
          <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 14, letterSpacing: '0.08em', color: 'var(--brand)', marginBottom: 2 }}>
            Fiana is crafting your weekly brief
          </p>
          <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-3)' }}>
            Analyzing this week's spending patterns… (~10–15s)
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 0.85, 0.92, 0.78, 0.88].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 68, borderRadius: 10, width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const [tips,       setTips]       = useState([])
  const [context,    setContext]    = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [cached,     setCached]     = useState(false)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [done,       setDone]       = useState(() => loadDone())
  const [archive,    setArchive]    = useState(() => loadArchive())
  const [activeFilter, setFilter]  = useState(null)
  const [showCelebration, setCelebration] = useState(false)
  const celebratedRef = useRef(false)

  useEffect(() => { localStorage.setItem(`coach_visited_${weekKey()}`, '1') }, [])

  useEffect(() => {
    if (tips.length > 0 && done.size >= tips.length && !celebratedRef.current) {
      celebratedRef.current = true
      setCelebration(true)
      setTimeout(() => setCelebration(false), 6000)
    }
  }, [done.size, tips.length])

  const fetchTips = async (forceRefresh = false) => {
    const key = weekKey()

    if (!forceRefresh) {
      // Try backend first
      try {
        const { data: saved } = await aiApi.coachTips(key)
        if (saved && saved.length > 0) {
          const tipsFromDb = saved.map(t => ({ id: t.id, text: t.text, category: t.category, impact: t.impact, how_to: t.how_to }))
          const doneFromDb = new Set(saved.map((t, i) => t.done ? i : null).filter(i => i !== null))
          setTips(tipsFromDb)
          setDone(doneFromDb)
          setCached(true)
          setGeneratedAt(null)
          saveToArchive(key, weekRangeLabel(), tipsFromDb, null)
          setArchive(loadArchive())
          return
        }
      } catch {}

      // Fall back to localStorage cache
      const stored = localStorage.getItem(key)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setTips(parsed.tips || [])
          setContext(parsed.context || null)
          setGeneratedAt(parsed.generatedAt || null)
          setCached(true)
          saveToArchive(key, weekRangeLabel(), parsed.tips || [], parsed.context || null)
          setArchive(loadArchive())
          return
        } catch {}
      }
    }

    // Generate fresh tips from AI
    setLoading(true); setTips([]); setContext(null); setCached(false)
    celebratedRef.current = false

    try {
      const { data } = await aiApi.coach(null, forceRefresh || undefined)
      const t  = data.tips    || []
      const c  = data.context || null
      const ts = new Date().toISOString()

      // Persist to backend (replaces existing tips for this week)
      try {
        const { data: saved } = await aiApi.saveCoachTips(key, t)
        const tipsWithIds = saved.map(bt => ({ id: bt.id, text: bt.text, category: bt.category, impact: bt.impact, how_to: bt.how_to }))
        setTips(tipsWithIds)
      } catch {
        setTips(t)
      }

      setDone(new Set()); setContext(c); setGeneratedAt(ts); setCached(false)
      localStorage.setItem(key, JSON.stringify({ tips: t, context: c, generatedAt: ts }))
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
      const nowDone = !prev.has(i)
      nowDone ? next.add(i) : next.delete(i)
      saveDone(next)
      return next
    })
    const tip = tips[i]
    if (tip?.id) {
      aiApi.toggleCoachTip(tip.id, !done.has(i)).catch(() => {})
    }
  }, [tips, done])

  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Tip copied!'))
  }, [])

  const handleRegenerate = () => {
    toast('Regenerating… this takes ~15 seconds', { icon: '⏳', duration: 4000 })
    fetchTips(true)
  }

  const doneCount       = [...done].filter(i => i < tips.length).length
  const totalTips       = tips.length
  const allDone         = totalTips > 0 && doneCount === totalTips
  const streak          = getStreak(archive)
  const recurringCats   = getRecurringCategories(archive)
  const savingsEstimate = parseSavingsEstimate(tips)

  const filteredTips = activeFilter
    ? tips.map((t, i) => ({ tip: t, origIndex: i })).filter(({ tip }) => normalizeTip(tip).category === activeFilter)
    : tips.map((t, i) => ({ tip: t, origIndex: i }))

  const catCounts    = ALL_CATS.reduce((acc, cat) => {
    acc[cat] = tips.filter(t => normalizeTip(t).category === cat).length; return acc
  }, {})
  const availableCats = ALL_CATS.filter(c => catCounts[c] > 0)
  const pctDone       = totalTips > 0 ? (doneCount / totalTips) * 100 : 0
  const ctx           = context

  return (
    <>
      <style>{`
        @keyframes tipSlideIn {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .tip-slide-in { animation: tipSlideIn 0.38s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes celebratePop {
          0%   { transform: scale(0.94); opacity: 0; }
          60%  { transform: scale(1.02); }
          100% { transform: scale(1);    opacity: 1; }
        }
        .celebrate-pop { animation: celebratePop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>

      <div className="space-y-5">

        {/* ── Header ── */}
        <ScrollFade delay={0}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, letterSpacing: '0.05em', color: 'var(--text)', lineHeight: 1 }}>
                  Weekly Coach
                </h2>
                {streak > 0 && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                    padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(249,115,22,0.1)', color: '#f97316',
                    border: '1px solid rgba(249,115,22,0.25)',
                    fontFamily: "'Manrope', sans-serif",
                  }}>
                    <Flame size={10} /> {streak} WK STREAK
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Sans' }}>
                  {weekRangeLabel()}
                </p>
                <WeekDayDots />
                {generatedAt && cached && <FreshnessBadge generatedAt={generatedAt} cached={cached} />}
              </div>
            </div>

            {/* Right actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 10, padding: '4px 10px', borderRadius: 6,
                background: 'var(--brand-light)', color: 'var(--brand)',
                border: '1px solid rgba(91,155,255,0.2)',
              }}>
                <Sparkles size={10} /> Fiana AI
              </span>

              {/* Regenerate button — only shows when we have cached data and are not loading */}
              {!loading && (
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  title="Regenerate fresh tips from AI (~15s)"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 9, fontSize: 11, fontWeight: 600,
                    background: cached ? 'var(--surface)' : 'rgba(91,155,255,0.1)',
                    color: cached ? 'var(--text-2)' : 'var(--brand)',
                    border: cached ? '1px solid var(--border)' : '1px solid rgba(91,155,255,0.25)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(91,155,255,0.4)'; e.currentTarget.style.color = 'var(--brand)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = cached ? 'var(--border)' : 'rgba(91,155,255,0.25)'; e.currentTarget.style.color = cached ? 'var(--text-2)' : 'var(--brand)' }}>
                  <RefreshCw size={12} />
                  Regenerate
                </button>
              )}
            </div>
          </div>
        </ScrollFade>

        {/* ── Hero card: ring + stats ── */}
        {!loading && totalTips > 0 && (
          <ScrollFade delay={30}>
            <div className="card card-accent" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <ProgressRing done={doneCount} total={totalTips} />
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: allDone ? '#10b981' : 'var(--text-3)', fontFamily: "'Manrope', sans-serif",
                  }}>
                    {allDone ? '🎉 Complete!' : `${doneCount} done`}
                  </span>
                </div>

                <div style={{ width: 1, height: 80, background: 'var(--border)', flexShrink: 0 }} className="hidden sm:block" />

                {ctx && (
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                    {ctx.total > 0 && (
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 4, fontFamily: "'Manrope', sans-serif" }}>Spent This Week</p>
                        <p style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontFamily: "'Manrope', sans-serif" }}>
                          ${fmt0(ctx.total)}
                        </p>
                      </div>
                    )}
                    {ctx.vs_avg_pct !== 0 && (
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 4, fontFamily: "'Manrope', sans-serif" }}>vs 4-Wk Avg</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {ctx.vs_avg_pct > 0 ? <TrendingUp size={14} style={{ color: '#f87171' }} /> : <TrendingDown size={14} style={{ color: '#34d399' }} />}
                          <p style={{ fontSize: '1.375rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontFamily: "'Manrope', sans-serif", color: ctx.vs_avg_pct > 0 ? '#f87171' : '#34d399' }}>
                            {ctx.vs_avg_pct > 0 ? '+' : ''}{Number(ctx.vs_avg_pct).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    )}
                    {ctx.income > 0 && (
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 4, fontFamily: "'Manrope', sans-serif" }}>Income</p>
                        <p style={{ fontSize: '1.375rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums', fontFamily: "'Manrope', sans-serif" }}>
                          ${fmt0(ctx.income)}
                        </p>
                      </div>
                    )}
                    {ctx.top_category && (
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 4, fontFamily: "'Manrope', sans-serif" }}>Top Category</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>{ctx.top_category}</p>
                      </div>
                    )}
                  </div>
                )}

                {savingsEstimate > 0 && (
                  <div style={{ marginLeft: 'auto', padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', flexShrink: 0, textAlign: 'center' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#34d399', marginBottom: 2, fontFamily: "'Manrope', sans-serif" }}>Potential Save</p>
                    <p style={{ fontSize: '1.125rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums', fontFamily: "'Manrope', sans-serif" }}>~${fmt0(savingsEstimate)}</p>
                    <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 1 }}>cited in tips</p>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {totalTips > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ height: 4, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999, width: `${pctDone}%`,
                      background: allDone ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, var(--brand), #7eb8ff)',
                      transition: 'width 0.8s cubic-bezier(0.34,1.56,0.64,1), background 0.4s',
                    }} />
                  </div>
                </div>
              )}
            </div>
          </ScrollFade>
        )}

        {/* ── Celebration banner ── */}
        {showCelebration && (
          <div className="celebrate-pop px-5 py-3.5 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <span style={{ fontSize: 22 }}>🎉</span>
            <div>
              <p className="text-sm font-bold" style={{ color: '#34d399' }}>Week complete!</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>You checked off all your tips — that's a streak worth celebrating.</p>
            </div>
            <button onClick={() => setCelebration(false)} className="ml-auto text-xs opacity-50 hover:opacity-100" style={{ color: 'var(--text-3)' }}>✕</button>
          </div>
        )}

        {/* ── Recurring pattern warning ── */}
        {recurringCats.length > 0 && !loading && (
          <ScrollFade delay={40}>
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>Persistent pattern</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  <span className="font-medium" style={{ color: 'var(--text-2)' }}>{recurringCats.join(', ')}</span>{' '}
                  tips have shown up for 2+ consecutive weeks — these habits may need real attention.
                </p>
              </div>
            </div>
          </ScrollFade>
        )}

        {/* ── Loader ── */}
        {loading && <CoachLoader />}

        {/* ── Category filter tabs ── */}
        {!loading && totalTips > 0 && availableCats.length > 1 && (
          <ScrollFade delay={50}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setFilter(null)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                style={{
                  background: activeFilter === null ? 'var(--brand)' : 'var(--surface-2)',
                  color: activeFilter === null ? 'white' : 'var(--text-3)',
                  border: `1px solid ${activeFilter === null ? 'var(--brand)' : 'var(--border)'}`,
                  fontFamily: "'Manrope', sans-serif", letterSpacing: '0.04em',
                }}>
                All ({totalTips})
              </button>
              {availableCats.map(cat => {
                const cfg = CAT_CONFIG[cat] || CAT_CONFIG.Tip
                const isActive = activeFilter === cat
                return (
                  <button key={cat} onClick={() => setFilter(isActive ? null : cat)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                    style={{
                      background: isActive ? cfg.bg : 'var(--surface-2)',
                      color: isActive ? cfg.color : 'var(--text-3)',
                      border: `1px solid ${isActive ? cfg.border : 'var(--border)'}`,
                      fontFamily: "'Manrope', sans-serif", letterSpacing: '0.04em',
                    }}>
                    {cat} ({catCounts[cat]})
                  </button>
                )
              })}
            </div>
          </ScrollFade>
        )}

        {/* ── Tip cards ── */}
        {!loading && filteredTips.length > 0 && (
          <div className="space-y-3">
            {filteredTips.map(({ tip, origIndex }) => (
              <TipCard key={origIndex} tip={tip} index={origIndex}
                done={done.has(origIndex)} onToggleDone={handleToggleDone} onCopy={handleCopy} />
            ))}
          </div>
        )}

        {!loading && tips.length > 0 && filteredTips.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No tips in this category this week.</p>
          </div>
        )}

        {/* ── Archive ── */}
        {!loading && (
          <ScrollFade delay={80}>
            <ArchiveSection archive={archive} />
          </ScrollFade>
        )}

        {/* ── Empty state ── */}
        {!loading && tips.length === 0 && (
          <ScrollFade>
            <div className="card text-center py-14">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--brand-light)', border: '1px solid rgba(91,155,255,0.2)' }}>
                <Lightbulb size={26} style={{ color: 'var(--brand)' }} />
              </div>
              <p className="font-bold text-base mb-1" style={{ color: 'var(--text)' }}>No tips yet</p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                Upload some transaction data to get your personalized weekly coaching brief
              </p>
            </div>
          </ScrollFade>
        )}

      </div>
    </>
  )
}
