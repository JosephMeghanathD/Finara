import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { aiApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { Send, MessageSquare, Sparkles } from 'lucide-react'
import AiText from '../components/AiText'
import { format, parseISO } from 'date-fns'

const THINKING_PHRASES = [
  'Reading your transaction data…',
  'Connecting the dots…',
  'Running inference on Gemma 3…',
  'Crafting a thoughtful response…',
  'Cross-referencing your history…',
]

const STARTERS = [
  'Where did I spend the most this month?',
  'What could I cut back on?',
  'Am I spending more than last month?',
  'How much did I spend on food?',
  'What are my top 3 expenses?',
  'What can Finara do?',
]

function storyFollowups(story) {
  const s = (story || '').toLowerCase()
  const hits = []
  if (s.includes('food') || s.includes('dining') || s.includes('restaurant'))
    hits.push('How can I reduce my food and dining spending?')
  if (s.includes('groceri'))
    hits.push('How does my grocery spending look?')
  if (s.includes('subscri'))
    hits.push('Which subscriptions should I consider cancelling?')
  if (s.includes('transport') || s.includes('uber') || s.includes('lyft') || s.includes('commut'))
    hits.push('How can I cut my transport costs?')
  if (s.includes('entertain'))
    hits.push('What entertainment spending can I reduce?')
  if (s.includes('shop') || s.includes('retail') || s.includes('amazon'))
    hits.push('How much did I spend on shopping?')
  if (s.includes('travel') || s.includes('hotel') || s.includes('flight') || s.includes('airbnb'))
    hits.push('How can I manage my travel expenses better?')
  if (s.includes('anomal') || s.includes('unusual') || s.includes('spike') || s.includes('flagged'))
    hits.push('Tell me more about my unusual purchases')
  if (s.includes('sav'))
    hits.push('What\'s the best way to save more this month?')
  hits.push('What were my biggest expenses?')
  hits.push('Where should I cut back the most?')
  hits.push('How does this compare to my previous month?')
  return [...new Set(hits)].slice(0, 6)
}

function fmtRange(s, e) {
  if (!s) return ''
  const fmt = m => { try { return format(parseISO(m + '-01'), 'MMM yyyy') } catch { return m } }
  return s === e ? fmt(s) : `${fmt(s)} – ${fmt(e)}`
}

function ThinkingBubble() {
  const [phraseIdx, setPhraseIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % THINKING_PHRASES.length), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex items-start gap-2.5 chat-message">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: 'var(--brand-light)', boxShadow: '0 0 10px rgba(77,142,255,0.2)' }}>
        <Sparkles size={13} className="ai-pulse-icon" style={{ color: 'var(--brand)' }} />
      </div>
      <div className="px-4 py-3.5 rounded-2xl flex flex-col gap-2"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderBottomLeftRadius: 6 }}>
        <p key={phraseIdx} className="text-xs ai-msg-in" style={{ color: 'var(--text-3)' }}>
          {THINKING_PHRASES[phraseIdx]}
        </p>
        <div className="flex gap-1.5 items-center">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full thinking-dot"
              style={{ background: 'var(--brand)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AssistantBubble({ content, error }) {
  return (
    <div className="flex items-start gap-2.5 chat-message">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-sm"
        style={{ background: 'var(--brand-light)' }}>
        <Sparkles size={13} style={{ color: 'var(--brand)' }} />
      </div>
      <div className="flex-1 min-w-0 px-4 py-3.5 rounded-2xl"
        style={{
          background: error ? 'rgba(239,68,68,0.06)' : 'var(--surface)',
          border: `1px solid ${error ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
          borderBottomLeftRadius: 6,
        }}>
        {error
          ? <p className="text-sm" style={{ color: '#f87171' }}>{content}</p>
          : <AiText content={content} compact />
        }
      </div>
    </div>
  )
}

function UserBubble({ content }) {
  return (
    <div className="flex justify-end chat-message">
      <div className="max-w-[72%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
        style={{ background: 'var(--brand)', color: 'white', borderBottomRightRadius: 6 }}>
        {content}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const location = useLocation()
  const storyCtx = location.state?.storyContext
  const { startMonth: globalStart, endMonth: globalEnd } = useTimeFilter()

  // If arriving from Story page with context, use that period; otherwise use global filter
  const startMonth = storyCtx?.startMonth || globalStart
  const endMonth   = storyCtx?.endMonth   || globalEnd

  const [messages, setMessages]     = useState(() => {
    if (!storyCtx?.story) return []
    return [{
      role: 'assistant',
      content: `I've just read your financial story for **${fmtRange(storyCtx.startMonth, storyCtx.endMonth)}**. I have full context of your spending for that period — ask me anything about it, or pick one of the suggestions below.`,
    }]
  })
  const [starters, setStarters] = useState(() =>
    storyCtx?.story ? storyFollowups(storyCtx.story) : STARTERS
  )
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const { data } = await aiApi.chat({ message: msg, startMonth, endMonth, history })
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm having trouble connecting right now. Make sure Finara's AI (Ollama) is running.",
        error: true,
      }])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Ask Finara</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Chat with Finara powered by Gemma
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5"
          style={{ background: 'var(--brand-light)', color: 'var(--brand)',
            border: '1px solid rgba(99,102,241,0.2)' }}>
          <Sparkles size={11} /> Finara AI
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--brand-light)' }}>
              <MessageSquare size={28} style={{ color: 'var(--brand)' }} />
            </div>
            <div className="text-center">
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>
                {storyCtx?.story ? 'Follow up on your financial story' : 'Ask anything about your spending'}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                Finara has full context of your {startMonth ? fmtRange(startMonth, endMonth) : ''} transactions
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user'
            ? <UserBubble key={i} content={msg.content} />
            : <AssistantBubble key={i} content={msg.content} error={msg.error} />
        )}

        {loading && <ThinkingBubble />}

        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="pt-3 pb-2">
          <p className="text-xs mb-2 px-1" style={{ color: 'var(--text-3)' }}>
            {storyCtx?.story ? 'Suggested follow-ups' : 'Try asking'}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {starters.map(s => (
              <button key={s} onClick={() => send(s)} disabled={loading}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full transition-all whitespace-nowrap"
                style={{ background: 'var(--surface)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', opacity: loading ? 0.5 : 1 }}
                onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.background = 'var(--brand-light)' }}}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'var(--surface)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pb-4">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask about your spending…"
            className="flex-1 px-4 py-3.5 rounded-2xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="px-4 py-3 rounded-xl flex items-center justify-center transition-all"
            style={{ background: 'var(--brand)', color: 'white',
              opacity: (!input.trim() || loading) ? 0.45 : 1 }}>
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
