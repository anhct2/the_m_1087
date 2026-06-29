import { useState, useEffect } from 'react'
import { getAirbnbCalendar, getAirbnbCalendarMonth } from '../api/client'
import { Icon, Spinner } from '../components/UI'
import s from './AirbnbCalendar.module.css'

const VN_TZ   = 'Asia/Ho_Chi_Minh'
const DOW_VN  = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const MON_VN  = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                 'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: VN_TZ })
}

function fmtDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt  = new Date(y, m - 1, d)
  const dow = DOW_VN[dt.getDay()]
  const dd  = String(d).padStart(2, '0')
  const mm  = String(m).padStart(2, '0')
  return { dow, dmy: `${dd}/${mm}` }
}

function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return day === 0 || day === 6
}

// ── Timeline: header cell ──────────────────────────────────────────
function DateHead({ dateStr, today }) {
  const { dow, dmy } = fmtDay(dateStr)
  const weekend      = isWeekend(dateStr)
  return (
    <div className={`${s.dateHead} ${today ? s.dateHeadToday : ''} ${weekend ? s.dateHeadWknd : ''}`}>
      <span className={s.dateDow}>{dow}</span>
      <span className={s.dateDmy}>{dmy}</span>
    </div>
  )
}

// ── Timeline: calendar cell ────────────────────────────────────────
function Cell({ val, dateStr, today, label }) {
  const weekend = isWeekend(dateStr)
  let cls = s.cellNone
  if (val === true)  cls = s.cellFree
  if (val === false) cls = s.cellBusy
  const title = `${label} · ${dateStr} · ${val === true ? 'Rỗi' : val === false ? 'Bận' : 'Chưa có dữ liệu'}`
  return (
    <div className={`${s.cell} ${today ? s.cellToday : ''} ${weekend ? s.cellWknd : ''}`} title={title}>
      <div className={`${s.cellDot} ${cls}`} />
    </div>
  )
}

// ── Timeline view ──────────────────────────────────────────────────
function TimelineView({ data, today }) {
  return (
    <div className={s.scrollArea}>
      <div className={s.grid}>
        <div className={s.headerRow}>
          <div className={s.labelHead}>Phòng</div>
          {data.dates.map(d => (
            <DateHead key={d} dateStr={d} today={d === today} />
          ))}
          <div className={s.summaryHead}>Rỗi</div>
        </div>

        {data.rooms.map(room => (
          <div key={room.id} className={`${s.roomRow} ${!room.confirmed ? s.roomRowUnconfirmed : ''}`}>
            <div className={s.labelCell}>
              {room.confirmed ? (
                <span className={s.roomName}>{room.label}</span>
              ) : (
                <span className={s.listingId} title={`Airbnb ID: ${room.listing_id}`}>
                  <span className={s.unconfTag}>?</span>
                  {room.listing_id?.slice(-8)}
                </span>
              )}
            </div>
            {data.dates.map(d => (
              <Cell
                key={d}
                val={room.calendar[d]}
                dateStr={d}
                today={d === today}
                label={room.label}
              />
            ))}
            <div className={s.summaryCell}>
              <span className={room.free_days > 0 ? s.freeDaysHi : s.freeDays}>
                {room.free_days}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Monthly view ───────────────────────────────────────────────────
function MonthView({ data, viewYear, viewMonth, today }) {
  const rooms      = data.rooms
  const firstDow   = new Date(viewYear, viewMonth - 1, 1).getDay()
  const daysInMon  = new Date(viewYear, viewMonth, 0).getDate()

  // Build cells: null = empty padding, string = date
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMon; d++) {
    cells.push(
      `${viewYear}-${String(viewMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    )
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className={s.monthView}>
      {/* DOW headers */}
      <div className={s.dowRow}>
        {DOW_VN.map((d, i) => (
          <div key={d} className={`${s.dowHead} ${i === 0 || i === 6 ? s.dowWknd : ''}`}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className={s.monthGrid}>
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} className={`${s.dayCell} ${s.dayCellEmpty}`} />
          const isPast   = dateStr < today
          const isToday  = dateStr === today
          const wknd     = isWeekend(dateStr)
          const [,, dd]  = dateStr.split('-')
          const dayNum   = parseInt(dd)

          return (
            <div
              key={dateStr}
              className={[
                s.dayCell,
                isToday  ? s.dayCellToday : '',
                isPast   ? s.dayCellPast  : '',
                wknd     ? s.dayCellWknd  : '',
              ].join(' ')}
            >
              <span className={`${s.dayNum} ${isToday ? s.dayNumToday : ''}`}>
                {dayNum}
              </span>
              <div className={s.mDotRow}>
                {rooms.map(room => {
                  const val = room.calendar[dateStr]
                  const cls = val === true  ? s.mDotFree
                            : val === false ? s.mDotBusy
                            :                s.mDotNone
                  return (
                    <span
                      key={room.id}
                      className={`${s.mDot} ${cls}`}
                      title={`${room.label}: ${val === true ? 'Rỗi' : val === false ? 'Bận' : 'Chưa có'}`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Room legend */}
      {rooms.length > 0 && (
        <div className={s.roomLegend}>
          {rooms.map(room => (
            <span key={room.id} className={s.roomLegendItem}>
              <span className={`${s.mDot} ${s.mDotFree}`} />
              <span className={s.roomLegendName}>{room.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────
export default function AirbnbCalendar() {
  const nowVN      = new Date(new Date().toLocaleString('en-US', { timeZone: VN_TZ }))
  const [viewMode,  setViewMode]  = useState('month')
  const [viewYear,  setViewYear]  = useState(nowVN.getFullYear())
  const [viewMonth, setViewMonth] = useState(nowVN.getMonth() + 1)
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [err,       setErr]       = useState(null)
  const today = todayStr()

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const { data: d } = viewMode === 'month'
        ? await getAirbnbCalendarMonth(viewYear, viewMonth)
        : await getAirbnbCalendar(30)
      setData(d)
    } catch {
      setErr('Không tải được lịch Airbnb. Kiểm tra kết nối hoặc dữ liệu chưa được scrape.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [viewMode, viewYear, viewMonth])  // eslint-disable-line

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }

  const confirmedCount   = data?.rooms.filter(r => r.confirmed).length ?? 0
  const unconfirmedCount = (data?.rooms.length ?? 0) - confirmedCount

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.pageHead}>
        <div>
          <h2 className={s.pageTitle}>Lịch Airbnb</h2>
          {data && (
            <span className={s.pageSub}>
              {data.rooms.length} listing
              {unconfirmedCount > 0 && (
                <span className={s.unverifiedNote}>&nbsp;·&nbsp;{unconfirmedCount} chưa xác nhận phòng</span>
              )}
            </span>
          )}
        </div>

        <div className={s.pageActions}>
          {/* Month navigation (only in month view) */}
          {viewMode === 'month' && (
            <div className={s.monthNav}>
              <button className={s.navBtn} onClick={prevMonth} title="Tháng trước">
                <Icon name="chevLeft" size={13} />
              </button>
              <span className={s.monthLabel}>{MON_VN[viewMonth - 1]} {viewYear}</span>
              <button className={s.navBtn} onClick={nextMonth} title="Tháng sau">
                <Icon name="chevron" size={13} />
              </button>
            </div>
          )}

          {/* Legend */}
          <div className={s.legend}>
            <span className={s.legendItem}><span className={s.dotFree}/>Rỗi</span>
            <span className={s.legendItem}><span className={s.dotBusy}/>Bận</span>
            <span className={s.legendItem}><span className={s.dotNone}/>Chưa có</span>
          </div>

          {/* View toggle */}
          <div className={s.viewToggle}>
            <button
              className={`${s.viewBtn} ${viewMode === 'month' ? s.viewBtnActive : ''}`}
              onClick={() => setViewMode('month')}
            >
              Tháng
            </button>
            <button
              className={`${s.viewBtn} ${viewMode === 'timeline' ? s.viewBtnActive : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              Dòng thời gian
            </button>
          </div>

          <button className={s.btnRefresh} onClick={load} title="Làm mới">
            <Icon name="refresh" size={13}/>
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className={s.center}>
          <Spinner size={22} />
          <span className={s.loadMsg}>Đang tải lịch Airbnb...</span>
        </div>
      ) : err || !data ? (
        <div className={s.center}>
          <span className={s.errMsg}>{err}</span>
          <button className={s.retryBtn} onClick={load}>Thử lại</button>
        </div>
      ) : viewMode === 'month' ? (
        <MonthView data={data} viewYear={viewYear} viewMonth={viewMonth} today={today} />
      ) : (
        <TimelineView data={data} today={today} />
      )}
    </div>
  )
}
