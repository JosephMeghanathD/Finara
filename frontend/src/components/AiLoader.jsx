import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'

/* ── Step-by-step sequences per call type ────────────────────────────────────── */
const SEQUENCES = {
  story: [
    'Fiana is reading your transactions…',
    'Identifying your top spending patterns…',
    'Weaving your financial narrative…',
    'Adding month-over-month context…',
    'Polishing the story with AI insights…',
  ],
  anomaly: [
    'Fiana is scanning for unusual activity…',
    'Running the Isolation Forest algorithm…',
    'Flagging statistical outliers…',
    'Cross-referencing your spending history…',
    'Surfacing the transactions worth a look…',
  ],
  savings: [
    'Fiana is modelling your savings trajectory…',
    'Analysing your monthly cash flow…',
    'Running feasibility calculations…',
    'Stress-testing your timeline…',
    'Building a personalised plan just for you…',
  ],
  reality: [
    'Fiana is pulling your income and expenses…',
    'Modelling your current savings rate…',
    'Simulating goal completion dates…',
    'Running an honest financial reality check…',
    'Generating projections you can act on…',
  ],
  forecast: [
    'Fiana is loading your historical data…',
    'Applying exponential smoothing…',
    'Projecting next-period totals…',
    'Calculating confidence intervals…',
    'Validating category forecasts…',
  ],
  coach: [
    'Fiana is reviewing your recent activity…',
    'Spotting habit patterns in your spending…',
    'Generating personalised tips…',
    'Prioritising your action items…',
    'Packaging your weekly coaching report…',
  ],
  compare: [
    'Fiana is pulling your monthly reports…',
    'Normalising spending categories…',
    'Computing month-over-month deltas…',
    'Identifying trend inflection points…',
    'Building your comparison view…',
  ],
  budget: [
    'Fiana is loading your budget targets…',
    'Calculating actuals vs budget…',
    'Running variance analysis…',
    'Identifying over-budget categories…',
    'Generating AI recommendations…',
  ],
  upload: [
    'Fiana is parsing your bank statement…',
    'Categorising transactions with ML…',
    'Running the anomaly detector…',
    'Storing your transactions securely…',
    'Finalising your upload…',
  ],
  transactions: [
    'Fiana is loading your transactions…',
    'Applying category labels…',
    'Scoring anomaly probabilities…',
    'Sorting by date…',
  ],
  default: [
    'Fiana, your financial advisor, is at work…',
    'Crunching your numbers…',
    'Computing insights…',
    'Almost there…',
  ],
}

/* ── Financial tips that cycle in the footer ─────────────────────────────────── */
const TIPS = [
  "The 50/30/20 rule: 50% needs, 30% wants, 20% savings — a simple framework for any income.",
  "Automating savings before you spend is 3× more effective than saving what's left over.",
  "Tracking every purchase, even small ones, reveals spending leaks that add up fast.",
  "An emergency fund covering 3–6 months of expenses is the foundation of financial stability.",
  "Compound interest doubles money roughly every 7 years at 10% annual returns.",
  "Paying off high-interest debt first is usually the single highest-return investment you can make.",
  "Review your subscriptions monthly — most people unknowingly overpay by $40+ per month.",
  "The best time to start a savings plan was yesterday. The second-best time is right now.",
  "Spending 1% less per month compounds into thousands saved over a decade.",
  "Zero-based budgeting — giving every dollar a job — eliminates unconscious overspending.",
]

/* ── Inline API loader (drop anywhere while waiting for a call) ──────────────── */
export function FianaApiLoader({ text = 'Communicating with Fiana…' }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
      style={{ background: 'rgba(77,142,255,0.06)', border: '1px solid rgba(77,142,255,0.1)' }}>
      <Sparkles size={13} className="ai-pulse-icon flex-shrink-0" style={{ color: 'var(--brand)' }} />
      <p className="text-sm" style={{ color: 'var(--text-2)' }}>{text}</p>
    </div>
  )
}

/* ── Compact variant ─────────────────────────────────────────────────────────── */
function CompactLoader({ messages, msgIdx, tipIdx, title }) {
  return (
    <div className="card flex flex-col gap-4 py-6 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(77,142,255,0.07) 0%, transparent 70%)' }} />

      <div className="flex items-center gap-3 relative">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--brand-light)', boxShadow: '0 0 12px rgba(77,142,255,0.25)' }}>
          <Sparkles size={15} className="ai-pulse-icon" style={{ color: 'var(--brand)' }} />
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--brand)' }}>
              {title}
            </p>
          )}
          <p key={msgIdx} className="text-sm font-medium ai-msg-in" style={{ color: 'var(--text)' }}>
            {messages[msgIdx]}
          </p>
          <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-0.5 rounded-full ai-bar" style={{ background: 'var(--brand)' }} />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl relative"
        style={{ background: 'rgba(77,142,255,0.06)', border: '1px solid rgba(77,142,255,0.1)' }}>
        <span className="text-xs flex-shrink-0 mt-0.5">💡</span>
        <p key={tipIdx} className="text-xs leading-relaxed ai-msg-in" style={{ color: 'var(--text-3)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-2)' }}>Tip: </span>
          {TIPS[tipIdx]}
        </p>
      </div>
    </div>
  )
}

/* ── Full variant ────────────────────────────────────────────────────────────── */
function FullLoader({ messages, msgIdx, tipIdx, title }) {
  return (
    <div className="card flex flex-col items-center text-center py-14 px-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(77,142,255,0.1) 0%, transparent 65%)', top: '-20%' }} />

      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 relative"
        style={{ background: 'var(--brand-light)', boxShadow: '0 0 36px rgba(77,142,255,0.22)' }}>
        <Sparkles size={28} className="ai-pulse-icon" style={{ color: 'var(--brand)' }} />
        <div className="absolute inset-[-6px] rounded-2xl border ai-orbit-ring"
          style={{ borderColor: 'rgba(77,142,255,0.3)' }} />
      </div>

      {title && (
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--brand)' }}>
          {title}
        </p>
      )}

      <p key={msgIdx} className="text-sm font-medium mb-1 ai-msg-in" style={{ color: 'var(--text)', minHeight: 20 }}>
        {messages[msgIdx]}
      </p>
      <p className="text-xs mb-5" style={{ color: 'var(--text-3)' }}>
        Fiana, your financial advisor, is at work — this may take up to 60 seconds
      </p>

      <div className="w-52 h-1 rounded-full overflow-hidden mb-8" style={{ background: 'var(--surface-2)' }}>
        <div className="h-1 rounded-full ai-bar-slow" style={{ background: 'var(--brand)' }} />
      </div>

      <div className="flex items-start gap-2.5 max-w-xs px-4 py-3 rounded-xl text-left"
        style={{ background: 'rgba(77,142,255,0.06)', border: '1px solid rgba(77,142,255,0.12)' }}>
        <span className="text-sm flex-shrink-0 mt-0.5">💡</span>
        <p key={tipIdx} className="text-xs leading-relaxed ai-msg-in" style={{ color: 'var(--text-3)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-2)' }}>Quick tip: </span>
          {TIPS[tipIdx]}
        </p>
      </div>
    </div>
  )
}

/* ── Main export ─────────────────────────────────────────────────────────────── */
export default function AiLoader({ type = 'default', title, compact = false }) {
  const messages = SEQUENCES[type] || SEQUENCES.default
  const [msgIdx, setMsgIdx] = useState(0)
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * TIPS.length))

  useEffect(() => {
    const msg = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 2400)
    const tip = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 6000)
    return () => { clearInterval(msg); clearInterval(tip) }
  }, [messages.length])

  const props = { messages, msgIdx, tipIdx, title }
  return compact ? <CompactLoader {...props} /> : <FullLoader {...props} />
}
