import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import s from './UI.module.css'

/* ── SVG Icons ──────────────────────────────────────────── */
const PATHS = {
  fingerprint: 'M2 12C2 6.5 6.5 2 12 2c3 0 5.7 1.3 7.5 3.4 M12 6a6 6 0 0 0-6 6c0 1.5.4 3 .9 4 M12 10a2 2 0 0 0-2 2c0 2 1 4 1.5 5 M16 8a6 6 0 0 1 2 4.4c0 2-.3 3.5-.8 4.6 M12 14c0 2 .4 3.5 1 5',
  keypad:      'M7 5h.01M12 5h.01M17 5h.01M7 10h.01M12 10h.01M17 10h.01M7 15h.01M12 15h.01M17 15h.01M9 20h6',
  card:        'M3 6h18v12H3z M3 10h18 M7 14h4',
  phone:       'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M11 19h2',
  arrowIn:     'M5 12h13 M12 5l-7 7 7 7',
  arrowOut:    'M19 12H6 M12 5l7 7-7 7',
  chevron:     'M9 6l6 6-6 6',
  chevLeft:    'M15 6l-6 6 6 6',
  calendar:    'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  search:      'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4-4',
  play:        'M8 5v14l11-7-11-7z',
  film:        'M15 4H9a5 5 0 0 0-5 5v6a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5V9a5 5 0 0 0-5-5z M4 9h16 M4 15h16 M9 4v5 M15 4v5 M9 15v5 M15 15v5',
  expand:      'M9 3H5a2 2 0 0 0-2 2v4 M15 3h4a2 2 0 0 1 2 2v4 M9 21H5a2 2 0 0 1-2-2v-4 M15 21h4a2 2 0 0 0 2-2v-4',
  logout:      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  dashboard:   'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  gate:        'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  x:           'M6 6l12 12M18 6L6 18',
  user:        'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  building:    'M3 22h18 M5 22V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14 M9 22v-5h6v5 M9 8h.01 M15 8h.01 M9 12h.01 M15 12h.01 M9 16h.01 M15 16h.01',
  menu:        'M4 6h16 M4 12h16 M4 18h16',
  users:       'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  eye:         'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff:      'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M1 1l22 22',
  refresh:     'M1 4v6h6 M23 20v-6h-6 M20.49 9A9 9 0 0 0 5.64 5.64L1 10 M23 14l-4.64 4.36A9 9 0 0 1 3.51 15',
  calGrid:     'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M8 12h.01 M12 12h.01 M16 12h.01 M8 16h.01 M12 16h.01',
  check:       'M20 6L9 17l-5-5',
  tag:         'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  login:       'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3',
  edit:        'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  'chevron-left': 'M15 18l-6-6 6-6',
}

export function Icon({ name, size = 14, stroke = 1.6, style: sx }) {
  const d = PATHS[name]
  const isPlay = name === 'play'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={isPlay ? 'currentColor' : 'none'}
      stroke={isPlay ? 'none' : 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...sx }}>
      <path d={d} />
    </svg>
  )
}

/* ── Direction Badge ────────────────────────────────────── */
export function DirBadge({ dir }) {
  const isIn = dir === 'incoming'
  return (
    <span className={`${s.badge} ${isIn ? s.badgeIn : s.badgeOut}`}>
      <Icon name={isIn ? 'arrowIn' : 'arrowOut'} size={10} />
      {isIn ? 'IN' : 'OUT'}
    </span>
  )
}

/* ── Method tag ─────────────────────────────────────────── */
const METHOD = {
  password:    { icon: 'keypad',      label: 'Mật khẩu' },
  fingerprint: { icon: 'fingerprint', label: 'Vân tay' },
  card:        { icon: 'card',        label: 'Thẻ NFC' },
  remote:      { icon: 'phone',       label: 'Từ xa' },
}
export function MethodTag({ method }) {
  const m = METHOD[method] || { icon: 'keypad', label: method || '—' }
  return (
    <span className={s.methodTag}>
      <Icon name={m.icon} size={11} />
      {m.label}
    </span>
  )
}

/* ── Spinner ────────────────────────────────────────────── */
export function Spinner({ size = 16 }) {
  return <span className={s.spinner} style={{ width: size, height: size }} />
}

/* ── Stat card ──────────────────────────────────────────── */
export function StatCard({ label, value, variant }) {
  return (
    <div className={`${s.statCard} ${variant ? s['stat_' + variant] : ''}`}>
      <span className={s.statVal}>{value ?? '—'}</span>
      <span className={s.statKey}>{label}</span>
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────── */
export function Empty({ icon = '⬡', message = 'Không có dữ liệu' }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>{icon}</span>
      <p>{message}</p>
    </div>
  )
}

/* ── Col header ─────────────────────────────────────────── */
export function ColHead({ title, right }) {
  return (
    <div className={s.colHead}>
      <span className={s.colTitle}>{title}</span>
      {right && <span className={s.colRight}>{right}</span>}
    </div>
  )
}

/* ── Lightbox ────────────────────────────────────────────── */
export function Lightbox({ src, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return createPortal(
    <div className={s.lbOverlay} onClick={onClose}>
      <button className={s.lbClose} onClick={e => { e.stopPropagation(); onClose() }}>
        <Icon name="x" size={16} />
      </button>
      <img
        className={s.lbImg}
        src={src}
        alt=""
        onClick={e => e.stopPropagation()}
      />
    </div>,
    document.body
  )
}
