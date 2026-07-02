import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/* ── SVG Icons ──────────────────────────────────────────── */
const PATHS = {
  dashboard:   'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  gate:        'M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-6h6v6',
  building:    'M4 2h16v20H4z M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1',
  calendar:    'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  users:       'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  calGrid:     'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  user:        'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout:      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  bell:        'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  search:      'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4-4',
  chevron:     'M9 6l6 6-6 6',
  chevLeft:    'M15 6l-6 6 6 6',
  chevDown:    'M6 9l6 6 6-6',
  x:           'M18 6L6 18M6 6l12 12',
  check:       'M20 6L9 17l-5-5',
  refresh:     'M23 4v6h-6M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  play:        'M8 5v14l11-7z',
  expand:      'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  merge:       'M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18',
  arrowIn:     'M5 12h13 M12 5l-7 7 7 7',
  arrowOut:    'M19 12H6 M12 5l7 7-7 7',
  plus:        'M12 5v14M5 12h14',
  lock:        'M3 11h18v11H3z M7 11V7a5 5 0 0 1 10 0v4',
  eye:         'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  edit:        'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  menu:        'M4 6h16 M4 12h16 M4 18h16',
}

export function Icon({ name, size = 15, stroke = 1.9, style: sx }) {
  const d = PATHS[name] || ''
  const isPlay = name === 'play'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={isPlay ? 'currentColor' : 'none'}
      stroke={isPlay ? 'none' : 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...sx }}>
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg} />
      ))}
    </svg>
  )
}

/* ── Face avatar placeholder (gradient theo giới tính) ──────
   Trong app thật: truyền src (crop khuôn mặt từ clip) => hiển thị ảnh.
   Placeholder khi chưa có ảnh. */
export function Avatar({ gender, size = 36, src, style: sx }) {
  const bg = gender === 'female' ? 'oklch(0.36 0.09 18)'
    : gender === 'male' ? 'oklch(0.33 0.07 255)'
    : 'oklch(0.26 0.02 255)'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      position: 'relative', overflow: 'hidden',
      background: `radial-gradient(circle at 50% 60%, ${bg}, oklch(0.11 0.01 255) 95%)`,
      border: '2px solid oklch(0.42 0.02 255 / 0.45)',
      boxShadow: '0 2px 8px oklch(0 0 0 / 0.4)',
      backgroundImage: src ? `url(${src})` : undefined,
      backgroundSize: 'cover', backgroundPosition: 'center',
      ...sx,
    }} />
  )
}

/* ── Badge (kind: green|amber|red|blue|teal|dim) ──────────── */
const BADGE = {
  green: { c: 'var(--in)',  b: 'var(--inb)', bd: 'var(--in3)' },
  amber: { c: 'var(--am)',  b: 'var(--amb)', bd: 'var(--am3)' },
  red:   { c: 'var(--alm)', b: 'var(--alb)', bd: 'var(--al3)' },
  blue:  { c: 'var(--out)', b: 'var(--otb)', bd: 'var(--ot3)' },
  teal:  { c: 'var(--te)',  b: 'var(--teb)', bd: 'var(--te3)' },
  dim:   { c: 'var(--tmd)', b: 'var(--bg3)', bd: 'var(--ln)' },
}
export function Badge({ kind = 'dim', children, style: sx }) {
  const k = BADGE[kind] || BADGE.dim
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
      padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap',
      color: k.c, background: k.b, border: `1px solid ${k.bd}`, ...sx,
    }}>{children}</span>
  )
}

/* ── Direction badge (IN/OUT) ─────────────────────────────── */
export function DirBadge({ dir }) {
  const isIn = dir === 'incoming' || dir === 'in'
  return (
    <Badge kind={isIn ? 'green' : 'blue'}>
      {isIn ? '↓ VÀO' : '↑ RA'}
    </Badge>
  )
}

/* ── Direction dạng text mono (dùng trong bảng/danh sách) ──── */
export function DirText({ dir, size = 11, style: sx }) {
  const isIn = dir === 'incoming' || dir === 'in'
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: size, color: isIn ? 'var(--in)' : 'var(--out)', whiteSpace: 'nowrap', ...sx }}>
      {isIn ? '↓ Vào' : '↑ Ra'}
    </span>
  )
}

/* ── Similarity / quality bar ─────────────────────────────── */
export function color4(v) {
  return v >= 0.7 ? 'var(--in)' : v >= 0.45 ? 'var(--am)' : 'var(--alm)'
}
export function SimBar({ value, width = '100%' }) {
  const pct = Math.max(3, Math.round(value * 100))
  const fill = width === '100%'
  return (
    <div style={{ width, flex: fill ? 1 : 'none', height: 5, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color4(value) }} />
    </div>
  )
}

/* ── Stat tile ────────────────────────────────────────────── */
export function StatTile({ label, value, valueColor, sub }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 'var(--r-lg)', padding: 15 }}>
      <div style={{ fontSize: 11.5, color: 'var(--tlo)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600, marginTop: 8, letterSpacing: '-0.5px', color: valueColor || 'var(--thi)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--txl)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

/* ── Card shell ───────────────────────────────────────────── */
export function Card({ children, pad = 0, style: sx }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 'var(--r-lg)', overflow: 'hidden', padding: pad, ...sx }}>
      {children}
    </div>
  )
}

/* ── Section title inside a card ──────────────────────────── */
export function CardHead({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--bg2)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--tlo)', marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────── */
export function Empty({ message = 'Không có dữ liệu' }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--tlo)', fontSize: 12.5 }}>{message}</div>
  )
}

/* ── Spinner ──────────────────────────────────────────────── */
export function Spinner({ size = 16 }) {
  return <span style={{ width: size, height: size, display: 'inline-block', borderRadius: '50%', border: '2px solid var(--ln2)', borderTopColor: 'var(--in)', animation: 'tcsSpin .8s linear infinite' }} />
}

/* ── Khối loading giữa trang (spinner + padding chuẩn) ─────── */
export function Loading({ pad = 40, size = 20 }) {
  return (
    <div style={{ padding: pad, display: 'flex', justifyContent: 'center' }}>
      <Spinner size={size} />
    </div>
  )
}

/* ── Segmented toggle (pill switcher) ──────────────────────────
   options: [[value, label]] · dot: hiện chấm màu theo value (map value→color) */
export function Segmented({ value, onChange, options, dot }) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: 3 }}>
      {options.map(([v, l]) => (
        <span key={v} onClick={() => onChange(v)}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', background: value === v ? 'var(--bg3)' : 'transparent', color: value === v ? 'var(--thi)' : 'var(--tlo)', fontWeight: value === v ? 500 : 400 }}>
          {dot?.[v] && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: dot[v], marginRight: 6 }} />}
          {l}
        </span>
      ))}
    </div>
  )
}

/* ── Footer phân trang chuẩn cho bảng ──────────────────────── */
export function Pager({ offset, total, page, onPage, unit = 'phiên' }) {
  const canPrev = offset > 0
  const canNext = offset + page < total
  const btn = can => ({ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln)', color: can ? 'var(--tmd)' : 'var(--txl)', cursor: can ? 'pointer' : 'default' })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: '1px solid var(--bg2)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)' }}>{total ? offset + 1 : 0}–{Math.min(offset + page, total)} / {total} {unit}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <span onClick={() => canPrev && onPage(offset - page)} style={btn(canPrev)}>← Trước</span>
        <span onClick={() => canNext && onPage(offset + page)} style={btn(canNext)}>Sau →</span>
      </div>
    </div>
  )
}

/* ── Modal (portal) ───────────────────────────────────────── */
export function Modal({ onClose, width = 420, align = 'center', children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'oklch(0.08 0.005 255 / 0.6)',
      display: 'flex', alignItems: align === 'top' ? 'flex-start' : 'center', justifyContent: 'center',
      paddingTop: align === 'top' ? 80 : 0,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width, maxWidth: '92%', background: 'var(--bg1)', border: '1px solid var(--ln2)',
        borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px oklch(0 0 0 / 0.5)',
      }}>{children}</div>
    </div>,
    document.body
  )
}

/* ── Buttons ──────────────────────────────────────────────── */
export function Btn({ variant = 'ghost', children, style: sx, ...rest }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', borderRadius: 'var(--r-md)',
    padding: '9px 15px', cursor: 'pointer', border: '1px solid transparent',
  }
  const V = {
    primary: { background: 'var(--in)', color: 'oklch(0.16 0.03 152)', border: 'none' },
    ghost:   { background: 'var(--bg2)', color: 'var(--tmd)', border: '1px solid var(--ln)' },
    danger:  { background: 'transparent', color: 'var(--alm)', border: '1px solid var(--al3)' },
    subtle:  { background: 'transparent', color: 'var(--tlo)', border: '1px solid var(--ln)' },
  }
  return <button style={{ ...base, ...V[variant], ...sx }} {...rest}>{children}</button>
}
