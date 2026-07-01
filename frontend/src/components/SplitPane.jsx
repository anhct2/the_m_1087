import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Hai panel cạnh nhau, chia bằng thanh kéo trái/phải được.
 * left / right: nội dung. initial: % chiều rộng panel trái. min/max: giới hạn %.
 */
export function SplitPane({ left, right, initial = 34, min = 22, max = 60, storageKey, style }) {
  const [pct, setPct] = useState(() => {
    if (storageKey) {
      const saved = Number(localStorage.getItem(storageKey))
      if (saved >= min && saved <= max) return saved
    }
    return initial
  })
  const ref = useRef(null)
  const dragging = useRef(false)

  const onMove = useCallback((e) => {
    if (!dragging.current || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    let next = ((clientX - rect.left) / rect.width) * 100
    next = Math.max(min, Math.min(max, next))
    setPct(next)
  }, [min, max])

  const stop = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (storageKey) localStorage.setItem(storageKey, String(Math.round(pct)))
  }, [pct, storageKey])

  useEffect(() => {
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', stop)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', stop)
    }
  }, [onMove, stop])

  function start() {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div ref={ref} style={{ display: 'flex', minWidth: 0, ...style }}>
      <div style={{ width: `${pct}%`, minWidth: 0, display: 'flex' }}>{left}</div>
      <div
        onMouseDown={start}
        onTouchStart={start}
        title="Kéo để chỉnh độ rộng"
        style={{ flex: '0 0 10px', margin: '0 2px', cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ width: 3, height: 46, borderRadius: 3, background: 'var(--ln2)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{right}</div>
    </div>
  )
}
