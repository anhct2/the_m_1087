const DOW_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function timeAgo(isoStr) {
  if (!isoStr) return '—'
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (diff < 60) return 'vừa xong'
  if (diff < 3600) return `${Math.floor(diff / 60)}m trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`
  return `${Math.floor(diff / 86400)} ngày trước`
}

export function fmtTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function fmtDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function fmtShortDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function fmtDateTime(isoStr) {
  if (!isoStr) return '—'
  return `${fmtTime(isoStr)} · ${fmtDate(isoStr)}`
}

export function dateToDow(isoStr) {
  if (!isoStr) return ''
  return DOW_VN[new Date(isoStr).getDay()]
}

// Duration between two ISO strings → "1.8s" or "—"
export function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—'
  const s = (new Date(endIso) - new Date(startIso)) / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.round(s / 60)}m`
}

export function snapUrl(eventId) {
  if (!eventId) return null
  return `/api/sessions/proxy/snapshot/${eventId}`
}

// Clip .mp4 phát trực tiếp qua proxy (không cần Bearer, <video> không gửi được header)
export function clipUrl(eventId) {
  if (!eventId) return null
  return `/api/media/clip/${eventId}`
}

// Chuẩn hoá Date -> 'YYYY-MM-DD' theo giờ địa phương (dùng cho input type=date)
export function toDateInput(d) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// "Cửa sổ phòng": 1 ngày phòng D = [D 12h trưa, D+1 12h trưa).
// roomWindowDate(ts) → 'YYYY-MM-DD' của cửa sổ chứa ts (khớp enroll.room_window_date phía DB).
export function roomWindowDate(isoStr) {
  if (!isoStr) return ''
  return toDateInput(new Date(new Date(isoStr).getTime() - 12 * 3600 * 1000))
}

// Nhãn hiển thị cho 1 cửa sổ phòng: '02/07' -> '12h trưa 02/07 → 12h trưa 03/07'
export function fmtRoomWindow(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(`${dateStr}T00:00:00`)
  const n = new Date(d.getTime() + 86400000)
  const f = x => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
  return `12h trưa ${f(d)} → 12h trưa ${f(n)}`
}
