import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiApi, reportApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  BookOpen, Sparkles, RefreshCw, MessageCircle, Zap,
  TrendingUp, TrendingDown, AlertTriangle, Coffee, Brain,
} from 'lucide-react'
import AiText from '../components/AiText'
import AiLoader from '../components/AiLoader'
import { format, parseISO } from 'date-fns'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'

// ─── Witty messages shown when Gemma is unavailable ───────────────────────────
const MOODY = [
  { title: "Fiana's feeling a bit moody today",       sub: "The AI is on a short break — your numbers are still here." },
  { title: "Looks like Fiana stepped out for coffee",  sub: "Give her a moment and hit Regenerate when you're ready." },
  { title: "Fiana's AI brain needs a quick reboot",    sub: "This happens sometimes — try again in a moment." },
  { title: "The storyteller went quiet on us",         sub: "Could be a warm-up delay. Regenerate to try again." },
  { title: "Fiana is being fashionably late",          sub: "She'll be back — your financial data loaded just fine." },
]

const CATEGORY_COLORS = {
  'Food & Drink':    '#6366F1', 'Groceries':      '#8B5CF6',
  'Transport':       '#0EA5E9', 'Shopping':       '#F59E0B',
  'Entertainment':   '#10B981', 'Healthcare':     '#EF4444',
  'Utilities':       '#6B7280', 'Rent & Housing': '#84CC16',
  'Travel':          '#F97316', 'Financial':      '#64748B',
  'Subscriptions':   '#A78BFA', 'Personal Care':  '#EC4899',
  'Other':           '#94A3B8',
}
const catColor = cat => CATEGORY_COLORS[cat] || '#94A3B8'

function fmtMonth(m) {
  try { return format(parseISO(m + '-01'), 'MMMM yyyy') } catch { return m }
}
function fmtRange(s, e) {
  if (!s) return ''
  if (s === e) return fmtMonth(s)
  try {
    return `${format(parseISO(s + '-01'), 'MMM yyyy')} – ${format(parseISO(e + '-01'), 'MMM yyyy')}`
  } catch { return `${s} – ${e}` }
}
function fmt0(n) {
  const num = typeof n === 'number' && isFinite(n) ? n : 0
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function Skel({ w = '100%', h = 12, radius = 8 }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: radius }} />
}

// ─── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, sub, color = '#5b9bff', loading }) {
  return (
    <div className="card stat-card stat-card-hover flex flex-col gap-1.5 py-3.5 px-4"
      style={{ '--c': color }}>
      {loading ? (
        <div className="space-y-2">
          <Skel w="55%" h={11} />
          <Skel w="75%" h={20} radius={6} />
        </div>
      ) : (
        <>
          <p className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{label}</p>
          <p className="text-lg font-bold leading-tight" style={{
            color: 'var(--text)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em',
          }}>{value}</p>
          {sub && <p className="text-xs font-medium" style={{ color: `${color}bb` }}>{sub}</p>}
        </>
      )}
    </div>
  )
}

// ─── Category bar row ──────────────────────────────────────────────────────────
function CatBar({ cat, amt, pct, loading }) {
  const color = catColor(cat)
  if (loading) return (
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <Skel w="42%" h={11} />
        <Skel w="22%" h={11} />
      </div>
      <Skel w="100%" h={6} radius={999} />
    </div>
  )
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          {cat}
        </span>
        <span className="text-xs font-mono font-medium" style={{ color: 'var(--text)' }}>
          ${fmt0(amt)}
          <span className="ml-1.5 font-normal" style={{ color: 'var(--text-3)' }}>{pct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function StoryPage() {
  const navigate = useNavigate()
  const { months, startMonth, endMonth } = useTimeFilter()

  // Fast — DB only, ~50 ms
  const [data, setData]               = useState(null)
  const [dataLoading, setDataLoading] = useState(false)

  // Slow — Gemma, 20–60 s
  const [story, setStory]               = useState('')
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError]     = useState(null)
  const [cached, setCached]             = useState(false)
  const [timing, setTiming]             = useState(null)

  // Fetch financial data and cached narrative independently on period change
  useEffect(() => {
    if (!startMonth || !endMonth) return
    setData(null); setStory(''); setCached(false); setStoryError(null); setTiming(null)
    setDataLoading(true)

    // Request 1 · financial snapshot (fast, pure DB — always works)
    aiApi.storyData(startMonth, endMonth)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setDataLoading(false))

    // Request 2 · cached narrative (independent — works even if Gemma is down)
    // NOTE: reportApi fields (total/net) differ from storyData fields (total_spent/net_cash_flow).
    // Only extract the narrative text and highlights from here — never use it as the data source.
    const key = startMonth === endMonth ? startMonth : `${startMonth}~${endMonth}`
    reportApi.get(key).then(r => {
      if (r.data?.narrative) {
        setStory(r.data.narrative)
        setCached(true)
        // Merge highlights only if storyData has already set data — don't replace it
        if (r.data.highlights)
          setData(prev => prev ? { ...prev, highlights: r.data.highlights } : prev)
      }
    }).catch(() => {})
  }, [startMonth, endMonth])

  const generate = async (refresh = false) => {
    if (!startMonth || !endMonth) return
    setStoryLoading(true); setStory(''); setStoryError(null); setTiming(null); setCached(false)
    try {
      const { data: resp } = await aiApi.story(startMonth, endMonth, refresh)
      setStory(resp.story)
      if (resp.timing?.gemma_ms) setTiming(resp.timing.gemma_ms)
      // Merge any fresh highlights/summary from the story response
      if (resp.summary || resp.highlights)
        setData(prev => ({ ...(prev || {}), ...(resp.summary || {}), highlights: resp.highlights || prev?.highlights }))
    } catch {
      setStoryError(MOODY[Math.floor(Math.random() * MOODY.length)])
    } finally {
      setStoryLoading(false)
    }
  }

  const hasData   = data && (data.total_spent > 0 || data.income > 0)
  const topCats   = Object.entries(data?.categories || {}).sort(([, a], [, b]) => b - a).slice(0, 7)
  const anomalies = data?.anomalies || []
  const netFlow   = data?.net_cash_flow ?? null
  const showPage  = dataLoading || hasData || months.length > 0

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <ScrollFade delay={0}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>My Financial Story</h2>
              <InfoTooltip
                title="Financial Story"
                content="Financial data loads instantly from your database. The AI narrative is generated separately by Gemma 3 (local model via Ollama) — so your numbers are always visible even when the AI is slow or unavailable."
              />
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
              Data loads instantly · AI narrative generated on demand
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 flex-shrink-0"
            style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid rgba(91,155,255,0.2)' }}>
            <Sparkles size={11} /> Fiana AI
          </span>
        </div>
      </ScrollFade>

      {/* ── Empty state: no data uploaded yet ───────────────────────────────── */}
      {!showPage && (
        <ScrollFade delay={40}>
          <div className="card text-center py-16">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--brand-light)' }}>
              <BookOpen size={24} style={{ color: 'var(--brand)' }} />
            </div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No data yet</p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Upload a CSV to see your financial story</p>
          </div>
        </ScrollFade>
      )}

      {showPage && (
        <>
          {/* ── Stat strip (always fast) ──────────────────────────────────────── */}
          <ScrollFade delay={40}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatPill
                label="Income" color="#10B981"
                loading={dataLoading && !hasData}
                value={hasData && data.income > 0 ? `$${fmt0(data.income)}` : '—'}
              />
              <StatPill
                label="Total Spent" color="#EF4444"
                loading={dataLoading && !hasData}
                value={hasData ? `$${fmt0(data.total_spent)}` : '—'}
              />
              <StatPill
                label="Net Cash Flow"
                loading={dataLoading && !hasData}
                value={hasData && netFlow != null ? `${netFlow >= 0 ? '+' : '-'}$${fmt0(Math.abs(netFlow))}` : '—'}
                sub={hasData && netFlow != null ? (netFlow >= 0 ? 'Surplus ↑' : 'Deficit ↓') : undefined}
                color={hasData && netFlow != null ? (netFlow >= 0 ? '#10B981' : '#EF4444') : '#5b9bff'}
              />
              <StatPill
                label="Saved / Transferred" color="#5b9bff"
                loading={dataLoading && !hasData}
                value={hasData && (data.savings_transferred || 0) > 0 ? `$${fmt0(data.savings_transferred)}` : '—'}
              />
            </div>
          </ScrollFade>

          {/* ── Main bento ───────────────────────────────────────────────────── */}
          <ScrollFade delay={80}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

              {/* ─ Left: category breakdown (fast, pure DB) ──────────────────── */}
              <div className="lg:col-span-5 card card-i flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                      Spending breakdown
                    </p>
                    <InfoTooltip
                      title="Spending breakdown"
                      content="Your spending by category for the selected period. Loaded directly from your database — instant, no AI."
                    />
                  </div>
                  {dataLoading && !hasData && (
                    <div className="w-3 h-3 rounded-full border-2 animate-spin flex-shrink-0"
                      style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
                  )}
                </div>

                {/* Loading skeletons */}
                {dataLoading && !hasData && (
                  <div className="space-y-3.5 flex-1">
                    {[...Array(5)].map((_, i) => (
                      <CatBar key={i} loading />
                    ))}
                  </div>
                )}

                {/* No spending in period */}
                {hasData && topCats.length === 0 && (
                  <p className="text-sm text-center py-10" style={{ color: 'var(--text-3)' }}>
                    No spending data for this period
                  </p>
                )}

                {/* Category bars */}
                {hasData && topCats.length > 0 && (
                  <div className="space-y-3.5 flex-1">
                    {topCats.map(([cat, amt]) => (
                      <CatBar
                        key={cat} cat={cat} amt={amt}
                        pct={data.total_spent > 0 ? (amt / data.total_spent) * 100 : 0}
                      />
                    ))}
                  </div>
                )}

                {/* Anomaly callout */}
                {hasData && anomalies.length > 0 && (
                  <div className="mt-4 flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold mb-0.5" style={{ color: '#fbbf24' }}>
                        {anomalies.length} flagged transaction{anomalies.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                        {anomalies.slice(0, 2).map(a => a.description).join(', ')}
                        {anomalies.length > 2 ? ` +${anomalies.length - 2} more` : ''}
                      </p>
                    </div>
                  </div>
                )}

                {/* Total row */}
                {hasData && data.total_spent > 0 && (
                  <div className="mt-4 pt-3 flex items-center justify-between"
                    style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>Total spending</span>
                    <span className="text-sm font-bold font-mono" style={{ color: 'var(--text)' }}>
                      ${fmt0(data.total_spent)}
                    </span>
                  </div>
                )}

                {/* Prompt when no period selected yet */}
                {!hasData && !dataLoading && (
                  <p className="text-sm text-center py-10" style={{ color: 'var(--text-3)' }}>
                    Select a period in the top bar
                  </p>
                )}
              </div>

              {/* ─ Right: AI narrative card (independent from left panel) ─────── */}
              <div className="lg:col-span-7 card card-accent card-i flex flex-col min-h-64">

                {/* Card header */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--brand-light)', boxShadow: '0 0 18px rgba(91,155,255,0.18)' }}>
                      <BookOpen size={16} style={{ color: 'var(--brand)' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)', fontFamily: "'Manrope', sans-serif" }}>
                        {startMonth ? fmtRange(startMonth, endMonth) : 'Financial Narrative'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Fiana · Gemma 3 via Ollama</p>
                        {cached && !storyLoading && (
                          <span className="badge badge-brand">saved</span>
                        )}
                        {timing && !cached && !storyLoading && (
                          <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
                            <Zap size={9} /> {(timing / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {story && !storyLoading && (
                      <button onClick={() => generate(true)} className="btn-ghost btn-sm flex items-center gap-1.5">
                        <RefreshCw size={12} /> Regenerate
                      </button>
                    )}
                    {storyError && !storyLoading && (
                      <button onClick={() => generate(false)} className="btn-ghost btn-sm flex items-center gap-1.5">
                        <RefreshCw size={12} /> Try Again
                      </button>
                    )}
                    {!story && !storyLoading && !storyError && (
                      <button onClick={() => generate(false)} disabled={!startMonth}
                        className="btn-primary btn-sm flex items-center gap-2">
                        <Sparkles size={13} /> Generate Story
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-px my-4" style={{ background: 'var(--border)' }} />

                {/* ── State: loading (Gemma working) ── */}
                {storyLoading && <AiLoader type="story" compact />}

                {/* ── State: AI error (witty message) ── */}
                {storyError && !storyLoading && (
                  <div className="flex flex-col items-center text-center py-10 px-4 flex-1">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      <Coffee size={20} style={{ color: '#fbbf24' }} />
                    </div>
                    <p className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>{storyError.title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)', maxWidth: 280 }}>
                      {storyError.sub}
                    </p>
                    <p className="text-xs mt-3 px-4" style={{ color: 'var(--text-3)', opacity: 0.55 }}>
                      Your numbers on the left are always accurate — they come straight from your database.
                    </p>
                  </div>
                )}

                {/* ── State: story content ── */}
                {story && !storyLoading && (
                  <div className="flex-1">
                    <AiText content={story} narrative />
                    <div className="mt-6 pt-5 flex flex-wrap gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                      <button
                        onClick={() => navigate('/chat', { state: { storyContext: { story, startMonth, endMonth } } })}
                        className="btn-primary btn-sm flex items-center gap-2">
                        <MessageCircle size={13} /> Ask Fiana a follow-up
                      </button>
                    </div>
                  </div>
                )}

                {/* ── State: no story yet, prompt to generate ── */}
                {!story && !storyLoading && !storyError && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4">
                    <div className="relative mb-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: 'var(--brand-light)' }}>
                        <Brain size={24} style={{ color: 'var(--brand)' }} />
                      </div>
                      <div className="absolute inset-[-5px] rounded-2xl border ai-orbit-ring"
                        style={{ borderColor: 'rgba(91,155,255,0.22)', borderWidth: 1 }} />
                    </div>
                    <p className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                      {startMonth ? 'Your story awaits' : 'Select a period first'}
                    </p>
                    <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-3)', maxWidth: 260 }}>
                      {startMonth
                        ? 'Fiana reads your data above and writes a personalised financial narrative — usually under 60 seconds.'
                        : 'Choose a month in the top bar, then hit Generate Story.'}
                    </p>
                    {startMonth && (
                      <button onClick={() => generate(false)} className="btn-primary flex items-center gap-2">
                        <Sparkles size={15} /> Generate Story
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ScrollFade>
        </>
      )}
    </div>
  )
}
