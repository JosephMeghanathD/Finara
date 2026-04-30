import { useState, useEffect } from 'react'
import { aiApi } from '../utils/api'
import { Lightbulb, RefreshCw, Sparkles, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import AiLoader from '../components/AiLoader'
import { format, getISOWeek, getYear } from 'date-fns'

const TIP_ICONS  = ['💡', '🎯', '📊', '💰', '🏦']
const TIP_COLORS = ['#6366F1', '#8B5CF6', '#0EA5E9', '#F59E0B', '#10B981']
const TIP_BG     = ['var(--brand-light)', 'rgba(139,92,246,0.08)', 'rgba(14,165,233,0.08)',
                    'rgba(245,158,11,0.08)', 'rgba(16,185,129,0.08)']

function weekKey() {
  const now = new Date()
  return `coach_${getYear(now)}_W${String(getISOWeek(now)).padStart(2, '0')}`
}

export default function CoachPage() {
  const [tips, setTips]       = useState([])
  const [loading, setLoading] = useState(false)
  const [timing, setTiming]   = useState(null)
  const [cached, setCached]   = useState(false)

  const fetchTips = async (forceRefresh = false) => {
    const key = weekKey()
    if (!forceRefresh) {
      const stored = localStorage.getItem(key)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setTips(parsed.tips || [])
          setTiming(parsed.gemma_ms || null)
          setCached(true)
          return
        } catch { /* stale/corrupt — re-fetch */ }
      }
    }
    setLoading(true)
    setTips([])
    setCached(false)
    try {
      const { data } = await aiApi.coach()
      const tips = data.tips || []
      setTips(tips)
      setTiming(data.timing?.gemma_ms || null)
      localStorage.setItem(key, JSON.stringify({ tips, gemma_ms: data.timing?.gemma_ms }))
    } catch {
      toast.error('Coach unavailable. Is Finara AI running?')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchTips() }, [])

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Weekly Coach</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Personalized tips based on your spending this week
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5"
            style={{ background: 'var(--brand-light)', color: 'var(--brand)',
              border: '1px solid rgba(99,102,241,0.2)' }}>
            <Sparkles size={11} /> Finara AI
          </span>
          <div className="flex items-center gap-2">
            {cached && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
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
      </div>

      {loading && <AiLoader type="coach" title="Weekly Coach" />}

      {!loading && tips.length > 0 && (
        <div className="space-y-3">
          {tips.map((tip, i) => {
            const color = TIP_COLORS[i % TIP_COLORS.length]
            const bg    = TIP_BG[i % TIP_BG.length]
            return (
              <div key={i} className="card flex gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ background: bg }}>
                  {TIP_ICONS[i % TIP_ICONS.length]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold mb-1.5 uppercase tracking-widest"
                    style={{ color }}>
                    TIP #{i+1}
                  </p>
                  <p style={{ fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
                    fontSize: '0.9rem', lineHeight: 1.75, color: 'var(--text-2)' }}>{tip}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && tips.length === 0 && (
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
      )}
    </div>
  )
}
