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
