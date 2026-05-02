const CATEGORY_COLORS = {
  'Food & Drink':  '#6366F1', 'Groceries':     '#8B5CF6',
  'Transport':     '#0EA5E9', 'Shopping':      '#F59E0B',
  'Entertainment': '#10B981', 'Healthcare':    '#EF4444',
  'Utilities':     '#6366F1', 'Rent & Housing':'#84CC16',
  'Travel':        '#F97316', 'Financial':     '#64748B',
  'Subscriptions': '#A78BFA', 'Personal Care': '#EC4899',
  'Other':         '#94A3B8',
}

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\$[\d,]+(?:\.\d{1,2})?|\b\d+(?:\.\d+)?%|Rent & Housing|Food & Drink|Personal Care|Groceries|Transport|Shopping|Entertainment|Healthcare|Utilities|Subscriptions|Financial|Travel|Other)/g

function renderInline(text) {
  return text.split(INLINE_TOKEN).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} style={{ color: '#e1e2ec', fontWeight: 700 }}>{part.slice(2,-2)}</strong>
    if (/^\$[\d,]/.test(part))
      return <span key={i} style={{
        color: '#4ade80', fontWeight: 700, fontFamily: 'ui-monospace,monospace',
        fontSize: '0.9em', background: 'rgba(74,222,128,0.1)', padding: '1px 5px', borderRadius: 4,
      }}>{part}</span>
    if (/^\d+(?:\.\d+)?%$/.test(part))
      return <span key={i} style={{ color: 'var(--brand)', fontWeight: 700 }}>{part}</span>
    if (CATEGORY_COLORS[part])
      return <span key={i} style={{
        color: CATEGORY_COLORS[part], fontWeight: 600,
        background: `${CATEGORY_COLORS[part]}20`, padding: '1px 6px', borderRadius: 5,
        fontSize: '0.9em', whiteSpace: 'nowrap',
      }}>{part}</span>
    return part
  })
}

const RECAP_RE = /^(let'?s recap:?|here'?s (?:a (?:quick )?)?(?:summary|recap):?|to summarize:?|in summary:?|quick recap:?|here'?s what i found:?)/i

export default function AiText({ content, compact = false, narrative = false }) {
  if (!content) return null

  const narrativeFont = narrative ? "'Plus Jakarta Sans', 'DM Sans', sans-serif" : undefined
  const fs  = narrative ? '1rem' : compact ? '0.875rem' : '0.9375rem'
  const mb  = narrative ? '1rem' : compact ? '0.5rem'   : '0.75rem'
  const lh  = narrative ? 1.9   : compact ? 1.7        : 1.8
  const myUl = compact ? 'my-2 space-y-1.5' : 'my-3 space-y-2'

  const lines = content.split('\n')
  const elements = []
  let bullets = []
  let tableRows = []
  let k = 0

  const flushBullets = () => {
    if (!bullets.length) return
    elements.push(
      <ul key={k++} className={myUl}>
        {bullets.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2"
              style={{ background: 'var(--brand)' }} />
            <span style={{ color: 'var(--text-2)', lineHeight: lh, fontSize: fs }}>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    )
    bullets = []
  }

  const flushTable = () => {
    if (!tableRows.length) return
    const isSeparator = row => row.every(cell => /^[-: ]+$/.test(cell))
    const rows = tableRows.filter(r => !isSeparator(r))
    if (rows.length < 2) { tableRows = []; return }
    const [head, ...body] = rows
    elements.push(
      <div key={k++} className="my-3 overflow-x-auto rounded-xl"
        style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ background: 'var(--brand-light)' }}>
              {head.map((cell, ci) => (
                <th key={ci} className="px-3 py-2 text-left font-semibold"
                  style={{ color: 'var(--brand)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {renderInline(cell.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2"
                    style={{ color: 'var(--text-2)', borderBottom: ri < body.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableRows = []
  }

  lines.forEach(raw => {
    const line = raw.trim()
    if (!line) { flushBullets(); flushTable(); return }

    if (line.startsWith('|') && line.endsWith('|')) {
      flushBullets()
      const cells = line.slice(1, -1).split('|')
      tableRows.push(cells)
      return
    }

    flushTable()

    if (line.startsWith('## ')) {
      flushBullets()
      elements.push(
        <div key={k++} className="flex items-center gap-2.5 mt-5 mb-2 first:mt-0">
          <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ background: 'var(--brand)' }} />
          <h3 style={{ color: 'var(--text)', fontSize: compact ? '0.9375rem' : '1rem', fontWeight: 600 }}>
            {line.slice(3)}
          </h3>
        </div>
      )
      return
    }

    if (line.startsWith('### ')) {
      flushBullets()
      elements.push(
        <h4 key={k++} className="mt-4 mb-1.5"
          style={{ color: 'var(--text)', fontSize: '0.875rem', fontWeight: 600 }}>
          {line.slice(4)}
        </h4>
      )
      return
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.slice(2))
      return
    }

    if (/^\d+\.\s/.test(line)) {
      flushBullets()
      const num  = line.match(/^(\d+)/)[1]
      const text = line.replace(/^\d+\.\s/, '')
      elements.push(
        <div key={k++} className="flex items-start gap-2.5 my-2">
          <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center font-semibold mt-0.5"
            style={{ background: 'var(--brand-light)', color: 'var(--brand)', fontSize: '0.7rem' }}>
            {num}
          </span>
          <span style={{ color: 'var(--text-2)', lineHeight: lh, fontSize: fs }}>{renderInline(text)}</span>
        </div>
      )
      return
    }

    if (RECAP_RE.test(line)) {
      flushBullets()
      const colonIdx = line.indexOf(':')
      const rest = colonIdx > -1 ? line.slice(colonIdx + 1).trim() : ''
      elements.push(
        <div key={k++} className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span style={{ color: 'var(--text-3)', fontSize: '0.7rem', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recap</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>
      )
      if (rest)
        elements.push(<p key={k++} style={{ color: 'var(--text-2)', lineHeight: lh, fontSize: fs, marginBottom: mb }}>{renderInline(rest)}</p>)
      return
    }

    flushBullets()
    elements.push(
      <p key={k++} style={{ color: 'var(--text-2)', lineHeight: lh, fontSize: fs, marginBottom: mb }}>
        {renderInline(line)}
      </p>
    )
  })

  flushBullets()
  flushTable()
  return (
    <div style={narrativeFont ? { fontFamily: narrativeFont } : undefined}>
      {elements}
    </div>
  )
}
