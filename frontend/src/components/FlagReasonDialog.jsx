import { useState } from 'react'
import { X, Flag } from 'lucide-react'

export default function FlagReasonDialog({ txn, onCancel, onConfirm, loading }) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.1)' }}>
              <Flag size={16} style={{ color: '#F59E0B' }} />
            </div>
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Flag as anomaly</h3>
          </div>
          <button onClick={onCancel} className="ml-2 flex-shrink-0">
            <X size={16} style={{ color: 'var(--text-3)' }} />
          </button>
        </div>

        <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>
          "{txn.description}" · ${Number(txn.amount).toFixed(2)}
        </p>

        <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-3)' }}>
          Why is this suspicious? (optional)
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. I don't recognize this charge…"
          rows={3}
          autoFocus
          className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none mb-6"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />

        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(reason.trim())} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
              border: '1px solid rgba(245,158,11,0.3)', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Flagging…' : 'Flag transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
