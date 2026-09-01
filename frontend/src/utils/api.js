import axios from 'axios'
import { loadingBus } from './loadingBus'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60s for Gemma responses
})

// ── URL → { label, type } lookup table ───────────────────────────────────────
// Order matters: more-specific prefixes come first.
const LOAD_MAP = [
  // Auth
  ['POST', '/auth/login',                       'Signing you in…',                     'auth'],
  ['POST', '/auth/register',                    'Creating your account…',              'auth'],
  // Uploads (specific before generic)
  ['POST', '/transactions/upload-pdf',          'Reading PDF statement…',              'upload'],
  ['POST', '/transactions/upload',              'Parsing bank statement…',             'upload'],
  // Transactions
  ['POST', '/transactions/recheck-anomalies',   'Rescanning for anomalies…',           'ml'],
  ['GET',  '/transactions/anomalies',           'Detecting anomalies…',                'ml'],
  ['GET',  '/transactions/summary',             'Loading spending summary…',           'data'],
  ['GET',  '/transactions/months',              'Loading history…',                    'data'],
  ['GET',  '/transactions/batches',             'Loading uploads…',                    'data'],
  ['DELETE','/transactions/batch',              'Deleting batch…',                     'data'],
  ['DELETE','/transactions/all',                'Clearing all transactions…',          'data'],
  ['PATCH', '/transactions',                    'Updating transaction…',               'data'],
  ['GET',  '/transactions',                     'Loading transactions…',               'data'],
  ['POST', '/transactions',                     'Saving transaction…',                 'data'],
  ['PUT',  '/transactions',                     'Updating transaction…',               'data'],
  ['DELETE','/transactions',                    'Removing transaction…',               'data'],
  // Reports
  ['GET',  '/reports/compare',                  'Comparing months…',                   'data'],
  ['GET',  '/reports',                          'Loading reports…',                    'data'],
  // Forecast (specific first)
  ['GET',  '/forecast/budget-suggest',          'Generating budget suggestions…',      'ml'],
  ['GET',  '/forecast/seasonality',             'Analysing seasonal patterns…',        'ml'],
  ['GET',  '/forecast/accuracy',                'Measuring forecast accuracy…',        'ml'],
  ['GET',  '/forecast/multi',                   'Running multi-period forecast…',      'ml'],
  ['POST', '/forecast/refresh',                 'Refreshing forecast…',                'ml'],
  ['GET',  '/forecast/daily',                   'Loading daily forecast…',             'ml'],
  ['GET',  '/forecast/range',                   'Loading forecast range…',             'ml'],
  ['GET',  '/forecast',                         'Running ML forecast…',                'ml'],
  // Budget (specific first)
  ['GET',  '/budget/history',                   'Loading budget history…',             'data'],
  ['GET',  '/budget/context',                   'Loading budget context…',             'data'],
  ['GET',  '/budget/analysis',                  'Analysing budget…',                   'ml'],
  ['GET',  '/budget/multi',                     'Loading multi-month budget…',         'data'],
  ['POST', '/budget/multi',                     'Saving budget plan…',                 'data'],
  ['GET',  '/budget',                           'Loading budget…',                     'data'],
  ['POST', '/budget',                           'Saving budget…',                      'data'],
  // AI / Gemma (specific first)
  ['GET',  '/ai/story/data',                    'Loading financial data…',             'data'],
  ['POST', '/ai/story',                         'Generating your financial story…',    'ai'],
  ['POST', '/ai/explain-anomaly',               'Analysing unusual transaction…',      'ai'],
  ['POST', '/ai/reality-check',                 'Running savings reality check…',      'ai'],
  ['POST', '/ai/savings-plan',                  'Building your savings plan…',         'ai'],
  ['POST', '/ai/chat',                          'Asking Fiana AI…',                    'ai'],
  ['POST', '/ai/explain-merchant',              'Looking up merchant…',                'ai'],
  ['GET',  '/ai/coach/tips',                     'Loading saved tips…',                 'data'],
  ['POST', '/ai/coach/tips',                     'Saving tips…',                        'data'],
  ['PATCH','/ai/coach/tip',                      'Updating task…',                      'data'],
  ['GET',  '/ai/coach',                         'Loading coaching tips…',              'ai'],
  // Insights
  ['GET',  '/subscriptions/transactions',       'Loading subscription history…',       'data'],
  ['GET',  '/subscriptions',                    'Detecting subscriptions…',            'ml'],
  ['GET',  '/merchants',                        'Loading merchant data…',              'data'],
  // Stocks
  ['GET',  '/stocks/market',                    'Loading market data…',                'data'],
  ['GET',  '/stocks/quote',                     'Fetching stock quotes…',              'data'],
  ['POST', '/stocks/match-merchants',           'Matching your brands…',              'ml'],
  ['POST', '/stocks/sector-etfs',               'Loading sector data…',               'ml'],
  // Health — skip (return null = no loader)
  ['GET',  '/health',                           null, null],
  ['GET',  '/api/health',                       null, null],
]

function getLoadInfo(method, url) {
  const m = (method || 'GET').toUpperCase()
  for (const [rm, rurl, label, type] of LOAD_MAP) {
    if (rm === m && url?.startsWith(rurl)) {
      if (label === null) return null   // explicitly skipped
      return { label, type }
    }
  }
  return { label: 'Loading…', type: 'data' }
}

// ── Request interceptor — attach JWT + start loader ───────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('fiana_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const info = getLoadInfo(config.method, config.url)
  if (info) {
    config._loadingId = loadingBus.start(info.label, info.type)
  }

  return config
})

// ── Response interceptor — handle 401 + end loader ────────────────────────────
api.interceptors.response.use(
  res => {
    if (res.config._loadingId != null) loadingBus.end(res.config._loadingId)
    return res
  },
  err => {
    if (err.config?._loadingId != null) loadingBus.end(err.config._loadingId)
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('fiana_token')
      localStorage.removeItem('fiana_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: data  => api.post('/auth/register', data),
  login:    data  => api.post('/auth/login', data),
}

// ─── Transactions ─────────────────────────────────────────────────────────────
export const txnApi = {
  upload:        file                   => { const fd = new FormData(); fd.append('file', file); return api.post('/transactions/upload', fd) },
  uploadPdf:     file                   => { const fd = new FormData(); fd.append('file', file); return api.post('/transactions/upload-pdf', fd) },
  list:          (startDate, endDate)   => api.get('/transactions', { params: { startDate, endDate } }),
  summary:       (startMonth, endMonth) => api.get('/transactions/summary', { params: { startMonth, endMonth } }),
  anomalies:     (startDate, endDate)   => api.get('/transactions/anomalies', { params: { startDate, endDate } }),
  months:        ()                     => api.get('/transactions/months'),
  batches:       ()                     => api.get('/transactions/batches'),
  deleteBatch:   batchId                => api.delete(`/transactions/batch/${batchId}`),
  deleteAll:     ()                     => api.delete('/transactions/all'),
  recheckAnomalies: (startDate, endDate)   => api.post('/transactions/recheck-anomalies', null, { params: { startDate, endDate } }),
  toggleAnomaly: (id, isAnomaly, userReason) => api.patch(`/transactions/${id}/anomaly`, { isAnomaly, userReason }),
  create:        data                   => api.post('/transactions', data),
  update:        (id, data)             => api.put(`/transactions/${id}`, data),
  delete:        id                     => api.delete(`/transactions/${id}`),
}

// ─── Reports + Forecast ───────────────────────────────────────────────────────
export const reportApi = {
  list:     months => api.get('/reports', { params: { months } }),
  get:      month  => api.get(`/reports/${month}`),
  forecast:        month => api.get('/forecast',          { params: { month } }),
  forecastDaily:   month => api.get('/forecast/daily',    { params: { month } }),
  forecastRange:   (startDate, endDate) => api.get('/forecast/range', { params: { startDate, endDate } }),
  forecastRefresh:      month              => api.post('/forecast/refresh',      null, { params: { month } }),
  forecastSeasonality:  ()                 => api.get('/forecast/seasonality'),
  forecastMulti:        (baseMonth, periods) => api.get('/forecast/multi',       { params: { baseMonth, periods } }),
  forecastBudgetSuggest: month             => api.get('/forecast/budget-suggest', { params: { month } }),
  forecastAccuracy:     ()                 => api.get('/forecast/accuracy'),
  compareDaily:    months => api.get('/reports/compare/daily',    { params: { months } }),
  compareInsights: months => api.get('/reports/compare/insights', { params: { months } }),
}

// ─── Budget ───────────────────────────────────────────────────────────────────
export const budgetApi = {
  get:       (month, includeAnalysis = true) => api.get('/budget',          { params: { month, includeAnalysis } }),
  save:      data                            => api.post('/budget',          data),
  context:   month                           => api.get('/budget/context',   { params: { month } }),
  history:   months                          => api.get('/budget/history',   { params: { months } }),
  analysis:  month                           => api.get('/budget/analysis',  { params: { month } }),
  getMulti:  (baseMonth, periods = 6)        => api.get('/budget/multi',     { params: { baseMonth, periods } }),
  saveMulti: data                            => api.post('/budget/multi',    data),
}

// ─── Spending Insights ────────────────────────────────────────────────────────
export const insightsApi = {
  subscriptions:            ()                     => api.get('/subscriptions'),
  subscriptionTransactions: name                    => api.get('/subscriptions/transactions', { params: { name } }),
  merchantLeaderboard:      (startMonth, endMonth) => api.get('/merchants/leaderboard', { params: { startMonth, endMonth } }),
}

// ─── Stocks ───────────────────────────────────────────────────────────────────
export const stocksApi = {
  market:         ()           => api.get('/stocks/market'),
  quote:          symbols      => api.get('/stocks/quote', { params: { symbols } }),
  matchMerchants: merchants    => api.post('/stocks/match-merchants', { merchants }),
  sectorEtfs:     categories   => api.post('/stocks/sector-etfs', { categories }),
}

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthApi = {
  check: () => axios.get('/api/health', { timeout: 8000 }),
}

// ─── AI / Gemma ───────────────────────────────────────────────────────────────
export const aiApi = {
  storyData:       (startMonth, endMonth) => api.get('/ai/story/data', { params: { startMonth, endMonth } }),
  story:           (startMonth, endMonth, refresh = false) => api.post('/ai/story', { startMonth, endMonth, refresh: refresh ? 'true' : undefined }),
  explainAnomaly:  txnId                  => api.post('/ai/explain-anomaly',  { transactionId: txnId }),
  realityCheck:    data                   => api.post('/ai/reality-check',    data),
  savingsPlan:     data                   => api.post('/ai/savings-plan',     data),
  chat:            data                   => api.post('/ai/chat',             data),
  explainMerchant: name                   => api.post('/ai/explain-merchant', { merchantName: name }),
  coach:           (week, refresh)         => api.get('/ai/coach',             { params: { week, ...(refresh ? { refresh: true } : {}) } }),
  coachTips:       week                   => api.get('/ai/coach/tips',         { params: { week } }),
  saveCoachTips:   (week, tips)           => api.post('/ai/coach/tips',        { week, tips }),
  toggleCoachTip:  (id, done)             => api.patch(`/ai/coach/tip/${id}/done`, { done }),
}
