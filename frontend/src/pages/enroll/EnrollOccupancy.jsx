import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Spinner, Empty } from '../../components/UI'
import { RoomCheckboxFilter } from '../../components/RoomFilter'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { getStaysByGate, getStaysByProfile } from '../../api/client'
import { STATUS } from '../enrollData'
import { fmtTime, fmtShortDate, fmtRoomWindow, snapUrl } from '../../utils'
import { SubHeader } from './EnrollShell'
import { GateSessionDrawer } from './GateSessionDetail'

/**
 * Lưu trú theo CỬA SỔ PHÒNG: 1 ngày phòng D = [D 12h trưa, D+1 12h trưa)
 * — đúng quy tắc đặt phòng, nên lượt Ra 9h sáng vẫn nằm cùng "ngày" với
 * lượt Vào chiều hôm trước.
 *  - Theo hồ sơ : ngày → phòng → profile (kèm số lượt vào/ra)
 *  - Theo Gate Log: ngày → phòng → từng gate log → profile
 */
export default function EnrollOccupancy() {
  const navigate = useNavigate()
  const [view, setView]   = useState('profile')  // 'profile' | 'gate'
  const [rooms, setRooms] = useState([])
  const [range, setRange] = useState({ from: '', to: '' })

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SubHeader
        title="Lưu trú"
        sub={`Theo cửa sổ phòng (12h trưa → 12h trưa hôm sau) · ${view === 'profile' ? 'ngày → phòng → hồ sơ' : 'ngày → phòng → gate log'}`}
        right={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: 3 }}>
              {[['profile', 'Theo hồ sơ'], ['gate', 'Theo Gate Log']].map(([v, l]) => (
                <span key={v} onClick={() => setView(v)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: view === v ? 'var(--bg3)' : 'transparent', color: view === v ? 'var(--thi)' : 'var(--tlo)', fontWeight: view === v ? 500 : 400 }}>{l}</span>
              ))}
            </div>
            <RoomCheckboxFilter value={rooms} onChange={setRooms} />
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        }
      />
      {view === 'profile'
        ? <ProfileView rooms={rooms} range={range} navigate={navigate} />
        : <GateView rooms={rooms} range={range} />}
    </div>
  )
}

// Gom rows phẳng thành [{ day, rooms: [{ room, rows }] }] — ngày mới nhất trước
function groupByDayRoom(rows, roomKey) {
  const days = {}
  rows.forEach(r => {
    const day = r.window_date
    const room = r[roomKey] || 'Chưa gán phòng'
    ;((days[day] ||= {})[room] ||= []).push(r)
  })
  return Object.keys(days).sort().reverse().map(day => ({
    day,
    rooms: Object.keys(days[day]).sort().map(room => ({ room, rows: days[day][room] })),
  }))
}

function DayHeader({ day }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 2px' }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{fmtShortDate(`${day}T00:00:00`)}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)' }}>{fmtRoomWindow(day)}</span>
    </div>
  )
}

function RoomCard({ room, count, countLabel, children }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bg2)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--te)' }}>{room}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{count} {countLabel}</span>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>{children}</div>
    </div>
  )
}

// ── Theo hồ sơ: ngày → phòng → profile ─────────────────────────
function ProfileView({ rooms, range, navigate }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (rooms.length) params.room = rooms.join(',')
    if (range.from) params.date_from = range.from
    if (range.to)   params.date_to = range.to
    getStaysByProfile(params).then(r => setRows(r.data)).finally(() => setLoading(false))
  }, [rooms, range])
  useEffect(() => { load() }, [rooms, range])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
  if (!rows.length) return <Empty message="Không có lượt lưu trú nào trong khoảng ngày" />

  const grouped = groupByDayRoom(rows, 'room_label')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {grouped.map(({ day, rooms: dayRooms }) => (
        <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DayHeader day={day} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {dayRooms.map(({ room, rows: people }) => (
              <RoomCard key={room} room={room} count={people.length} countLabel="người">
                {people.map(p => (
                  <div key={p.person_id} onClick={() => navigate(`/enroll/profiles/${p.person_id}`)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 14px', borderBottom: '1px solid var(--bg1)', cursor: 'pointer' }}>
                    <Avatar gender={p.gender} size={34} src={snapUrl(p.face_event_id)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.display_name || 'Chưa đặt tên'}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)', marginTop: 3 }}>
                        {fmtTime(p.first_seen_ts)}{p.last_seen_ts !== p.first_seen_ts ? ` → ${fmtTime(p.last_seen_ts)}` : ''}
                      </div>
                    </div>
                    <span title="lượt vào" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--in)' }}>↓{p.incoming_count}</span>
                    <span title="lượt ra" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--out)' }}>↑{p.outgoing_count}</span>
                  </div>
                ))}
              </RoomCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Theo Gate Log: ngày → phòng → gate log → profile ───────────
function GateView({ rooms, range }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (rooms.length) params.room = rooms.join(',')
    if (range.from) params.date_from = range.from
    if (range.to)   params.date_to = range.to
    getStaysByGate(params).then(r => setRows(r.data)).finally(() => setLoading(false))
  }, [rooms, range])
  useEffect(() => { load() }, [rooms, range])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
  if (!rows.length) return <Empty message="Không có lượt ra vào nào trong khoảng ngày" />

  const grouped = groupByDayRoom(rows, 'room_label')

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map(({ day, rooms: dayRooms }) => (
          <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DayHeader day={day} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {dayRooms.map(({ room, rows: events }) => (
                <RoomCard key={room} room={room} count={events.length} countLabel="lượt">
                  {events.map(ev => {
                    const isIn = ev.direction === 'incoming'
                    const [sk, sl] = STATUS[ev.effective_status] ?? ['dim', ev.effective_status]
                    return (
                      <div key={`${ev.door_id}-${ev.direction}-${ev.event_time_vn}`} onClick={() => setDrawer(ev.door_id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--bg1)', cursor: 'pointer' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, minWidth: 42, color: isIn ? 'var(--in)' : 'var(--out)' }}>{isIn ? '↓ Vào' : '↑ Ra'}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tmd)', minWidth: 52 }}>{fmtTime(ev.event_time_vn)}</span>
                        <Avatar gender={ev.recognized_gender} size={28} src={snapUrl(ev.snap_event_id)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ev.recognized_name || ev.gate_user_name || 'Chưa nhận diện'}
                          </div>
                        </div>
                        <Badge kind={sk}>{sl}</Badge>
                      </div>
                    )
                  })}
                </RoomCard>
              ))}
            </div>
          </div>
        ))}
      </div>
      {drawer != null && <GateSessionDrawer doorId={drawer} onClose={() => setDrawer(null)} onChanged={() => { setDrawer(null); load() }} />}
    </>
  )
}
