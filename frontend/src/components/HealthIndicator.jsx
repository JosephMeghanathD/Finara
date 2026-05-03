import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { healthApi } from '../utils/api'

const POLL_MS = 30_000

function StatusDot({ status, size = 8 }) {
  const color = status === 'up' ? '#22c55e' : status === 'checking' ? '#f59e0b' : '#ef4444'
  const pulse  = status === 'checking'
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        opacity: pulse ? 0.6 : 0,
        animation: pulse ? 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite' : 'none',
      }} />
      <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block' }} />
    </span>
  )
}

function ServiceRow({ svc }) {
  const Icon = svc.status === 'up' ? CheckCircle2 : svc.status === 'checking' ? AlertCircle : XCircle
  const color = svc.status === 'up' ? '#22c55e' : svc.status === 'checking' ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <Icon size={14} style={{ color, marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: '#e1e2ec', fontSize: 12, fontWeight: 500, margin: 0 }}>{svc.name}</p>
        {svc.detail && (
          <p style={{ color: '#636779', fontSize: 11, margin: '2px 0 0', wordBreak: 'break-word' }}>{svc.detail}</p>
        )}
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {svc.status}
      </span>
    </div>
  )
}

export default function HealthIndicator() {
  const [data, setData]       = useState(null)   // { overall, services, checkedAt }
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const [error, setError]     = useState(false)
  const panelRef              = useRef(null)
  const btnRef                = useRef(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await healthApi.check()
      setData(res.data)
      setError(false)
    } catch {
      setError(true)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    fetch()
    const id = setInterval(fetch, POLL_MS)
    return () => clearInterval(id)
  }, [fetch])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const overall      = error ? 'down' : data?.overall ?? 'checking'
  const dotStatus    = loading && !data ? 'checking' : overall === 'healthy' ? 'up' : overall === 'degraded' ? 'checking' : 'down'
  const labelColor   = dotStatus === 'up' ? '#22c55e' : dotStatus === 'checking' ? '#f59e0b' : '#ef4444'
  const label        = dotStatus === 'up' ? 'All systems up' : dotStatus === 'checking' ? 'Checking…' : 'Services down'

  const checkedAgo   = data?.checkedAt
    ? (() => {
        const secs = Math.round((Date.now() - new Date(data.checkedAt).getTime()) / 1000)
        return secs < 5 ? 'just now' : `${secs}s ago`
      })()
    : null

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Trigger button ── */}
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.06)' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <Activity size={13} style={{ color: labelColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#8c909f', textAlign: 'left' }}>
          {label}
        </span>
        <StatusDot status={dotStatus} size={7} />
      </button>

      {/* ── Popover panel ── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute', bottom: '110%', left: 0, right: 0,
            background: '#131720', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: '12px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 9999,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ color: '#e1e2ec', fontSize: 12, fontWeight: 600, margin: 0 }}>Service Health</p>
            <button
              onClick={e => { e.stopPropagation(); fetch() }}
              title="Refresh"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }}
            >
              <RefreshCw size={11} style={{ color: '#636779', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          {checkedAgo && (
            <p style={{ color: '#424754', fontSize: 10, margin: '0 0 8px' }}>Checked {checkedAgo}</p>
          )}

          {/* Service rows */}
          {error && (
            <p style={{ color: '#ef4444', fontSize: 11, margin: 0 }}>Cannot reach backend</p>
          )}
          {data?.services?.map(svc => (
            <ServiceRow key={svc.name} svc={svc} />
          ))}
          {!data && !error && (
            <p style={{ color: '#636779', fontSize: 11, margin: 0 }}>Loading…</p>
          )}
        </div>
      )}

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
