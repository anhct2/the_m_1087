import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './UI'

/**
 * Phát clip .mp4 ngay tại chỗ (không mở tab mới). ESC hoặc click nền để đóng.
 * src: URL video (ưu tiên direct link từ Frigate) — caption — onClose()
 * Nếu trình duyệt không phát inline được (codec/CORS), hiện nút mở tab mới.
 */
export function ClipPlayer({ src, caption, onClose }) {
  const [err, setErr] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0.04 0.004 255 / 0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, width: 44, height: 44, borderRadius: '50%', background: 'oklch(1 0 0 / 0.1)', border: '1px solid oklch(1 0 0 / 0.18)', color: 'oklch(0.98 0 0)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 1 }}><Icon name="x" size={20} /></button>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {src && !err ? (
          <video
            src={src}
            controls
            autoPlay
            onError={() => setErr(true)}
            style={{ maxWidth: '90vw', maxHeight: '84vh', borderRadius: 8, boxShadow: '0 24px 80px oklch(0 0 0 / 0.6)', background: '#000' }}
          />
        ) : (
          <div style={{ width: 'min(80vw, 520px)', padding: 40, borderRadius: 10, border: '1px solid var(--ln)', textAlign: 'center', color: 'var(--tmd)', fontSize: 13 }}>
            {src ? 'Không phát được clip trong cửa sổ này.' : 'Không có clip cho camera này.'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {caption && <span style={{ color: 'oklch(0.9 0.005 255)', fontSize: 13 }}>{caption}</span>}
          {src && <a href={src} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--in)', textDecoration: 'none' }}><Icon name="expand" size={13} />Mở clip trong tab mới</a>}
        </div>
      </div>
    </div>,
    document.body
  )
}
