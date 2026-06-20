import React, { useState, useEffect, useCallback, useRef } from 'react'
import { getRoomMonthly, getRoomDay } from '../api/client'
import { Spinner, Icon } from '../components/UI'
import s from './RoomLog.module.css'

const VN_TZ   = 'Asia/Ho_Chi_Minh'
const ROOMS   = ['P.201','P.202','P.301','P.302','P.401','P.402','P.501','P.502','P.601','P.602','P.701','P.702']
const snapUrl = id => id ? `/api/media/snapshot/${id}` : null

const VN_MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                   'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

function nowVN() {
  const d   = new Date()
  const str = d.toLocaleDateString('en-CA', { timeZone: VN_TZ }) // YYYY-MM-DD
  const [y, m] = str.split('-').map(Number)
  return { year: y, month: m }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
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

function fmtDay(day) {
  return String(day).padStart(2, '0')
}

function weekdayOf(year, month, day) {
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('vi-VN', { weekday: 'short', timeZone: VN_TZ })
}

/* ── Cell heat level ───────────────────────────────────────── */
function heatLevel(inCount) {
  if (!inCount || inCount === 0) return 0
  if (inCount === 1) return 1
  if (inCount <= 3) return 2
  return 3
}

/* ── Heatmap Cell ──────────────────────────────────────────── */
function HeatCell({ room, day, dateStr, data, isToday, isSelected, onClick }) {
  const inCount  = data?.in  ?? 0
  const outCount = data?.out ?? 0
  const level    = heatLevel(inCount)
  const hasAct   = inCount > 0 || outCount > 0

  return (
    <button
      className={`${s.cell} ${s['heat' + level]} ${isToday ? s.cellToday : ''} ${isSelected ? s.cellSelected : ''} ${hasAct ? s.cellActive : ''}`}
      onClick={() => onClick(room, dateStr)}
      title={hasAct ? `${room} ${dateStr}: ${inCount} vào, ${outCount} ra` : `${room} ${dateStr}: không có`}
    >
      {inCount > 0 && <span className={s.cellCount}>{inCount}</span>}
    </button>
  )
}

/* ── Day Detail Panel ──────────────────────────────────────── */
function DayPanel({ room, dateStr, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [lbIdx,   setLbIdx]   = useState(null)

  useEffect(() => {
    if (!room || !dateStr) return
    setData(null)
    setLbIdx(null)
    setLoading(true)
    getRoomDay(room, dateStr)
      .then(r => setData(r.data))
      .catch(() => setData({ events: [] }))
      .finally(() => setLoading(false))
  }, [room, dateStr])

  const imgEvents = data?.events.filter(e => e.direction === 'incoming' && e.event_id_n1) || []

  return (
    <>
      <div className={s.panelOverlay} onClick={onClose} />
      <aside className={s.panel}>
        <div className={s.panelHead}>
          <div className={s.panelTitle}>
            <span className={s.panelRoom}>{room}</span>
            <span className={s.panelDate}>{dateStr}</span>
          </div>
          <button className={s.panelClose} onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className={s.panelBody}>
          {loading ? (
            <div className={s.centerSpinner}><Spinner size={18} /></div>
          ) : data?.events.length === 0 ? (
            <div className={s.panelEmpty}>Không có sự kiện</div>
          ) : (
            <>
              <div className={s.panelStats}>
                <span className={s.statIn}>
                  ↓ {data.events.filter(e => e.direction === 'incoming').length} lượt vào
                </span>
                <span className={s.statOut}>
                  ↑ {data.events.filter(e => e.direction === 'outgoing').length} lượt ra
                </span>
              </div>

              <div className={s.eventList}>
                {data.events.map((e, i) => {
                  const isIn   = e.direction === 'incoming'
                  const imgIdx = imgEvents.indexOf(e)
                  const hasImg = imgIdx >= 0
                  const thumb  = hasImg ? snapUrl(e.event_id_n1) : null
                  return (
                    <div key={i} className={`${s.eventRow} ${isIn ? s.eventIn : s.eventOut}`}>
                      {isIn && (
                        <Thumb
                          src={thumb}
                          clickable={hasImg}
                          onClick={hasImg ? () => setLbIdx(imgIdx) : undefined}
                        />
                      )}
                      <div className={s.eventInfo}>
                        <div className={s.eventTop}>
                          <span className={s.eventDir}>{isIn ? '↓ Vào' : '↑ Ra'}</span>
                          <span className={s.eventUser}>{e.user_name || '—'}</span>
                        </div>
                        <span className={s.eventTime}>{fmtDatetime(e.event_time)}</span>
                        {e.method && <span className={s.eventMethod}>{e.method}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </aside>

      {lbIdx != null && imgEvents.length > 0 && (
        <DayLightbox
          events={imgEvents}
          idx={lbIdx}
          room={room}
          onClose={() => setLbIdx(null)}
          onNav={setLbIdx}
        />
      )}
    </>
  )
}

/* ── Thumbnail ─────────────────────────────────────────────── */
function Thumb({ src, clickable, onClick }) {
  const [err, setErr] = useState(false)
  return (
    <div
      className={`${s.thumb} ${clickable && !err ? s.thumbClick : ''}`}
      onClick={clickable && !err ? onClick : undefined}
    >
      {src && !err
        ? <img src={src} alt="N1" className={s.thumbImg} onError={() => setErr(true)} />
        : <div className={s.thumbEmpty} />}
    </div>
  )
}

/* ── Lightbox (fullscreen, Facebook-style) ─────────────────── */
function DayLightbox({ events, idx, room, onClose, onNav }) {
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
      <span className={s.lbCamTag}>N1</span>
      <button className={s.lbClose} onClick={onClose}>
        <Icon name="x" size={18} />
      </button>

      {src && !imgErr
        ? <img src={src} alt="N1" className={s.lbImg}
            onClick={ev => ev.stopPropagation()}
            onError={() => setImgErr(true)} />
        : <div className={s.lbNoSig} onClick={ev => ev.stopPropagation()}>NO SIGNAL</div>}

      <button className={`${s.lbNav} ${s.lbNavLeft}`} disabled={!hasPrev}
        onClick={ev => { ev.stopPropagation(); onNav(idx - 1) }}>
        <Icon name="chevLeft" size={24} />
      </button>
      <button className={`${s.lbNav} ${s.lbNavRight}`} disabled={!hasNext}
        onClick={ev => { ev.stopPropagation(); onNav(idx + 1) }}>
        <Icon name="chevron" size={24} />
      </button>

      <div className={s.lbMeta}>
        <span className={s.lbRoom}>{room}</span>
        <span className={s.lbName}>{e.user_name || '—'}</span>
        <span className={s.lbTime}>{fmtDatetime(e.event_time)}</span>
        <span className={s.lbCounter}>{idx + 1} / {events.length}</span>
      </div>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────── */
export default function RoomLog() {
  const { year: curYear, month: curMonth } = nowVN()
  const [year,     setYear]     = useState(curYear)
  const [month,    setMonth]    = useState(curMonth)
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null) // { room, date }

  const load = useCallback((y, m) => {
    setLoading(true)
    setData(null)
    getRoomMonthly(y, m)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(year, month) }, [year, month, load])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelected(null)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelected(null)
  }
  const goToday = () => {
    setYear(curYear); setMonth(curMonth); setSelected(null)
  }

  const isCurrentMonth = year === curYear && month === curMonth
  const days = daysInMonth(year, month)
  const dayList = Array.from({ length: days }, (_, i) => i + 1)

  // Today's date string
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: VN_TZ })

  const handleCellClick = (room, dateStr) => {
    setSelected(prev =>
      prev?.room === room && prev?.date === dateStr ? null : { room, date: dateStr }
    )
  }

  // Build lookup map from API data
  const dataMap = {}
  if (data) {
    for (const rd of data.rooms) {
      dataMap[rd.room] = rd.days
    }
  }

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>Lịch phòng</h1>
          <span className={s.sub}>Lịch sử bận / trống theo ngày</span>
        </div>
        <div className={s.monthNav}>
          {!isCurrentMonth && (
            <button className={s.todayBtn} onClick={goToday}>Hôm nay</button>
          )}
          <button className={s.navBtn} onClick={prevMonth}>
            <Icon name="chevLeft" size={14} />
          </button>
          <span className={s.monthLabel}>{VN_MONTHS[month - 1]} {year}</span>
          <button className={s.navBtn} onClick={nextMonth} disabled={isCurrentMonth}>
            <Icon name="chevron" size={14} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className={s.legend}>
        <div className={`${s.legendDot} ${s.heat0}`} /><span>Không hoạt động</span>
        <div className={`${s.legendDot} ${s.heat1}`} /><span>1 lượt</span>
        <div className={`${s.legendDot} ${s.heat2}`} /><span>2–3 lượt</span>
        <div className={`${s.legendDot} ${s.heat3}`} /><span>4+ lượt</span>
        <span className={s.legendNote}>· Số trong ô = lượt vào (incoming)</span>
      </div>

      {/* Grid */}
      <div className={s.gridWrap}>
        {loading ? (
          <div className={s.centerSpinner}><Spinner size={24} /></div>
        ) : (
          <div className={s.grid} style={{ '--ncols': days }}>
            {/* Corner */}
            <div className={s.cornerCell} />

            {/* Day headers */}
            {dayList.map(d => {
              const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const isToday = dateStr === todayStr
              const wd      = weekdayOf(year, month, d)
              const isSun   = wd.startsWith('CN') || wd.startsWith('cn')
              const isSat   = wd.startsWith('T7') || wd.startsWith('t7')
              return (
                <div key={d} className={`${s.dayHdr} ${isToday ? s.dayHdrToday : ''} ${(isSun || isSat) ? s.dayHdrWeekend : ''}`}>
                  <span className={s.dayNum}>{fmtDay(d)}</span>
                  <span className={s.dayWd}>{wd}</span>
                </div>
              )
            })}

            {/* Rows: one per room */}
            {ROOMS.map(room => {
              const roomDays = dataMap[room] || {}
              return (
                <React.Fragment key={room}>
                  {/* Room label */}
                  <div className={s.roomLbl}>{room}</div>

                  {/* Day cells */}
                  {dayList.map(d => {
                    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                    const isToday = dateStr === todayStr
                    const isSel   = selected?.room === room && selected?.date === dateStr
                    return (
                      <HeatCell
                        key={`${room}-${d}`}
                        room={room}
                        day={d}
                        dateStr={dateStr}
                        data={roomDays[dateStr]}
                        isToday={isToday}
                        isSelected={isSel}
                        onClick={handleCellClick}
                      />
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* Side panel */}
      {selected && (
        <DayPanel
          room={selected.room}
          dateStr={selected.date}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
