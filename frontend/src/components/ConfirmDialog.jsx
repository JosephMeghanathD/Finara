import { X, AlertTriangle } from 'lucide-react'

export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, danger = true }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {danger && (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertTriangle size={16} style={{ color: '#f87171' }} />
              </div>
            )}
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
          </div>
          <button onClick={onCancel} className="ml-2 flex-shrink-0">
            <X size={16} style={{ color: 'var(--text-3)' }} />
          </button>
        </div>

        {message && (
          <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>{message}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: danger ? 'rgba(239,68,68,0.15)' : 'var(--brand)',
              color: danger ? '#f87171' : 'white',
              border: danger ? '1px solid rgba(239,68,68,0.3)' : 'none' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
