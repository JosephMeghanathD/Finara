import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiApi, reportApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { BookOpen, Sparkles, RefreshCw, MessageCircle, Zap } from 'lucide-react'
import AiText from '../components/AiText'
import AiLoader from '../components/AiLoader'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

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

export default function StoryPage() {
  const navigate = useNavigate()
  const { months, startMonth, endMonth } = useTimeFilter()
  const [story, setStory]   = useState('')
  const [loading, setLoading] = useState(false)
  const [timing, setTiming] = useState(null)
  const [cached, setCached] = useState(false)

  // Load persisted narrative whenever the selected period changes
  useEffect(() => {
    if (!startMonth || !endMonth) return
    const key = startMonth === endMonth ? startMonth : `${startMonth}~${endMonth}`
    reportApi.get(key).then(r => {
      if (r.data?.narrative) {
        setStory(r.data.narrative)
        setCached(true)
        setTiming(null)
      } else {
        setStory('')
        setCached(false)
      }
    }).catch(() => {})
  }, [startMonth, endMonth])

  const generate = async (refresh = false) => {
    if (!startMonth || !endMonth) return
    setLoading(true)
    setStory('')
    setTiming(null)
    setCached(false)
    try {
      const { data } = await aiApi.story(startMonth, endMonth, refresh)
      setStory(data.story)
      if (data.timing?.gemma_ms) setTiming(data.timing.gemma_ms)
    } catch {
      toast.error('Failed to generate story. Is Finara AI running?')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>My Financial Story</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Finara reads your transactions and crafts a personal narrative
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 flex-shrink-0"
          style={{ background: 'var(--brand-light)', color: 'var(--brand)',
            border: '1px solid rgba(99,102,241,0.2)' }}>
          <Sparkles size={11} /> Finara AI
        </span>
      </div>

      <div className="card flex items-center justify-end gap-4">
        <button onClick={() => generate(false)} disabled={loading || !startMonth}
          className="btn-primary flex items-center gap-2 flex-shrink-0">
          {loading
            ? <><RefreshCw size={15} className="animate-spin" /> Writing…</>
            : cached
              ? <><RefreshCw size={15} /> Regenerate</>
              : <><Sparkles size={15} /> Generate</>}
        </button>
      </div>

      {loading && <AiLoader type="story" title="Finara AI" />}

      {story && !loading && (
        <div className="card">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--brand-light)' }}>
                <BookOpen size={16} style={{ color: 'var(--brand)' }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)', fontFamily: "'Manrope', sans-serif" }}>
                  {fmtRange(startMonth, endMonth)}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Finara · powered by Gemma 3</p>
                  {cached && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--brand)' }}>
                      saved
                    </span>
                  )}
                  {timing && !cached && (
                    <span className="text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(16,185,129,0.08)', color: '#34d399' }}>
                      <Zap size={9} /> {(timing / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="h-px mb-5" style={{ background: 'var(--border)' }} />

          <AiText content={story} narrative />

          <div className="mt-6 pt-5 flex flex-wrap gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => navigate('/chat', { state: { storyContext: { story, startMonth, endMonth } } })}
              className="btn-primary flex items-center gap-2 text-sm">
              <MessageCircle size={14} /> Ask a follow-up
            </button>
            <button onClick={() => generate(true)} className="btn-ghost text-sm flex items-center gap-1.5">
              <RefreshCw size={13} /> Regenerate
            </button>
          </div>
        </div>
      )}

      {!story && !loading && (
        <div className="card text-center py-14">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--brand-light)' }}>
            <BookOpen size={24} style={{ color: 'var(--brand)' }} />
          </div>
          {months.length === 0 ? (
            <>
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No data yet</p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Upload a CSV first to generate your story</p>
            </>
          ) : (
            <>
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Your story awaits</p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                Select a period in the top bar, then hit Generate
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
