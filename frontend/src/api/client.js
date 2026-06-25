import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 15000,
})

// Attach token to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('tcs_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Auto-logout chỉ khi 401 từ API endpoint thực sự
// KHÔNG logout khi 401 từ proxy/snapshot (media endpoints)
const AUTH_ENDPOINTS = ['/api/stats', '/api/sessions', '/api/users']

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      const url = err.config?.url || ''
      const isAuthRequired = AUTH_ENDPOINTS.some(e => url.startsWith(e))
        && !url.includes('/proxy/')
      if (isAuthRequired) {
        localStorage.removeItem('tcs_token')
        localStorage.removeItem('tcs_user')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// ── Auth ────────────────────────────────────────────────
export const login = (username, password) =>
  api.post('/api/auth/login', { username, password })

// ── Stats ───────────────────────────────────────────────
export const getStats = () => api.get('/api/stats')

export const getStatsTrend = (days = 7) =>
  api.get('/api/stats/trend', { params: { days } })

// ── Sessions ────────────────────────────────────────────
export const getSessions = params =>
  api.get('/api/sessions', { params })

export const getSessionClips = sessionId =>
  api.get(`/api/sessions/${sessionId}/clips`)

// ── Users ───────────────────────────────────────────────
export const getUsers = () => api.get('/api/users')

// ── Rooms ───────────────────────────────────────────────────
export const getRoomStatus  = ()           => api.get('/api/rooms/status')
export const getRoomHistory = (room)       => api.get(`/api/rooms/${encodeURIComponent(room)}/history`)
export const getRoomMonthly = (year, month) => api.get('/api/rooms/monthly', { params: { year, month } })
export const getRoomDay     = (room, date) => api.get(`/api/rooms/${encodeURIComponent(room)}/day`, { params: { date } })

// ── Enroll ───────────────────────────────────────────────────────
export const getEnrollSummary  = ()           => api.get('/api/enroll/stats/summary')
export const getEnrollQueue    = ()           => api.get('/api/enroll/stats/queue')
export const getEnrollSessions = (params)     => api.get('/api/enroll/sessions', { params })
export const getEnrollSession  = (id)         => api.get(`/api/enroll/sessions/${id}`)
export const getEnrollProfiles = (params)     => api.get('/api/enroll/profiles', { params })
export const getEnrollProfile  = (id)         => api.get(`/api/enroll/profiles/${id}`)
export const patchEnrollProfile= (id, body)   => api.patch(`/api/enroll/profiles/${id}`, body)
export const postReenroll       = (person_id)  => api.post(`/api/enroll/profiles/${person_id}/re-enroll`)
export const getOccupancy      = ()           => api.get('/api/enroll/occupancy')
export const getEnrollJobs     = (params)     => api.get('/api/enroll/jobs', { params })
export const postBackfill      = (body)       => api.post('/api/enroll/backfill', body)
export const cancelJob         = (id)         => api.delete(`/api/enroll/jobs/${id}`)
export const retrySession      = (id)         => api.post(`/api/enroll/sessions/${id}/retry`)
export const assignSession     = (id, body)   => api.post(`/api/enroll/sessions/${id}/assign`, body)
export const searchProfiles    = (q)          => api.get('/api/enroll/profiles/search', { params: { q } })

export default api
