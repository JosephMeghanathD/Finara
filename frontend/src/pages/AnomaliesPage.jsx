import { useState, useEffect } from 'react'
import { txnApi, aiApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import { AlertTriangle, HelpCircle, ChevronRight, Sparkles, Info, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import AiText from '../components/AiText'
import AiLoader from '../components/AiLoader'

export default function AnomaliesPage() {
  const { startMonth, endMonth } = useTimeFilter()
  const [anomalies, setAnomalies]   = useState([])
  const [loading, setLoading]       = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [explaining, setExplaining]       = useState(null)
  const [explanations, setExplanations]   = useState({})
  const [merchantCache, setMerchantCache] = useState({})
  const [merchantLoading, setMerchantLoading] = useState(null)
  const [openMerchant, setOpenMerchant]   = useState(null)

  useEffect(() => {
    if (!startMonth || !endMonth) return
    setLoading(true)
    txnApi.anomalies(startMonth, endMonth).then(r => setAnomalies(r.data)).finally(() => setLoading(false))
  }, [startMonth, endMonth])

  const explainMerchantFor = async (txn) => {
    if (openMerchant === txn.id) { setOpenMerchant(null); return }
    setOpenMerchant(txn.id)
    const key = txn.description
    if (merchantCache[key]) return
    setMerchantLoading(key)
    try {
      const { data } = await aiApi.explainMerchant(key)
      setMerchantCache(prev => ({ ...prev, [key]: data }))
    } catch { toast.error('Could not identify merchant'); setOpenMerchant(null) }
    finally { setMerchantLoading(null) }
  }

  const recheck = async () => {
    setRechecking(true)
    try {
      const { data } = await txnApi.recheckAnomalies(startMonth, endMonth)
      toast.success(`Rechecked ${data.checked} transactions — ${data.flagged} flagged`)
      const r = await txnApi.anomalies(startMonth, endMonth)
      setAnomalies(r.data)
    } catch { toast.error('Recheck failed — is the ML service running?') }
    finally { setRechecking(false) }
  }

  const explain = async (txn) => {
    if (explanations[txn.id]) return
    setExplaining(txn.id)
    try {
      const { data } = await aiApi.explainAnomaly(txn.id)
      setExplanations(prev => ({ ...prev, [txn.id]: data.explanation }))
    } catch { toast.error('Could not explain — is Finara AI running?') }
    finally { setExplaining(null) }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Unusual Purchases</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            ML flagged these as outside your normal spending patterns
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5"
            style={{ background: 'var(--brand-light)', color: 'var(--brand)',
              border: '1px solid rgba(99,102,241,0.2)' }}>
            <Sparkles size={11} /> Finara AI
          </span>
          <button onClick={recheck} disabled={rechecking || !startMonth}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
            style={{ background: 'var(--surface)', color: 'var(--text-2)',
              border: '1px solid var(--border)', opacity: rechecking ? 0.6 : 1 }}>
            <RefreshCw size={11} className={rechecking ? 'animate-spin' : ''} />
            {rechecking ? 'Rechecking…' : 'Recheck Anomalies'}
          </button>
        </div>
      </div>

      {loading && <AiLoader type="anomaly" title="Anomaly Detection" />}

      {!loading && anomalies.length === 0 && (
        <div className="card text-center py-12">
          <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ background:'#ECFDF5' }}>
            <span className="text-2xl">✅</span>
          </div>
          <p className="font-semibold" style={{ color:'var(--text)' }}>No anomalies detected</p>
          <p className="text-sm mt-1" style={{ color:'var(--text-3)' }}>Your spending looks normal this period</p>
        </div>
      )}

      <div className="space-y-3">
        {anomalies.map(txn => (
          <div key={txn.id} className="card"
            style={{ borderColor:'rgba(245,158,11,0.25)', borderLeftWidth:3, borderLeftColor:'#F59E0B' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background:'rgba(245,158,11,0.12)' }}>
                  <AlertTriangle size={14} style={{ color:'#D97706' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium" style={{ color:'var(--text)' }}>{txn.description}</p>
                    <button onClick={() => explainMerchantFor(txn)}
                      title="What is this merchant?"
                      className="transition-opacity"
                      style={{ opacity: openMerchant === txn.id ? 1 : 0.4 }}>
                      <Info size={13} style={{ color: openMerchant === txn.id ? '#0EA5E9' : 'var(--text-3)' }} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs" style={{ color:'var(--text-3)' }}>
                    <span className="font-semibold font-mono" style={{ color:'var(--brand)' }}>
                      ${parseFloat(txn.amount).toFixed(2)}
                    </span>
                    <span>·</span><span>{txn.transactionDate}</span>
                    {txn.category && (
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ background:'var(--surface-2)', border:'1px solid var(--border)' }}>
                        {txn.category}
                      </span>
                    )}
                  </div>
                  {txn.anomalyReason && (
                    <p className="text-xs mt-1.5" style={{ color:'var(--text-3)' }}>{txn.anomalyReason}</p>
                  )}
                </div>
              </div>
              <button onClick={() => explain(txn)} disabled={explaining === txn.id}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg flex-shrink-0 font-medium transition-all"
                style={{ background:'var(--brand-light)', color:'var(--brand)',
                  border:'1px solid rgba(99,102,241,0.2)', opacity: explaining===txn.id ? 0.6 : 1 }}>
                <HelpCircle size={12} />
                {explaining===txn.id ? 'Asking…' : 'Ask why?'}
              </button>
            </div>

            {openMerchant === txn.id && (
              <div className="mt-3 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
                {merchantLoading === txn.description ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color:'#0EA5E9' }}>
                    <Info size={11} /><span>Identifying merchant…</span>
                  </div>
                ) : merchantCache[txn.description] ? (
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-4 rounded-full flex-shrink-0 mt-0.5" style={{ background:'#0EA5E9' }} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold" style={{ color:'#0EA5E9' }}>Merchant insight</p>
                        {merchantCache[txn.description].likely_category && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background:'rgba(14,165,233,0.12)', color:'#0EA5E9' }}>
                            {merchantCache[txn.description].likely_category}
                          </span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color:'var(--text-2)' }}>
                        {merchantCache[txn.description].explanation}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {explanations[txn.id] && (
              <div className="mt-4 pt-4" style={{ borderTop:'1px solid var(--border)' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-1 h-4 rounded-full" style={{ background:'var(--brand)' }} />
                  <p className="text-xs font-semibold" style={{ color:'var(--brand)' }}>Finara explains</p>
                </div>
                <AiText content={explanations[txn.id]} compact />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
