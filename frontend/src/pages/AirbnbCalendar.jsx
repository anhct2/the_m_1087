import { useState, useEffect } from 'react'
import { Card, Icon, Spinner } from '../components/UI'
import { getAirbnbCalendarMonth } from '../api/client'

const FREE = 'oklch(0.72 0.14 152)', BUSY = 'oklch(0.62 0.16 25)', NONE = 'oklch(0.34 0.01 255)'
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const MONTH_VN = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']
const LEGEND = [['Rỗi', FREE], ['Bận', BUSY], ['Chưa có', NONE]]

export default function AirbnbCalendar() {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getAirbnbCalendarMonth(year, month)
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

  const rooms   = data?.rooms ?? []
  const dates   = data?.dates ?? []
  const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  // Build calendar cells: empty slots + day slots
  const firstDow = dates.length ? new Date(dates[0]).getDay() : 0
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push({ empty: true, key: `e${i}` })
  dates.forEach(iso => {
    const d   = new Date(iso)
    const wk  = d.getDay()
    const wknd = wk === 0 || wk === 6
    // Each room: true=free, false=busy, undefined=none
    const dots = rooms.map(r => {
      const val = r.calendar[iso]
      if (val === true)  return FREE
      if (val === false) return BUSY
      return NONE
    })
    cells.push({ empty: false, key: iso, day: d.getDate(), isToday: iso === todayIso, wknd, dots })
  })

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>Lịch Airbnb</h1>
          <div style={{ fontSize: 12.5, color: 'var(--tlo)', marginTop: 4 }}>
            {loading ? 'Đang tải…' : `${rooms.length} listing · tình trạng phòng theo ngày`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 9, padding: 4 }}>
          <span onClick={prevMonth} style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tmd)', cursor: 'pointer' }}><Icon name="chevLeft" size={14} /></span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, minWidth: 130, textAlign: 'center' }}>{MONTH_VN[month - 1]} · {year}</span>
          <span onClick={nextMonth} style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tmd)', cursor: 'pointer' }}><Icon name="chevron" size={14} /></span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        {LEGEND.map(([l, c]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--tlo)' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />{l}</span>
        ))}
        {rooms.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txl)' }}>
            Mỗi ô hiển thị {rooms.length} chấm: {rooms.map(r => r.label).join(' · ')}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>
      ) : rooms.length === 0 ? (
        <Card pad={18}><div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--tlo)' }}>Không có Airbnb listing nào được cấu hình.</div></Card>
      ) : (
        <Card pad={18}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
            {DOW.map((d, i) => (
              <div key={d} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '1px', paddingBottom: 6, color: (i === 0 || i === 6) ? 'oklch(0.5 0.06 25)' : 'var(--txl)' }}>{d}</div>
            ))}
            {cells.map(c => c.empty ? <div key={c.key} /> : (
              <div key={c.key} style={{ borderRadius: 8, padding: '7px 8px', minHeight: 62, display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${c.isToday ? 'var(--in3)' : 'var(--ln)'}`, background: c.isToday ? 'oklch(0.78 0.15 152 / 0.08)' : c.wknd ? 'oklch(0.17 0.007 255)' : 'var(--bg1)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: c.isToday ? 'oklch(0.85 0.11 152)' : c.wknd ? 'oklch(0.55 0.06 25)' : 'var(--tmd)' }}>{c.day}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {c.dots.map((col, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 2, background: col }} />)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
