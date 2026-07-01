import { Icon } from './UI'

/**
 * Bộ lọc khoảng ngày (from → to) dùng chung cho Gate Log, Sessions, Profiles,
 * Occupancy. value = { from: 'YYYY-MM-DD'|'', to: 'YYYY-MM-DD'|'' }.
 * onChange(next) được gọi ngay khi đổi (không cần nút Lọc).
 */
export function DateRangeFilter({ value = {}, onChange, presets = true }) {
  const { from = '', to = '' } = value
  const inp = {
    background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8,
    padding: '6px 9px', color: 'var(--thi)', fontSize: 12, fontFamily: 'var(--mono)',
    colorScheme: 'dark', outline: 'none',
  }

  function setPreset(days) {
    const now = new Date()
    const f = new Date(); f.setDate(now.getDate() - days + 1)
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    onChange({ from: fmt(f), to: fmt(now) })
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Icon name="calendar" size={14} style={{ color: 'var(--tlo)' }} />
      <input type="date" value={from} max={to || undefined} onChange={e => onChange({ from: e.target.value, to })} style={inp} />
      <span style={{ color: 'var(--txl)', fontSize: 12 }}>→</span>
      <input type="date" value={to} min={from || undefined} onChange={e => onChange({ from, to: e.target.value })} style={inp} />
      {presets && (
        <>
          {[['Hôm nay', 1], ['7 ngày', 7], ['30 ngày', 30]].map(([lbl, d]) => (
            <span key={d} onClick={() => setPreset(d)} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--ln)', background: 'var(--bg1)', color: 'var(--tlo)' }}>{lbl}</span>
          ))}
          {(from || to) && (
            <span onClick={() => onChange({ from: '', to: '' })} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', color: 'var(--alm)' }}>Xoá</span>
          )}
        </>
      )}
    </div>
  )
}
