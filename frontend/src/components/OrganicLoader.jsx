import { useEffect, useState, useRef } from 'react'
import { Sparkles, Cpu, Upload, Zap, Lock } from 'lucide-react'
import { useActiveLoads } from '../context/LoadingContext'

// ── Per-type visual config ─────────────────────────────────────────────────────
const TYPE_CONFIG = {
  ai:     { Icon: Sparkles, label: 'Fiana AI',    color: '#5b9bff', soft: 'rgba(91,155,255,0.15)',  glow: 'rgba(91,155,255,0.5)'  },
  ml:     { Icon: Cpu,      label: 'ML Engine',   color: '#22d3ee', soft: 'rgba(34,211,238,0.12)',  glow: 'rgba(34,211,238,0.45)' },
  upload: { Icon: Upload,   label: 'Processing',  color: '#06b6d4', soft: 'rgba(6,182,212,0.12)',   glow: 'rgba(6,182,212,0.45)'  },
  data:   { Icon: Zap,      label: 'Loading',     color: '#a78bfa', soft: 'rgba(167,139,250,0.12)', glow: 'rgba(167,139,250,0.4)' },
  auth:   { Icon: Lock,     label: 'Auth',         color: '#10b981', soft: 'rgba(16,185,129,0.12)',  glow: 'rgba(16,185,129,0.4)'  },
}

// ── Organic thinking dots (AI) ─────────────────────────────────────────────────
function ThinkingDots({ color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 3, height: 3, borderRadius: '50%', background: color,
          animation: `organicDot 1.3s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Organic pulse dot (data / ml) ─────────────────────────────────────────────
function PulseDot({ color }) {
  return (
    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color, opacity: 0.3,
        animation: 'organicRipple 1.6s ease-out infinite',
      }} />
      <div style={{
        position: 'absolute', inset: 2, borderRadius: '50%', background: color,
        animation: 'organicPulseDot 1.6s ease-in-out infinite',
      }} />
    </div>
  )
}

// ── Upload arrow bounce ────────────────────────────────────────────────────────
function UploadArrow({ color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 1.5, height: 4, borderRadius: 999, background: color,
          animation: `organicUploadBar 1s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Spinning ring (ML) ────────────────────────────────────────────────────────
function SpinRing({ color }) {
  return (
    <div style={{
      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
      border: `2px solid ${color}30`,
      borderTopColor: color,
      animation: 'organicSpin 0.9s linear infinite',
    }} />
  )
}

// ── Main global loader ─────────────────────────────────────────────────────────
export default function OrganicLoader() {
  const loads = useActiveLoads()
  const isActive = loads.length > 0
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const exitTimer = useRef(null)

  // Prioritise AI → ML → upload → data → auth
  const primaryLoad = (
    loads.find(l => l.type === 'ai')    ||
    loads.find(l => l.type === 'ml')    ||
    loads.find(l => l.type === 'upload')||
    loads[loads.length - 1]
  )

  useEffect(() => {
    clearTimeout(exitTimer.current)
    if (isActive) {
      setExiting(false)
      setMounted(true)
    } else if (mounted) {
      setExiting(true)
      exitTimer.current = setTimeout(() => { setMounted(false); setExiting(false) }, 700)
    }
    return () => clearTimeout(exitTimer.current)
  }, [isActive])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null

  const cfg = TYPE_CONFIG[primaryLoad?.type] || TYPE_CONFIG.data
  const { Icon, color, soft, glow } = cfg

  return (
    <>
      {/* ── Top neon progress bar ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 9999,
        overflow: 'hidden', pointerEvents: 'none',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }}>
        {/* Dim ambient track */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(90deg, transparent, ${color}25, transparent)`,
          animation: 'organicAmbient 2s ease-in-out infinite',
        }} />
        {/* Hot-spot comet — left to right */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: '35%',
          background: `linear-gradient(90deg, transparent, ${color}60, ${color}, rgba(255,255,255,0.9), ${color}, ${color}60, transparent)`,
          animation: 'organicComet 1.55s cubic-bezier(0.37, 0, 0.63, 1) infinite',
          boxShadow: `0 0 10px ${glow}, 0 0 4px rgba(255,255,255,0.6)`,
        }} />
      </div>

      {/* ── Floating status chip (bottom-right) ── */}
      <div style={{
        position: 'fixed', bottom: 20, right: 16, zIndex: 9998, pointerEvents: 'none',
        transform: exiting ? 'translateY(16px) scale(0.92)' : 'translateY(0) scale(1)',
        opacity: exiting ? 0 : 1,
        transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.45s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 11px 7px 9px',
          borderRadius: 999,
          background: 'rgba(9,12,20,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${color}35`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04), 0 0 24px ${glow}40`,
        }}>
          {/* Icon badge */}
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: soft,
            flexShrink: 0,
          }}>
            <Icon size={11} style={{ color }} />
          </div>

          {/* Label */}
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12, fontWeight: 600, color: '#c4ceff',
            maxWidth: 200, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.01em',
          }}>
            {primaryLoad?.label || 'Loading…'}
          </span>

          {/* Type-specific animation */}
          {primaryLoad?.type === 'ai'     && <ThinkingDots color={color} />}
          {primaryLoad?.type === 'ml'     && <SpinRing color={color} />}
          {primaryLoad?.type === 'upload' && <UploadArrow color={color} />}
          {(primaryLoad?.type === 'data' || primaryLoad?.type === 'auth') && <PulseDot color={color} />}

          {/* Multi-load badge */}
          {loads.length > 1 && (
            <div style={{
              minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
              background: `${color}22`,
              color, fontSize: 9, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${color}40`,
              flexShrink: 0,
            }}>
              {loads.length}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Inline card loader — drop-in replacement for simple loading states ─────────
export function InlineOrganicLoader({ label = 'Loading…', type = 'data' }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.data
  const { Icon, color, soft } = cfg

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 10,
      background: soft, border: `1px solid ${color}25`,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}18`, flexShrink: 0,
      }}>
        <Icon size={12} style={{ color }} className="ai-pulse-icon" />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, fontFamily: "'DM Sans', sans-serif" }}>
        {label}
      </span>
      {type === 'ai' ? (
        <ThinkingDots color={color} />
      ) : (
        <PulseDot color={color} />
      )}
    </div>
  )
}

// ── Skeleton shimmer row — utility ────────────────────────────────────────────
export function SkeletonRow({ lines = 3, gap = 10 }) {
  const widths = ['78%', '55%', '66%', '45%', '70%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 12, borderRadius: 6, width: widths[i % widths.length] }} />
      ))}
    </div>
  )
}
