import { useState, useEffect } from 'react'
import { Icon, Spinner } from '../components/UI'
import { getRoomMonthly, getRoomDay } from '../api/client'
import { snapUrl, fmtTime } from '../utils'
import s from './RoomLog.module.css'

const MONTH_VN = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']
const DOW      = ['CN','T2','T3','T4','T5','T6','T7']

function heatClass(count) {
  if (!count)    return s.heat0
  if (count < 2) return s.heat1
  if (count < 4) return s.heat2
  return s.heat3
}

function DayPanel({ room, date, onClose }) {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [lb, setLb]       = useState(null) // { events, idx }

  useEffect(() => {
    setLoading(true)
    setData(null)
    getRoomDay(room, date)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [room, date])

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

  // Hiển thị: "01/07 · 12:01 → 02/07 · 12:00"
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  const nextLabel = `${String(next.getDate()).padStart(2,'0')}/${String(next.getMonth()+1).padStart(2,'0')}`
  const dateLabel = `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')} 12:01 → ${nextLabel} 12:00`

  return (
    <>
      <div className={s.panelOverlay} onClick={() => { if (lb) setLb(null); else onClose(); }} />
      <div className={s.panel}>
        <div className={s.panelHead}>
          <div className={s.panelTitle}>
            <span className={s.panelRoom}>{room}</span>
            <span className={s.panelDate}>{dateLabel}</span>
          </div>
          <button className={s.panelClose} onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className={s.panelBody}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spinner size={20} />
            </div>
          ) : events.length === 0 ? (
            <div className={s.panelEmpty}>Không có sự kiện</div>
          ) : (
            <>
              <div className={s.panelStats}>
                <span className={s.statIn}>↓ {inCount} vào</span>
                <span style={{ color: 'var(--ln2)' }}>·</span>
                <span className={s.statOut}>↑ {outCount} ra</span>
              </div>
              <div className={s.eventList}>
                {events.map((ev, i) => {
                  const isIn = ev.direction === 'incoming'
                  const snap = snapUrl(ev.event_id_n1)
                  return (
                    <div key={i} className={`${s.eventRow} ${isIn ? s.eventIn : s.eventOut}`}>
                      {snap ? (
                        <div className={`${s.thumb} ${s.thumbClick}`}
                          onClick={() => setLb({ events, idx: i })}>
                          <img src={snap} alt="" className={s.thumbImg} loading="lazy" />
                        </div>
                      ) : (
                        <div className={s.thumb}><div className={s.thumbEmpty} /></div>
                      )}
                      <div className={s.eventInfo}>
                        <div className={s.eventTop}>
                          <span className={s.eventDir}>{isIn ? '↓ VÀO' : '↑ RA'}</span>
                          <span className={s.eventUser}>{ev.user_name || '—'}</span>
                        </div>
                        <span className={s.eventTime}>{fmtTime(ev.event_time)}</span>
                        {ev.method && <span className={s.eventMethod}>{ev.method}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
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
            <span className={s.lbCamTag}>N1</span>
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
              <span className={s.lbRoom}>{room}</span>
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

export default function RoomLog() {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState(null) // { room, date }

  useEffect(() => {
    setLoading(true)
    getRoomMonthly(year, month)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [year, month])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const todayDate = isCurrentMonth ? today.getDate() : null
  const days  = data?.days_in_month ?? 30
  const rooms = data?.rooms ?? []

  function togglePanel(room, dateKey) {
    setPanel(p => (p?.room === room && p?.date === dateKey) ? null : { room, date: dateKey })
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>Lịch phòng</h1>
          <span className={s.sub}>Ngày khách sạn 12:01 → 12:00 hôm sau · click ô để xem logs</span>
        </div>
        <div className={s.monthNav}>
          <button className={s.navBtn} onClick={prevMonth}><Icon name="chevLeft" size={13} /></button>
          <span className={s.monthLabel}>{MONTH_VN[month - 1]} · {year}</span>
          <button className={s.navBtn} onClick={nextMonth} disabled={isCurrentMonth}>
            <Icon name="chevron" size={13} />
          </button>
          {!isCurrentMonth && (
            <button className={s.todayBtn} onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1) }}>
              Hôm nay
            </button>
          )}
        </div>
      </div>

      <div className={s.legend}>
        {[['Trống', s.heat0], ['1 lượt', s.heat1], ['2–3 lượt', s.heat2], ['4+ lượt', s.heat3]].map(([label, cls]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className={`${s.legendDot} ${cls}`}
              style={cls === s.heat0 ? { border: '1px solid var(--ln)' } : {}} />
            {label}
          </span>
        ))}
        <span className={s.legendNote}>* từ 12:01 mỗi ngày</span>
      </div>

      {loading ? (
        <div className={s.centerSpinner}><Spinner size={24} /></div>
      ) : (
        <div className={s.gridWrap}>
          <div className={s.grid} style={{ '--ncols': days }}>
            <div className={s.cornerCell} />
            {Array.from({ length: days }, (_, i) => {
              const d    = i + 1
              const dow  = DOW[new Date(year, month - 1, d).getDay()]
              const wknd = dow === 'T7' || dow === 'CN'
              return (
                <div key={d} className={[s.dayHdr, d === todayDate && s.dayHdrToday, wknd && s.dayHdrWeekend].filter(Boolean).join(' ')}>
                  <span className={s.dayNum}>{String(d).padStart(2, '0')}</span>
                  <span className={s.dayWd}>{dow}</span>
                </div>
              )
            })}
            {rooms.map(({ room, days: dayMap }) => (
              <div key={room} style={{ display: 'contents' }}>
                <div className={s.roomLbl}>{room}</div>
                {Array.from({ length: days }, (_, i) => {
                  const d       = i + 1
                  const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                  const entry   = dayMap[dateKey]
                  const count   = entry?.count ?? 0
                  const isToday = d === todayDate
                  const sel     = panel?.room === room && panel?.date === dateKey
                  return (
                    <div
                      key={d}
                      className={[s.cell, heatClass(count), isToday && s.cellToday, sel && s.cellSelected].filter(Boolean).join(' ')}
                      onClick={() => togglePanel(room, dateKey)}
                      title={count ? `${room} · ${dateKey} · ${count} lượt` : ''}
                    >
                      {count > 0 && <span className={s.cellCount}>{count}</span>}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {panel && (
        <DayPanel room={panel.room} date={panel.date} onClose={() => setPanel(null)} />
      )}
    </div>
  )
}
