import { useState, useEffect } from 'react'
import { getAirbnbCalendar } from '../api/client'
import { Icon, Spinner } from '../components/UI'
import s from './AirbnbCalendar.module.css'

const VN_TZ  = 'Asia/Ho_Chi_Minh'
const DOW_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: VN_TZ })
}

function fmtDay(dateStr) {
  // dateStr = "2026-07-01" — parse as local date to avoid TZ shift
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

// ── Header cell ───────────────────────────────────────────────────
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

// ── Calendar cell ─────────────────────────────────────────────────
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

// ── Main page ─────────────────────────────────────────────────────
export default function AirbnbCalendar() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)
  const today = todayStr()

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const { data: d } = await getAirbnbCalendar(30)
      setData(d)
    } catch {
      setErr('Không tải được lịch Airbnb. Kiểm tra kết nối hoặc dữ liệu chưa được scrape.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className={s.center}>
      <Spinner size={22} />
      <span className={s.loadMsg}>Đang tải lịch Airbnb...</span>
    </div>
  )

  if (err || !data) return (
    <div className={s.center}>
      <span className={s.errMsg}>{err}</span>
      <button className={s.retryBtn} onClick={load}>Thử lại</button>
    </div>
  )

  const confirmedCount   = data.rooms.filter(r => r.confirmed).length
  const unconfirmedCount = data.rooms.length - confirmedCount

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.pageHead}>
        <div>
          <h2 className={s.pageTitle}>Lịch Airbnb</h2>
          <span className={s.pageSub}>
            {data.from_date} → {data.to_date}
            &nbsp;·&nbsp;{data.rooms.length} listing
            {unconfirmedCount > 0 && (
              <span className={s.unverifiedNote}>&nbsp;·&nbsp;{unconfirmedCount} chưa xác nhận phòng</span>
            )}
          </span>
        </div>
        <div className={s.pageActions}>
          <div className={s.legend}>
            <span className={s.legendItem}><span className={s.dotFree}/>Rỗi</span>
            <span className={s.legendItem}><span className={s.dotBusy}/>Bận</span>
            <span className={s.legendItem}><span className={s.dotNone}/>Chưa có</span>
          </div>
          <button className={s.btnRefresh} onClick={load} title="Làm mới">
            <Icon name="refresh" size={13}/>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className={s.scrollArea}>
        <div className={s.grid}>

          {/* Column header row */}
          <div className={s.headerRow}>
            <div className={s.labelHead}>Phòng</div>
            {data.dates.map(d => (
              <DateHead key={d} dateStr={d} today={d === today} />
            ))}
            <div className={s.summaryHead}>Rỗi</div>
          </div>

          {/* Room rows */}
          {data.rooms.map(room => (
            <div key={room.id} className={`${s.roomRow} ${!room.confirmed ? s.roomRowUnconfirmed : ''}`}>

              {/* Room label */}
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

              {/* Calendar cells */}
              {data.dates.map(d => (
                <Cell
                  key={d}
                  val={room.calendar[d]}
                  dateStr={d}
                  today={d === today}
                  label={room.label}
                />
              ))}

              {/* Free days summary */}
              <div className={s.summaryCell}>
                <span className={room.free_days > 0 ? s.freeDaysHi : s.freeDays}>
                  {room.free_days}
                </span>
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}
