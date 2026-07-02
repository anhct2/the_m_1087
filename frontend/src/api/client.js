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

export const getSession = sessionId =>
  api.get(`/api/sessions/${sessionId}`)

export const getSessionClips = sessionId =>
  api.get(`/api/sessions/${sessionId}/clips`)

// ── Users ───────────────────────────────────────────────
export const getUsers = () => api.get('/api/users')

// ── Rooms ───────────────────────────────────────────────────
export const getRoomStatus  = ()           => api.get('/api/rooms/status')
export const getRoomCodes   = ()           => api.get('/api/rooms/codes')
export const getRoomHistory = (room)       => api.get(`/api/rooms/${encodeURIComponent(room)}/history`)
export const getRoomMonthly = (year, month) => api.get('/api/rooms/monthly', { params: { year, month } })
export const getRoomDay     = (room, date) => api.get(`/api/rooms/${encodeURIComponent(room)}/day`, { params: { date } })

// ── Enroll ───────────────────────────────────────────────────────
export const getEnrollSummary  = ()           => api.get('/api/enroll/stats/summary')
export const getEnrollQueue    = ()           => api.get('/api/enroll/stats/queue')
export const getEnrollSessions    = (params)     => api.get('/api/enroll/sessions', { params })
export const getEnrollSession     = (id)         => api.get(`/api/enroll/sessions/${id}`)
export const getEnrollByUnlockAll = (unlockId)   => api.get(`/api/enroll/sessions/by-unlock/${unlockId}`)
export const getEnrollProfiles = (params)     => api.get('/api/enroll/profiles', { params })
export const getEnrollProfile  = (id)         => api.get(`/api/enroll/profiles/${id}`)
export const patchEnrollProfile= (id, body)   => api.patch(`/api/enroll/profiles/${id}`, body)
export const postReenroll       = (person_id)  => api.post(`/api/enroll/profiles/${person_id}/re-enroll`)
export const getEnrollJobs     = (params)     => api.get('/api/enroll/jobs', { params })
export const postBackfill      = (body)       => api.post('/api/enroll/backfill', body)
export const cancelJob         = (id)         => api.delete(`/api/enroll/jobs/${id}`)
export const retryJob          = (id)         => api.post(`/api/enroll/jobs/${id}/retry`)
export const retrySession      = (id)         => api.post(`/api/enroll/sessions/${id}/retry`)
export const postReleaseStuck  = ()           => api.post('/api/enroll/release-stuck')
export const getWorkerStatus   = ()           => api.get('/api/enroll/worker-status')
export const assignSession     = (id, body)   => api.post(`/api/enroll/sessions/${id}/assign`, body)
export const searchProfiles    = (q)          => api.get('/api/enroll/profiles/search', { params: { q } })
export const getEnrollByUnlock = (unlockId)   => api.get(`/api/enroll/sessions/by-unlock/${unlockId}`)
export const getEnrollReview   = (params)     => api.get('/api/enroll/review', { params })
export const getDuplicates     = (threshold)  => api.get('/api/enroll/duplicates', threshold ? { params: { threshold } } : {})
export const getDuplicateCluster = (id)       => api.get(`/api/enroll/duplicates/${id}`)
export const mergeProfiles     = (body)       => api.post('/api/enroll/profiles/merge', body)
export const dismissCluster    = (id, body)   => api.post(`/api/enroll/duplicates/${id}/dismiss`, body)

// ── Enroll ⇄ Gate Log unified sessions (1:1, keyed by door_id) ───
export const getGateSessions    = (params)      => api.get('/api/enroll/gate-sessions', { params })
export const getGateSessionById = (doorId)      => api.get(`/api/enroll/gate-sessions/${doorId}`)
export const assignGateSession  = (doorId, body) => api.post(`/api/enroll/gate-sessions/${doorId}/assign`, body)
export const assignGateSessionRoom = (doorId, body) => api.post(`/api/enroll/gate-sessions/${doorId}/assign-room`, body)
// ts = event_time của lượt Ra → BE xác định cửa sổ phòng (12h trưa → 12h trưa)
export const getRoomDayProfiles = (room, ts) => api.get('/api/enroll/room-day-profiles', { params: { room, ts } })

// ── Lưu trú theo cửa sổ phòng + job gộp profile ──────────────────
export const getStaysByGate        = (params) => api.get('/api/enroll/stays/by-gate', { params })
export const getStaysByProfile     = (params) => api.get('/api/enroll/stays/by-profile', { params })
export const postMergeRoomProfiles = (body)   => api.post('/api/enroll/merge-room-profiles', body || {})

// ── Airbnb ────────────────────────────────────────────────────────
export const getAirbnbCalendar      = (days = 30)            => api.get('/api/airbnb/calendar', { params: { days } })
export const getAirbnbCalendarMonth = (year, month)          => api.get('/api/airbnb/calendar', { params: { year, month } })
export const getAirbnbCalendarRange = (from_date, days)      => api.get('/api/airbnb/calendar', { params: { from_date, days } })

export default api
