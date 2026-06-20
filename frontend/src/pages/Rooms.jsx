import { useEffect, useState, useCallback, useRef, memo } from 'react'
import { getRoomStatus, getRoomHistory } from '../api/client'
import { Spinner, Icon } from '../components/UI'
import s from './Rooms.module.css'

const snapUrl = id => id ? `/api/media/snapshot/${id}` : null
const VN_TZ  = 'Asia/Ho_Chi_Minh'
const FLOORS = [2, 3, 4, 5, 6, 7]

function timeAgo(iso) {
  if (!iso) return null
  const sec = Math.round((Date.now() - new Date(iso)) / 1000)
  if (sec < 60) return 'vừa xong'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m trước`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h trước`
  return `${Math.floor(hr / 24)} ngày trước`
}

function fmtDatetime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: VN_TZ }) +
    ' ' +
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: VN_TZ })
  )
}

/* ── Room lightbox (navigates within one room's image events) ── */
function RoomLightbox({ events, idx, onClose, onNav }) {
  const e       = events[idx]
  const hasPrev = idx > 0
  const hasNext = idx < events.length - 1
  const [imgErr, setImgErr] = useState(false)

  const prevIdx = useRef(null)
  if (prevIdx.current !== idx) { prevIdx.current = idx; if (imgErr) setImgErr(false) }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = k => {
      if (k.key === 'Escape')                onClose()
      if (k.key === 'ArrowLeft'  && hasPrev) onNav(idx - 1)
      if (k.key === 'ArrowRight' && hasNext) onNav(idx + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [idx, hasPrev, hasNext, onClose, onNav])

  const src = snapUrl(e.event_id_n1)

  return (
    <div className={s.lbOverlay} onClick={onClose}>
      {/* Camera badge */}
      <span className={s.lbCamLabel}>N1</span>

      {/* Close */}
      <button className={s.lbClose} onClick={onClose}>
        <Icon name="x" size={18} />
      </button>

      {/* Image */}
      {src && !imgErr
        ? <img src={src} alt="N1" className={s.lbImg}
            onClick={ev => ev.stopPropagation()}
            onError={() => setImgErr(true)} />
        : <div className={s.lbNoSig} onClick={ev => ev.stopPropagation()}>NO SIGNAL</div>
      }

      {/* Side nav */}
      <button
        className={`${s.lbNav} ${s.lbNavLeft}`}
        disabled={!hasPrev}
        onClick={ev => { ev.stopPropagation(); onNav(idx - 1) }}
      >
        <Icon name="chevLeft" size={24} />
      </button>
      <button
        className={`${s.lbNav} ${s.lbNavRight}`}
        disabled={!hasNext}
        onClick={ev => { ev.stopPropagation(); onNav(idx + 1) }}
      >
        <Icon name="chevron" size={24} />
      </button>

      {/* Bottom meta */}
      <div className={s.lbMeta}>
        <span className={s.lbDirIn}>↓ Vào</span>
        <span className={s.lbName}>{e.user_name || '—'}</span>
        <span className={s.lbTime}>{fmtDatetime(e.event_time)}</span>
        <span className={s.lbCounter}>{idx + 1} / {events.length}</span>
      </div>
    </div>
  )
}

/* ── Room Card ────────────────────────────────────────────────── */
function RoomCard({ data, onClick }) {
  const { room, occupied, last_event, last_user, today_count } = data
  return (
    <button
      className={`${s.card} ${occupied ? s.cardOccupied : ''}`}
      onClick={() => onClick(data)}
    >
      <div className={s.cardTop}>
        <span className={`${s.dot} ${occupied ? s.dotOn : s.dotOff}`} />
        <span className={s.roomNum}>{room}</span>
        {today_count > 0 && <span className={s.todayBadge}>{today_count}</span>}
      </div>
      <div className={s.cardStatus}>{occupied ? 'Có người' : 'Vắng'}</div>
      {last_event && (
        <div className={s.cardMeta}>
          {last_user && <span className={s.cardUser}>{last_user}</span>}
          <span className={s.cardAgo}>{timeAgo(last_event)}</span>
        </div>
      )}
    </button>
  )
}

/* ── History Row ──────────────────────────────────────────────── */
const HistRow = memo(function HistRow({ event: e, onImgClick }) {
  const isIn = e.direction === 'incoming'
  const thumb = isIn ? snapUrl(e.event_id_n1) : null
  const [imgErr, setImgErr] = useState(false)
  const hasImg = !!thumb && !imgErr

  return (
    <div className={`${s.histRow} ${isIn ? s.histIn : s.histOut}`}>
      {isIn && (
        <div
          className={`${s.histThumb} ${hasImg && onImgClick ? s.histThumbClick : ''}`}
          onClick={hasImg && onImgClick ? onImgClick : undefined}
        >
          {thumb && !imgErr
            ? <img src={thumb} alt="N1" className={s.histThumbImg} onError={() => setImgErr(true)} />
            : <div className={s.histThumbEmpty} />}
        </div>
      )}
      <div className={s.histContent}>
        <div className={s.histTop}>
          <span className={s.histDir}>{isIn ? '↓ Vào' : '↑ Ra'}</span>
          <span className={s.histUser}>{e.user_name || '—'}</span>
        </div>
        <span className={s.histTime}>{fmtDatetime(e.event_time)}</span>
      </div>
    </div>
  )
})

/* ── Drawer ───────────────────────────────────────────────────── */
function Drawer({ room, onClose }) {
  const [hist,    setHist]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [lbIdx,   setLbIdx]   = useState(null)

  useEffect(() => {
    if (!room) return
    setHist(null)
    setLbIdx(null)
    setLoading(true)
    getRoomHistory(room.room)
      .then(r => setHist(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [room?.room])

  if (!room) return null

  const imgEvents = hist?.events.filter(e => e.direction === 'incoming' && e.event_id_n1) || []

  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <aside className={s.drawer}>
        <div className={s.drawerHead}>
          <div className={s.drawerTitle}>
            <span className={`${s.dot} ${s.dotLg} ${room.occupied ? s.dotOn : s.dotOff}`} />
            {room.room}
          </div>
          <button className={s.closeBtn} onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className={s.drawerBody}>
          <div className={`${s.statusBanner} ${room.occupied ? s.bannerIn : s.bannerEmpty}`}>
            {room.occupied ? '● Có người' : '○ Vắng'}
          </div>

          {room.last_event && (
            <div className={s.lastEvent}>
              <span className={s.leLabel}>Sự kiện gần nhất</span>
              <span className={s.leVal}>{fmtDatetime(room.last_event)}</span>
              {room.last_user && <span className={s.leUser}>{room.last_user}</span>}
            </div>
          )}

          {loading ? (
            <div className={s.center}><Spinner size={18} /></div>
          ) : hist ? (
            <>
              <div className={s.histStats}>
                <div className={s.hStat}>
                  <span className={s.hStatVal} style={{ color: 'var(--in)' }}>{hist.total_in}</span>
                  <span className={s.hStatKey}>Tổng vào</span>
                </div>
                <div className={s.hStat}>
                  <span className={s.hStatVal} style={{ color: 'var(--out)' }}>{hist.total_out}</span>
                  <span className={s.hStatKey}>Tổng ra</span>
                </div>
                <div className={s.hStat}>
                  <span className={s.hStatVal}>{room.today_count}</span>
                  <span className={s.hStatKey}>Hôm nay</span>
                </div>
              </div>

              <div className={s.histHead}>Lịch sử ({hist.events.length} sự kiện)</div>
              <div className={s.histList}>
                {hist.events.length === 0 && (
                  <div className={s.histEmpty}>Chưa có dữ liệu</div>
                )}
                {hist.events.map((e, i) => {
                  const imgIdx = imgEvents.indexOf(e)
                  return (
                    <HistRow
                      key={i}
                      event={e}
                      onImgClick={imgIdx >= 0 ? () => setLbIdx(imgIdx) : undefined}
                    />
                  )
                })}
              </div>
            </>
          ) : null}
        </div>
      </aside>

      {lbIdx != null && imgEvents.length > 0 && (
        <RoomLightbox
          events={imgEvents}
          idx={lbIdx}
          onClose={() => setLbIdx(null)}
          onNav={setLbIdx}
        />
      )}
    </>
  )
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function Rooms() {
  const [rooms,     setRooms]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(() => {
    getRoomStatus()
      .then(r => { setRooms(r.data); setUpdatedAt(new Date()) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const roomMap = {}
  rooms.forEach(r => { roomMap[r.room] = r })
  const occupiedCount = rooms.filter(r => r.occupied).length

  if (loading) return (
    <div className={s.center}><Spinner size={24} /></div>
  )

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Trạng thái phòng</h1>
          <span className={s.pageSub}>
            {occupiedCount}/{rooms.length} phòng có người
            {updatedAt && ` · cập nhật ${timeAgo(updatedAt.toISOString())}`}
          </span>
        </div>
        <button className={s.refreshBtn} onClick={load}>
          <Icon name="refresh" size={13} />
          Làm mới
        </button>
      </div>

      <div className={s.summary}>
        <div className={s.sumItem}>
          <span className={s.sumVal} style={{ color: 'var(--in)' }}>{occupiedCount}</span>
          <span className={s.sumKey}>Có người</span>
        </div>
        <div className={s.sumDiv} />
        <div className={s.sumItem}>
          <span className={s.sumVal}>{rooms.length - occupiedCount}</span>
          <span className={s.sumKey}>Vắng</span>
        </div>
      </div>

      {/* 6-column grid: rows x02 (top) and x01 (bottom) */}
      <div className={s.roomGrid}>
        <div />
        {FLOORS.map(f => (
          <div key={f} className={s.floorHdr}>Tầng {f}</div>
        ))}

        {/* Row x02 */}
        <div className={s.rowLbl}>02</div>
        {FLOORS.map(f => {
          const room = roomMap[`P.${f}02`]
          return room
            ? <RoomCard key={`P.${f}02`} data={room} onClick={setSelected} />
            : <div key={`e${f}02`} className={s.emptySlot} />
        })}

        {/* Row x01 */}
        <div className={s.rowLbl}>01</div>
        {FLOORS.map(f => {
          const room = roomMap[`P.${f}01`]
          return room
            ? <RoomCard key={`P.${f}01`} data={room} onClick={setSelected} />
            : <div key={`e${f}01`} className={s.emptySlot} />
        })}
      </div>

      <Drawer room={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
