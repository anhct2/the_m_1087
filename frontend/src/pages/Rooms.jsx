import { useEffect, useState, useCallback, memo } from 'react'
import { getRoomStatus, getRoomHistory } from '../api/client'
import { Spinner, Icon } from '../components/UI'
import s from './Rooms.module.css'

const snapUrl = id => id ? `/api/media/snapshot/${id}` : null

const VN_TZ = 'Asia/Ho_Chi_Minh'

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

/* ── Room Card ─────────────────────────────────────────────── */
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

/* ── History Row with thumbnail ─────────────────────────────── */
const HistRow = memo(function HistRow({ event: e }) {
  const isIn = e.direction === 'incoming'
  const thumb = isIn ? snapUrl(e.event_id_n1) : null
  const [imgErr, setImgErr] = useState(false)

  return (
    <div className={`${s.histRow} ${isIn ? s.histIn : s.histOut}`}>
      {isIn && (
        <div className={s.histThumb}>
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

/* ── Drawer ─────────────────────────────────────────────────── */
function Drawer({ room, onClose }) {
  const [hist, setHist] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!room) return
    setHist(null)
    setLoading(true)
    getRoomHistory(room.room)
      .then(r => setHist(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [room?.room])

  if (!room) return null

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
                {hist.events.map((e, i) => (
                  <HistRow key={i} event={e} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Rooms() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
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

  const byFloor = {}
  rooms.forEach(r => {
    if (!byFloor[r.floor]) byFloor[r.floor] = []
    byFloor[r.floor].push(r)
  })

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
          <Icon name="arrowIn" size={12} />
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

      <div className={s.floorList}>
        {Object.keys(byFloor).sort((a, b) => +a - +b).map(floor => (
          <div key={floor} className={s.floorSection}>
            <div className={s.floorLabel}>Tầng {floor}</div>
            <div className={s.floorCards}>
              {byFloor[floor].map(room => (
                <RoomCard key={room.room} data={room} onClick={setSelected} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Drawer room={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
