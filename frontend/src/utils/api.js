import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60s for Gemma responses
})

// Attach JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('finara_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('finara_token')
      localStorage.removeItem('finara_user')
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
  forecast:      month => api.get('/forecast',       { params: { month } }),
  forecastDaily: month => api.get('/forecast/daily', { params: { month } }),
}

// ─── Budget ───────────────────────────────────────────────────────────────────
export const budgetApi = {
  get:         (month, includeAnalysis = true) => api.get('/budget', { params: { month, includeAnalysis } }),
  save:        data => api.post('/budget', data),
}

// ─── AI / Gemma ───────────────────────────────────────────────────────────────
export const aiApi = {
  story:           (startMonth, endMonth, refresh = false) => api.post('/ai/story', { startMonth, endMonth, refresh: refresh ? 'true' : undefined }),
  explainAnomaly:  txnId                  => api.post('/ai/explain-anomaly',  { transactionId: txnId }),
  realityCheck:    data                   => api.post('/ai/reality-check',    data),
  savingsPlan:     data                   => api.post('/ai/savings-plan',     data),
  chat:            data                   => api.post('/ai/chat',             data),
  explainMerchant: name                   => api.post('/ai/explain-merchant', { merchantName: name }),
  coach:           week                   => api.get('/ai/coach',             { params: { week } }),
}
