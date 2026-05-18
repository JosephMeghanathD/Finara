import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60s for Gemma responses
})

// Attach JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('fiana_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
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
  toggleAnomaly: (id, isAnomaly)        => api.patch(`/transactions/${id}/anomaly`, { isAnomaly }),
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
}
