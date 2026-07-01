import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './UI'

/**
 * Xem ảnh toàn màn hình kiểu Facebook: next / previous / ESC để đóng.
 * items: [{ src, caption }]  — index: ảnh đang xem  — onIndex(i) / onClose()
 */
export function Lightbox({ items, index, onIndex, onClose }) {
  const n = items.length
  const go = useCallback((delta) => {
    onIndex((index + delta + n) % n)
  }, [index, n, onIndex])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (!n) return null
  const cur = items[index]

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0.04 0.004 255 / 0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClose} style={btn({ top: 18, right: 18 })}><Icon name="x" size={20} /></button>

      {n > 1 && (
        <button onClick={e => { e.stopPropagation(); go(-1) }} style={btn({ left: 18, top: '50%' }, true)}><Icon name="chevLeft" size={26} /></button>
      )}

      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {cur.src
          ? <img src={cur.src} alt="" style={{ maxWidth: '90vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 24px 80px oklch(0 0 0 / 0.6)' }} />
          : <div style={{ width: 480, height: 320, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txl)', fontFamily: 'var(--mono)', border: '1px solid var(--ln)' }}>NO SIGNAL</div>}
        {(cur.caption || n > 1) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'oklch(0.9 0.005 255)', fontSize: 13 }}>
            {cur.caption && <span>{cur.caption}</span>}
            {n > 1 && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tlo)' }}>{index + 1} / {n}</span>}
          </div>
        )}
      </div>

      {n > 1 && (
        <button onClick={e => { e.stopPropagation(); go(1) }} style={btn({ right: 18, top: '50%' }, true)}><Icon name="chevron" size={26} /></button>
      )}
    </div>,
    document.body
  )
}

function btn(pos, vCenter) {
  return {
    position: 'absolute', ...pos,
    transform: vCenter ? 'translateY(-50%)' : undefined,
    width: 44, height: 44, borderRadius: '50%',
    background: 'oklch(1 0 0 / 0.1)', border: '1px solid oklch(1 0 0 / 0.18)',
    color: 'oklch(0.98 0 0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', zIndex: 1,
  }
}
