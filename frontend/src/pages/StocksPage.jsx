import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { stocksApi, insightsApi } from '../utils/api'
import { useTimeFilter } from '../hooks/useTimeFilter'
import {
  TrendingUp, TrendingDown, BarChart2, Sparkles,
  ArrowRight, RefreshCw, Building2, Globe2, Layers,
} from 'lucide-react'
import ScrollFade from '../components/ScrollFade'
import InfoTooltip from '../components/InfoTooltip'
import toast from 'react-hot-toast'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt$  = (n, dp = 2) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const fmtPct = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

function Sk({ w = '100%', h = 14, r = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3,rgba(255,255,255,0.08)) 50%,var(--surface-2) 75%)',
      backgroundSize: '200% 100%',
      animation: 'sk 1.4s infinite',
    }} />
  )
}

// ── Index card ────────────────────────────────────────────────────────────────
function IndexCard({ item }) {
  const up = item.change_pct >= 0
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1.5"
      style={{ background: 'var(--surface)', border: `1px solid ${up ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{item.label}</span>
        {up
          ? <TrendingUp size={13} style={{ color: '#34d399' }} />
          : <TrendingDown size={13} style={{ color: '#f87171' }} />
        }
      </div>
      <p className="text-lg font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {fmt$(item.price, item.ticker?.startsWith('^V') ? 2 : 0)}
      </p>
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full self-start"
        style={{
          background: up ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
          color: up ? '#34d399' : '#f87171',
        }}>
        {fmtPct(item.change_pct)}
      </span>
    </div>
  )
}

// ── Merchant stock card ───────────────────────────────────────────────────────
function MerchantCard({ item, onAskFiana }) {
  const up   = item.change_pct >= 0
  const gain = item.invest_instead?.gain ?? 0

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold px-2 py-0.5 rounded-lg"
              style={{ background: 'var(--brand-light)', color: 'var(--brand)', fontFamily: '"JetBrains Mono", monospace' }}>
              ${item.ticker}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: up ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                color: up ? '#34d399' : '#f87171',
              }}>
              {fmtPct(item.change_pct)}
            </span>
          </div>
          <p className="text-xs mt-1.5 capitalize" style={{ color: 'var(--text-3)' }}>
            {item.merchant_name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt$(item.price)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>per share</p>
        </div>
      </div>

      {/* Spend vs invest comparison */}
      <div className="rounded-xl p-3 flex flex-col gap-2"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
          Invest Instead — 12 months
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>You spend / mo</p>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{fmt$(item.monthly_spent)}</p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>1yr stock return</p>
            <p className="text-sm font-bold" style={{ color: up ? '#34d399' : '#f87171' }}>
              {fmtPct(item.annual_return_pct)}
            </p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>Total invested</p>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{fmt$(item.invest_instead?.total_invested)}</p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>Value today</p>
            <p className="text-sm font-bold" style={{ color: gain >= 0 ? '#34d399' : '#f87171' }}>
              {fmt$(item.invest_instead?.value_now)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          {gain >= 0
            ? <TrendingUp size={11} style={{ color: '#34d399' }} />
            : <TrendingDown size={11} style={{ color: '#f87171' }} />
          }
          <span className="text-xs font-semibold" style={{ color: gain >= 0 ? '#34d399' : '#f87171' }}>
            {gain >= 0 ? '+' : ''}{fmt$(gain)} {gain >= 0 ? 'gain' : 'loss'} vs spending
          </span>
        </div>
      </div>

      {/* Ask Fiana */}
      <button
        onClick={() => onAskFiana(`How much would I have if I invested my ${item.merchant_name} spending into $${item.ticker} stock?`)}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-all self-start"
        style={{ background: 'var(--brand-light)', color: 'var(--brand)', border: '1px solid rgba(91,155,255,0.2)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(91,155,255,0.15)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--brand-light)'}>
        <Sparkles size={11} /> Ask Fiana
      </button>
    </div>
  )
}

// ── Sector ETF card ───────────────────────────────────────────────────────────
function SectorCard({ item }) {
  const up = item.change_pct >= 0
  const pctWidth = Math.min(Math.abs(item.change_pct) * 10, 100)

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{item.label}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            {item.ticker} · You spend <strong>{fmt$(item.category_spend)}</strong> on {item.category}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt$(item.price)}
          </p>
          <span className="text-xs font-semibold" style={{ color: up ? '#34d399' : '#f87171' }}>
            {fmtPct(item.change_pct)}
          </span>
        </div>
      </div>

      {/* Mini bar */}
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pctWidth}%`, background: up ? '#34d399' : '#f87171' }} />
      </div>

      <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
        {up ? 'This sector is up today — companies you fund through spending are performing.' : 'This sector is down today.'}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const navigate = useNavigate()
  const { startMonth, endMonth } = useTimeFilter()

  const [indices,     setIndices]     = useState([])
  const [merchants,   setMerchants]   = useState([])
  const [sectorEtfs,  setSectorEtfs]  = useState([])
  const [loadingIdx,  setLoadingIdx]  = useState(true)
  const [loadingMrch, setLoadingMrch] = useState(true)
  const [loadingSect, setLoadingSect] = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)

  const loadMarket = useCallback(async () => {
    setLoadingIdx(true)
    try {
      const { data } = await stocksApi.market()
      setIndices(data.indices || [])
    } catch {
      toast.error('Could not load market data')
    } finally {
      setLoadingIdx(false)
    }
  }, [])

  const loadMerchantStocks = useCallback(async () => {
    if (!startMonth) { setLoadingMrch(false); return }
    setLoadingMrch(true)
    try {
      const { data: lb } = await insightsApi.merchantLeaderboard(startMonth, endMonth)
      const top = (lb.leaderboard || []).slice(0, 12).map(m => ({
        name: m.merchant || m.description || '',
        total_spent: m.total || m.total_spent || 0,
      }))
      if (!top.length) { setMerchants([]); return }
      const { data } = await stocksApi.matchMerchants(top)
      setMerchants(data.matches || [])
    } catch {
      setMerchants([])
    } finally {
      setLoadingMrch(false)
    }
  }, [startMonth, endMonth])

  const loadSectorEtfs = useCallback(async () => {
    if (!startMonth) { setLoadingSect(false); return }
    setLoadingSect(true)
    try {
      const sumRes = await fetch(`/api/transactions/summary?startMonth=${startMonth}&endMonth=${endMonth || startMonth}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('fiana_token')}` },
      })
      const sumData = await sumRes.json()
      const categories = sumData.categories || sumData.category_totals || {}
      if (!Object.keys(categories).length) { setSectorEtfs([]); return }
      const { data } = await stocksApi.sectorEtfs(categories)
      setSectorEtfs(data.sector_etfs || [])
    } catch {
      setSectorEtfs([])
    } finally {
      setLoadingSect(false)
    }
  }, [startMonth, endMonth])

  useEffect(() => { loadMarket() }, [loadMarket])
  useEffect(() => { loadMerchantStocks() }, [loadMerchantStocks])
  useEffect(() => { loadSectorEtfs() }, [loadSectorEtfs])

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([loadMarket(), loadMerchantStocks(), loadSectorEtfs()])
    setRefreshing(false)
    toast.success('Stock data refreshed')
  }

  const askFiana = (prefill) => {
    navigate('/chat', { state: { prefillMessage: prefill } })
  }

  return (
    <div className="flex flex-col gap-7">

      {/* ── Header ── */}
      <ScrollFade>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
              Invest Instead
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              See the stocks behind the brands you spend at — and what you'd have if you invested that money instead.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all flex-shrink-0"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </ScrollFade>

      {/* ── Market Pulse ── */}
      <ScrollFade>
        <div className="flex items-center gap-2 mb-3">
          <Globe2 size={14} style={{ color: 'var(--brand)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Market Pulse</h3>
          <InfoTooltip text="Live snapshot of major indices. VIX above 20 = elevated market fear." />
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
            Live
          </span>
        </div>
        {loadingIdx ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><Sk h={16} /><div className="mt-2"><Sk h={28} w="70%" /></div><div className="mt-2"><Sk h={20} w="50%" r={999} /></div></div>)}
          </div>
        ) : indices.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {indices.map(item => <IndexCard key={item.ticker} item={item} />)}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>Market data unavailable — check that yfinance is installed in the ML service.</p>
        )}
      </ScrollFade>

      {/* ── Brands You Spend At ── */}
      <ScrollFade>
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={14} style={{ color: '#f59e0b' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Brands You Spend At</h3>
          <InfoTooltip text="Merchants from your transactions matched to public stock tickers. Shows what you'd have if you'd invested your monthly spend instead." />
        </div>
        {loadingMrch ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Sk h={18} w="60%" /><Sk h={14} w="40%" />
                <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <Sk h={12} w="50%" /><Sk h={16} w="80%" /><Sk h={16} w="80%" />
                </div>
              </div>
            ))}
          </div>
        ) : merchants.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {merchants.map(m => (
              <MerchantCard key={m.ticker} item={m} onAskFiana={askFiana} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              No public company matches found in your transactions for this period.
              Try selecting a different date range or uploading more transaction data.
            </p>
          </div>
        )}
      </ScrollFade>

      {/* ── Sector ETFs ── */}
      <ScrollFade>
        <div className="flex items-center gap-2 mb-3">
          <Layers size={14} style={{ color: '#8b5cf6' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Sectors You Fund</h3>
          <InfoTooltip text="Your top spending categories mapped to sector ETFs. Each dollar you spend in a sector also drives revenue for companies in that ETF." />
        </div>
        {loadingSect ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><Sk h={14} w="60%" /><div className="mt-1"><Sk h={11} w="80%" /></div><div className="mt-3"><Sk h={4} r={999} /></div></div>)}
          </div>
        ) : sectorEtfs.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectorEtfs.map(item => <SectorCard key={item.ticker} item={item} />)}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>No sector data for this period.</p>
        )}
      </ScrollFade>

      {/* ── Ask Fiana CTA ── */}
      <ScrollFade>
        <div className="rounded-2xl p-5 flex items-center justify-between gap-4"
          style={{ background: 'linear-gradient(135deg, rgba(91,155,255,0.08) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(91,155,255,0.18)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} style={{ color: 'var(--brand)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Ask Fiana about your investments</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              "How much would I have if I invested my Starbucks spending?" · "Is the market up today?" · "Show me stocks in my top spending categories"
            </p>
          </div>
          <button
            onClick={() => askFiana('What stocks are the brands I spend the most at, and how are they performing?')}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-all flex-shrink-0"
            style={{ background: 'var(--brand)', color: 'white' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            Ask Fiana <ArrowRight size={12} />
          </button>
        </div>
      </ScrollFade>
    </div>
  )
}
