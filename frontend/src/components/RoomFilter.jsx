import { useState, useEffect, useRef } from 'react'
import { Icon } from './UI'
import { getRoomCodes } from '../api/client'

// Cache phòng cho toàn app — danh sách gần như tĩnh (P.201..P.702)
let roomCodesCache = null
function useRoomCodes() {
  const [codes, setCodes] = useState(roomCodesCache || [])
  useEffect(() => {
    if (roomCodesCache) return
    getRoomCodes().then(r => { roomCodesCache = r.data; setCodes(r.data) }).catch(() => {})
  }, [])
  return codes
}

/**
 * Bộ lọc phòng dạng checkbox (thay cho ô nhập text tự do).
 * value: mảng room code đã chọn, ví dụ ['P.301','P.302']
 * onChange(nextArray)
 */
export function RoomCheckboxFilter({ value = [], onChange }) {
  const [open, setOpen] = useState(false)
  const codes = useRoomCodes()
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function toggle(code) {
    onChange(value.includes(code) ? value.filter(c => c !== code) : [...value, code])
  }

  const floors = {}
  codes.forEach(c => {
    const floor = c.match(/^P\.(\d)/)?.[1] || '?'
    ;(floors[floor] ||= []).push(c)
  })

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '7px 11px', color: value.length ? 'var(--thi)' : 'var(--tlo)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
      >
        <Icon name="building" size={13} />
        {value.length ? `${value.length} phòng` : 'Tất cả phòng'}
        <Icon name="chevDown" size={12} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 30, width: 260, maxHeight: 320, overflowY: 'auto', background: 'var(--bg1)', border: '1px solid var(--ln2)', borderRadius: 10, boxShadow: '0 14px 34px oklch(0 0 0 / 0.45)', padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--txl)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Chọn phòng</span>
            {value.length > 0 && (
              <span onClick={() => onChange([])} style={{ fontSize: 11, color: 'var(--in)', cursor: 'pointer' }}>Bỏ chọn</span>
            )}
          </div>
          {Object.keys(floors).sort().map(floor => (
            <div key={floor} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--txl)', margin: '4px 2px' }}>Tầng {floor}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {floors[floor].map(code => {
                  const checked = value.includes(code)
                  return (
                    <label key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${checked ? 'var(--in3)' : 'var(--ln)'}`, background: checked ? 'var(--inb)' : 'transparent', color: checked ? 'oklch(0.85 0.11 152)' : 'var(--tmd)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(code)} style={{ accentColor: 'var(--in)', margin: 0 }} />
                      {code}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
