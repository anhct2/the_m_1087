import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Spinner, Empty } from '../../components/UI'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { getOccupancy, getGateSessions } from '../../api/client'
import { fmtTime, fmtShortDate, snapUrl } from '../../utils'
import { SubHeader } from './EnrollShell'
import { GateSessionDrawer } from './GateSessionDetail'

const FLOORS = [2, 3, 4, 5, 6, 7]
const durText = h => h < 1 ? `${Math.round(h * 60)}m` : `${Number(h).toFixed(1)}h`
const durColor = h => h > 8 ? 'var(--alm)' : h > 4 ? 'var(--am)' : 'var(--in)'

export default function EnrollOccupancy() {
  const navigate = useNavigate()
  const [view, setView]   = useState('profile')  // 'profile' | 'gate'
  const [range, setRange] = useState({ from: '', to: '' })

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SubHeader title="Lưu trú" sub={view === 'profile' ? 'Ai đang / đã ở phòng nào' : 'Nhật ký ra vào theo phòng'} right={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: 3 }}>
            {[['profile', 'Theo hồ sơ'], ['gate', 'Theo Gate Log']].map(([v, l]) => (
              <span key={v} onClick={() => setView(v)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: view === v ? 'var(--bg3)' : 'transparent', color: view === v ? 'var(--thi)' : 'var(--tlo)', fontWeight: view === v ? 500 : 400 }}>{l}</span>
            ))}
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      } />
      {view === 'profile'
        ? <ProfileView range={range} navigate={navigate} />
        : <GateView range={range} />}
    </div>
  )
}

function ProfileView({ range, navigate }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (range.from) params.date_from = range.from
    if (range.to)   params.date_to = range.to
    getOccupancy(params).then(r => setRows(r.data)).finally(() => setLoading(false))
  }, [range])
  useEffect(() => { load() }, [range])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>

  const roomMap = {}
  rows.forEach(r => { (roomMap[r.room_id] ||= []).push(r) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {FLOORS.map(f => (
        <div key={f} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 12, alignItems: 'start' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--tlo)', paddingTop: 14 }}>Tầng {f}</div>
          {[`P.${f}01`, `P.${f}02`].map(rk => {
            const g = roomMap[rk] || []
            return (
              <div key={rk} style={{ borderRadius: 11, padding: 13, border: `1px solid ${g.some(x => x.active) ? 'var(--in3)' : 'var(--ln)'}`, background: g.some(x => x.active) ? 'oklch(0.2 0.02 152 / 0.28)' : 'oklch(0.175 0.006 255)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{rk}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: g.length ? 'oklch(0.8 0.12 152)' : 'var(--txl)' }}>{g.length ? `${g.length} người` : 'trống'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {g.map((gu, gi) => {
                    const hrs = Number(gu.hours_in_room ?? 0)
                    return (
                      <div key={gi} onClick={() => navigate(`/enroll/profiles/${gu.person_id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <Avatar gender={gu.gender} size={32} src={snapUrl(gu.face_event_id)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gu.display_name || 'Chưa đặt tên'}</span>
                            {!gu.active && <Badge kind="dim">đã ra</Badge>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                            <div style={{ flex: 1, maxWidth: 120, height: 5, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, (hrs / 12) * 100)}%`, background: durColor(hrs) }} />
                            </div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tmd)' }}>{durText(hrs)}</span>
                            <span style={{ fontSize: 10, color: 'var(--txl)' }}>vào {gu.entry_ts ? fmtTime(gu.entry_ts) : '—'}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {!g.length && <span style={{ fontSize: 11, color: 'var(--txl)' }}>—</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function GateView({ range }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: 200 }
    if (range.from) params.date_from = range.from
    if (range.to)   params.date_to = range.to
    getGateSessions(params).then(r => setItems(r.data.items)).finally(() => setLoading(false))
  }, [range])
  useEffect(() => { load() }, [range])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
  if (!items.length) return <Empty message="Không có lượt ra vào nào trong khoảng ngày" />

  const byRoom = {}
  items.forEach(x => { (byRoom[x.room_label] ||= []).push(x) })
  const rooms = Object.keys(byRoom).sort()

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {rooms.map(room => (
          <div key={room} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: '1px solid var(--bg2)' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--te)' }}>{room}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{byRoom[room].length} lượt</span>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {byRoom[room].map(ev => {
                const isIn = ev.direction === 'incoming'
                return (
                  <div key={ev.door_id} onClick={() => setDrawer(ev.door_id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--bg1)', cursor: 'pointer' }}>
                    <Avatar gender={ev.recognized_gender} size={30} src={snapUrl(ev.snap_event_id)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.recognized_name || ev.gate_user_name || 'Chưa nhận diện'}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)' }}>{fmtShortDate(ev.event_time_vn)} {fmtTime(ev.event_time_vn)}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: isIn ? 'var(--in)' : 'var(--out)' }}>{isIn ? '↓ Vào' : '↑ Ra'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {drawer != null && <GateSessionDrawer doorId={drawer} onClose={() => setDrawer(null)} onChanged={() => { setDrawer(null); load() }} />}
    </>
  )
}
