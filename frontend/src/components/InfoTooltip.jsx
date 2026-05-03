import { Info } from 'lucide-react'
import { useState, useRef } from 'react'

export default function InfoTooltip({ title, content, size = 11, side = 'top' }) {
  const [show, setShow] = useState(false)
  const timer = useRef(null)

  const open  = () => { clearTimeout(timer.current); setShow(true) }
  const close = () => { timer.current = setTimeout(() => setShow(false), 80) }

  const isTop    = side === 'top'
  const isBottom = side === 'bottom'
  const isLeft   = side === 'left'
  const isRight  = side === 'right'

  const boxStyle = {
    position: 'absolute',
    zIndex: 9999,
    width: 220,
    padding: '10px 12px',
    borderRadius: 10,
    background: '#1a1d26',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
    color: 'var(--text-2)',
    fontSize: 11.5,
    lineHeight: 1.6,
    pointerEvents: 'none',
    ...(isTop    && { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }),
    ...(isBottom && { top:    'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }),
    ...(isLeft   && { right:  'calc(100% + 8px)', top:  '50%', transform: 'translateY(-50%)' }),
    ...(isRight  && { left:   'calc(100% + 8px)', top:  '50%', transform: 'translateY(-50%)' }),
  }

  const arrowBase = {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
  }
  const arrowStyle = isTop
    ? { ...arrowBase, top: '100%', left: '50%', transform: 'translateX(-50%)',
        borderWidth: '5px 5px 0 5px',
        borderColor: 'rgba(255,255,255,0.14) transparent transparent transparent' }
    : isBottom
    ? { ...arrowBase, bottom: '100%', left: '50%', transform: 'translateX(-50%)',
        borderWidth: '0 5px 5px 5px',
        borderColor: 'transparent transparent rgba(255,255,255,0.14) transparent' }
    : isLeft
    ? { ...arrowBase, left: '100%', top: '50%', transform: 'translateY(-50%)',
        borderWidth: '5px 0 5px 5px',
        borderColor: 'transparent transparent transparent rgba(255,255,255,0.14)' }
    : { ...arrowBase, right: '100%', top: '50%', transform: 'translateY(-50%)',
        borderWidth: '5px 5px 5px 0',
        borderColor: 'transparent rgba(255,255,255,0.14) transparent transparent' }

  return (
    <span
      className="relative inline-flex items-center flex-shrink-0"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      <button
        type="button"
        tabIndex={-1}
        style={{ opacity: 0.4, color: 'var(--text-3)', lineHeight: 0, cursor: 'default' }}
        onMouseEnter={e => { e.currentTarget.style.opacity = 0.85 }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 0.4 }}
      >
        <Info size={size} />
      </button>
      {show && (
        <div style={boxStyle}>
          {title && (
            <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4, fontSize: 12 }}>
              {title}
            </p>
          )}
          <p>{content}</p>
          <div style={arrowStyle} />
        </div>
      )}
    </span>
  )
}
