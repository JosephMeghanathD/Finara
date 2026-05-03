import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { txnApi } from '../utils/api'
import {
  Upload, FileText, CheckCircle, Trash2, AlertTriangle, RefreshCw,
  ArrowDownRight, ArrowUpRight,
} from 'lucide-react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import AiLoader from '../components/AiLoader'
import toast from 'react-hot-toast'

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d, yyyy') } catch { return str }
}
function fmtAgo(str) {
  try { return formatDistanceToNow(parseISO(str), { addSuffix: true }) } catch { return '' }
}
function fmtAmount(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function BatchCard({ batch, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      await txnApi.deleteBatch(batch.batchId)
      toast.success('Statement deleted')
      onDeleted()
    } catch {
      toast.error('Delete failed')
    } finally { setLoading(false) }
  }

  const dateRange = batch.earliestDate === batch.latestDate
    ? fmtDate(batch.earliestDate)
    : `${fmtDate(batch.earliestDate)} – ${fmtDate(batch.latestDate)}`

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--brand-light)' }}>
          <FileText size={16} style={{ color: 'var(--brand)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{dateRange}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                Uploaded {fmtAgo(batch.uploadedAt)} · {batch.transactionCount} transactions
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg px-3 py-2 flex items-center gap-2"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <ArrowUpRight size={13} style={{ color: '#34d399', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Money in</p>
                <p className="text-sm font-semibold font-mono" style={{ color: '#34d399' }}>
                  {fmtAmount(batch.creditTotal || 0)}
                </p>
              </div>
            </div>
            <div className="rounded-lg px-3 py-2 flex items-center gap-2"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <ArrowDownRight size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Money out</p>
                <p className="text-sm font-semibold font-mono" style={{ color: '#EF4444' }}>
                  {fmtAmount(batch.debitTotal || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            {confirming ? (
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: '#DC2626' }}>
                  Delete {batch.transactionCount} transactions permanently?
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setConfirming(false)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)',
                      border: '1px solid var(--border)' }}>
                    Cancel
                  </button>
                  <button onClick={handleDelete} disabled={loading}
                    className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#DC2626',
                      border: '1px solid rgba(239,68,68,0.25)' }}>
                    {loading
                      ? <RefreshCw size={11} className="animate-spin" />
                      : <Trash2 size={11} />}
                    Yes, delete
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                <Trash2 size={12} /> Delete this statement
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [file, setFile]             = useState(null)
  const [batches, setBatches]       = useState([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  const loadBatches = async () => {
    try {
      const { data } = await txnApi.batches()
      setBatches(data)
    } catch { /* silent */ }
    finally { setLoadingBatches(false) }
  }

  useEffect(() => { loadBatches() }, [])

  const onDrop = useCallback(files => { setFile(files[0]); setResult(null) }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      const { data } = isPdf ? await txnApi.uploadPdf(file) : await txnApi.upload(file)
      setResult(data)
      setFile(null)
      toast.success(`Processed ${data.total} transactions!`)
      loadBatches()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
    } finally { setLoading(false) }
  }

  const handleDeleteAll = async () => {
    setDeletingAll(true)
    try {
      await txnApi.deleteAll()
      setBatches([])
      setResult(null)
      setConfirmDeleteAll(false)
      toast.success('All data deleted')
    } catch {
      toast.error('Delete failed')
    } finally { setDeletingAll(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Upload spending data</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
          Upload a CSV export or PDF bank statement
        </p>
      </div>

      <div {...getRootProps()}
        className="rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer transition-all"
        style={{
          borderColor: isDragActive ? 'var(--brand)' : 'var(--border)',
          background:  isDragActive ? 'var(--brand-light)' : 'var(--surface)',
        }}>
        <input {...getInputProps()} />
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ background: isDragActive ? 'var(--brand)' : 'var(--surface-2)',
            border: '1px solid var(--border)' }}>
          <Upload size={22} style={{ color: isDragActive ? 'white' : 'var(--text-3)' }} />
        </div>
        {file ? (
          <div>
            <p className="font-medium flex items-center justify-center gap-2" style={{ color: 'var(--text)' }}>
              <FileText size={16} style={{ color: 'var(--brand)' }} /> {file.name}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              {(file.size / 1024).toFixed(1)} KB · Click to change
            </p>
          </div>
        ) : (
          <div>
            <p className="font-medium" style={{ color: 'var(--text)' }}>Drop your bank statement here</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>PDF or CSV · click to browse</p>
          </div>
        )}
      </div>

      {file && !result && !loading && (
        <button onClick={handleUpload} className="btn-primary flex items-center gap-2">
          <Upload size={16} /> Upload & analyze
        </button>
      )}

      {loading && <AiLoader type="upload" title="Fiana · Processing Upload" />}

      {result && (
        <div className="card" style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.03)' }}>
          <div className="flex items-start gap-4">
            <CheckCircle size={22} style={{ color: '#34d399', flexShrink: 0, marginTop: 2 }} />
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Upload successful!</h3>
              <div className="mt-2 space-y-1 text-sm" style={{ color: 'var(--text-2)' }}>
                <p>✓ <strong style={{ color: 'var(--text)' }}>{result.total}</strong> transactions processed</p>
                <p>✓ All auto-categorized by ML</p>
                <p>✓ <strong style={{ color: 'var(--text)' }}>{result.flagged}</strong> anomalies flagged</p>
              </div>
              <div className="flex gap-3 mt-4">
                <a href="/story" className="btn-primary text-sm">Generate my story</a>
                <a href="/transactions" className="btn-ghost text-sm">View transactions</a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Supported formats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--brand)' }}>📄 PDF Bank Statement</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Direct export from Bank of America, Chase, Wells Fargo, Citibank and most major banks.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#8B5CF6' }}>📊 CSV Export</p>
            <pre className="text-xs rounded-lg p-3 overflow-x-auto"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)',
                fontFamily: 'ui-monospace, monospace', border: '1px solid var(--border)' }}>
{`Date,Description,Amount
2026-03-11,STARBUCKS,5.75
2026-03-12,AMAZON,14.99`}
            </pre>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Your uploads</h3>
        {loadingBatches ? (
          <AiLoader type="transactions" title="Fiana · Loading uploads" compact />
        ) : batches.length === 0 ? (
          <div className="card text-center py-10">
            <FileText size={28} className="mx-auto mb-3" style={{ color: 'var(--text-3)' }} />
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No uploads yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map(b => (
              <BatchCard key={b.batchId} batch={b} onDeleted={loadBatches} />
            ))}
          </div>
        )}
      </div>

      {batches.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.08)' }}>
              <AlertTriangle size={15} style={{ color: '#EF4444' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>Danger zone</p>
              <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-3)' }}>
                Permanently deletes all transactions, budgets, and reports across all statements.
                This cannot be undone.
              </p>

              {confirmDeleteAll ? (
                <div className="flex items-center gap-3">
                  <button onClick={handleDeleteAll} disabled={deletingAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#DC2626',
                      border: '1px solid rgba(239,68,68,0.25)' }}>
                    {deletingAll
                      ? <><RefreshCw size={13} className="animate-spin" /> Deleting…</>
                      : <><Trash2 size={13} /> Yes, delete everything</>}
                  </button>
                  <button onClick={() => setConfirmDeleteAll(false)}
                    className="text-sm" style={{ color: 'var(--text-3)' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteAll(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'rgba(239,68,68,0.06)', color: '#DC2626',
                    border: '1px solid rgba(239,68,68,0.2)' }}>
                  <Trash2 size={13} /> Delete all data
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
