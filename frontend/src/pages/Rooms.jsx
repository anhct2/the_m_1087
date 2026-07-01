import { useState, useEffect } from 'react'
import { Icon, Spinner } from '../components/UI'
import { getRoomStatus, getRoomDay } from '../api/client'
import { snapUrl, fmtTime, timeAgo } from '../utils'
import s from './Rooms.module.css'

const FLOORS = [2, 3, 4, 5, 6, 7]

// Ngày khách sạn: nếu trước 12:01 thì thuộc ngày hôm qua
function hotelToday() {
  const now = new Date()
  const before1201 = now.getHours() < 12 || (now.getHours() === 12 && now.getMinutes() < 1)
  if (before1201) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return d.toLocaleDateString('sv')
  }
  return now.toLocaleDateString('sv')
}

function RoomDrawer({ room, occupied, onClose }) {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [lb, setLb]       = useState(null) // { events, idx }
  const dateStr = hotelToday()

  useEffect(() => {
    setLoading(true)
    getRoomDay(room, dateStr)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [room, dateStr])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { if (lb) setLb(null); else onClose(); }
      if (!lb) return
      if (e.key === 'ArrowLeft')  setLb(p => p.idx > 0 ? { ...p, idx: p.idx - 1 } : p)
      if (e.key === 'ArrowRight') setLb(p => p.idx < p.events.length - 1 ? { ...p, idx: p.idx + 1 } : p)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lb, onClose])

  const events   = data?.events ?? []
  const inCount  = events.filter(e => e.direction === 'incoming').length
  const outCount = events.filter(e => e.direction === 'outgoing').length

  return (
    <>
      <div className={s.overlay} onClick={() => { if (lb) setLb(null); else onClose(); }} />
      <div className={s.drawer}>
        <div className={s.drawerHead}>
          <div className={s.drawerTitle}>
            <span className={`${s.dot} ${s.dotLg} ${occupied ? s.dotOn : s.dotOff}`} />
            {room}
          </div>
          <button className={s.closeBtn} onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className={s.drawerBody}>
          <div className={`${s.statusBanner} ${occupied ? s.bannerIn : s.bannerEmpty}`}>
            {occupied ? 'Có người' : 'Vắng'}
          </div>

          <div className={s.histStats}>
            <div className={s.hStat}>
              <span className={s.hStatVal} style={{ color: 'var(--in)' }}>{inCount}</span>
              <span className={s.hStatKey}>Lượt vào hôm nay</span>
            </div>
            <div className={s.hStat}>
              <span className={s.hStatVal} style={{ color: 'var(--out)' }}>{outCount}</span>
              <span className={s.hStatKey}>Lượt ra hôm nay</span>
            </div>
          </div>

          <div className={s.histHead}>Logs từ 12:01 hôm nay</div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Spinner size={18} />
            </div>
          ) : events.length === 0 ? (
            <div className={s.histEmpty}>Không có sự kiện</div>
          ) : (
            <div className={s.histList}>
              {events.map((ev, i) => {
                const isIn = ev.direction === 'incoming'
                const snap = snapUrl(ev.event_id_n1)
                return (
                  <div key={i} className={`${s.histRow} ${isIn ? s.histIn : s.histOut}`}>
                    {snap ? (
                      <div className={`${s.histThumb} ${s.histThumbClick}`}
                        onClick={() => setLb({ events, idx: i })}>
                        <img src={snap} alt="" className={s.histThumbImg} loading="lazy" />
                      </div>
                    ) : (
                      <div className={s.histThumb}><div className={s.histThumbEmpty} /></div>
                    )}
                    <div className={s.histContent}>
                      <div className={s.histTop}>
                        <span className={s.histDir}>{isIn ? '↓ VÀO' : '↑ RA'}</span>
                        <span className={s.histTime}>{fmtTime(ev.event_time)}</span>
                      </div>
                      <span className={s.histUser}>{ev.user_name || '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {lb && (() => {
        const ev   = lb.events[lb.idx]
        const snap = snapUrl(ev.event_id_n1)
        return (
          <div className={s.lbOverlay} onClick={() => setLb(null)}>
            {snap
              ? <img src={snap} alt="" className={s.lbImg} onClick={e => e.stopPropagation()} />
              : <div className={s.lbNoSig}>NO SIGNAL</div>}
            <span className={s.lbCamLabel}>N1</span>
            <button className={s.lbClose} onClick={() => setLb(null)}><Icon name="x" size={16} /></button>
            <button className={`${s.lbNav} ${s.lbNavLeft}`} disabled={lb.idx === 0}
              onClick={e => { e.stopPropagation(); setLb(p => ({ ...p, idx: p.idx - 1 })) }}>
              <Icon name="chevLeft" size={18} />
            </button>
            <button className={`${s.lbNav} ${s.lbNavRight}`} disabled={lb.idx === lb.events.length - 1}
              onClick={e => { e.stopPropagation(); setLb(p => ({ ...p, idx: p.idx + 1 })) }}>
              <Icon name="chevron" size={18} />
            </button>
            <div className={s.lbMeta}>
              <span className={s.lbDirIn}>{room}</span>
              <span className={s.lbName}>{ev.user_name || '—'}</span>
              <span className={s.lbTime}>{fmtTime(ev.event_time)}</span>
              <span className={s.lbCounter}>{lb.idx + 1} / {lb.events.length}</span>
            </div>
          </div>
        )
      })()}
    </>
  )
}

export default function Rooms() {
  const [roomMap, setRoomMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [occupied, setOccupied] = useState(0)
  const [drawer, setDrawer]   = useState(null)

  function load() {
    setLoading(true)
    getRoomStatus()
      .then(r => {
        const map = {}
        let occ = 0
        r.data.forEach(d => { map[d.room] = d; if (d.occupied) occ++ })
        setRoomMap(map)
        setOccupied(occ)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const total = Object.keys(roomMap).length

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <div>
          <div className={s.pageTitle}>Trạng thái phòng</div>
          <div className={s.pageSub}>
            {loading ? 'Đang tải…' : `${occupied}/${total} phòng có người · click phòng để xem logs`}
          </div>
        </div>
        <button className={s.refreshBtn} onClick={load} disabled={loading}>
          <Icon name="refresh" size={12} /> Làm mới
        </button>
      </div>

      {loading ? (
        <div className={s.center}><Spinner size={22} /></div>
      ) : (
        <>
          <div className={s.summary}>
            <div className={s.sumItem}>
              <span className={s.sumVal} style={{ color: 'var(--in)' }}>{occupied}</span>
              <span className={s.sumKey}>Có người</span>
            </div>
            <div className={s.sumDiv} />
            <div className={s.sumItem}>
              <span className={s.sumVal}>{total - occupied}</span>
              <span className={s.sumKey}>Vắng</span>
            </div>
          </div>

          <div className={s.roomGrid}>
            <div />
            {FLOORS.map(f => <div key={f} className={s.floorHdr}>TẦNG {f}</div>)}
            {['02', '01'].map(line => (
              <div key={line} style={{ display: 'contents' }}>
                <div className={s.rowLbl}>{line}</div>
                {FLOORS.map(f => {
                  const room = `P.${f}${line}`
                  const data = roomMap[room]
                  const occ  = data?.occupied ?? false
                  return data ? (
                    <button
                      key={f}
                      className={`${s.card} ${occ ? s.cardOccupied : ''}`}
                      onClick={() => setDrawer(room)}
                    >
                      <div className={s.cardTop}>
                        <span className={`${s.dot} ${occ ? s.dotOn : s.dotOff}`} />
                        <span className={s.roomNum}>{room}</span>
                        {data.today_count > 0 && (
                          <span className={s.todayBadge}>{data.today_count}</span>
                        )}
                      </div>
                      <div className={s.cardStatus}>{occ ? 'Có người' : 'Vắng'}</div>
                      <div className={s.cardMeta}>
                        <span className={s.cardUser}>{data.last_user || '—'}</span>
                        <span className={s.cardAgo}>{timeAgo(data.last_event)}</span>
                      </div>
                    </button>
                  ) : (
                    <div key={f} className={s.emptySlot} />
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {drawer && (
        <RoomDrawer
          room={drawer}
          occupied={roomMap[drawer]?.occupied ?? false}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
