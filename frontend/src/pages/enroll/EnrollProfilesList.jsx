import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Avatar, SimBar, Spinner, Empty } from '../../components/UI'
import { RoomCheckboxFilter } from '../../components/RoomFilter'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { CONF } from '../enrollData'
import { getEnrollProfiles } from '../../api/client'
import { fmtShortDate, snapUrl } from '../../utils'
import { SubHeader } from './EnrollShell'

export default function EnrollProfilesList() {
  const navigate = useNavigate()
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [rooms, setRooms]   = useState([])
  const [range, setRange]   = useState({ from: '', to: '' })

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: 60 }
    if (rooms.length) params.room = rooms.join(',')
    if (range.from) params.date_from = range.from
    if (range.to)   params.date_to = range.to
    getEnrollProfiles(params)
      .then(r => setItems(r.data))
      .finally(() => setLoading(false))
  }, [rooms, range])

  useEffect(() => { load() }, [rooms, range])

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SubHeader title="Hồ sơ" sub="Danh sách người đã nhận diện · nhấp để xem chi tiết" right={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <RoomCheckboxFilter value={rooms} onChange={setRooms} />
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      } />

      {loading && !items.length ? (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
      ) : !items.length ? (
        <Empty message="Không có hồ sơ nào khớp bộ lọc" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          {items.map(p => {
            const [ck, cl] = CONF[p.confidence_lvl] ?? ['dim', p.confidence_lvl ?? 'unknown']
            return (
              <div key={p.id} onClick={() => navigate(`/enroll/profiles/${p.id}`)} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <Avatar gender={p.gender} size={66} src={snapUrl(p.face_event_id)} />
                <div style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'center' }}>{p.display_name || 'Chưa đặt tên'}</div>
                <div style={{ fontSize: 11, color: 'var(--tlo)' }}>{(p.gender === 'female' ? 'Nữ' : p.gender === 'male' ? 'Nam' : '—') + (p.age_estimate ? ` · ~${p.age_estimate}t` : '')}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Badge kind={ck}>{cl}</Badge><Badge kind="teal">{p.known_room || '—'}</Badge>
                </div>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--txl)' }}>mặt</span>
                  <SimBar value={p.face_quality ?? 0} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tlo)' }}>{p.face_quality?.toFixed(2) ?? '—'}</span>
                </div>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txl)', fontFamily: 'var(--mono)', borderTop: '1px solid var(--bg2)', paddingTop: 9 }}>
                  <span>×{p.enroll_count} lần</span>
                  <span>{p.last_seen_ts ? fmtShortDate(p.last_seen_ts) : '—'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
