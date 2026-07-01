import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Avatar, SimBar, Spinner, Empty } from '../../components/UI'
import { CONF } from '../enrollData'
import { getEnrollProfiles } from '../../api/client'
import { fmtShortDate, snapUrl } from '../../utils'

export default function EnrollProfilesList() {
  const navigate = useNavigate()
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEnrollProfiles({ limit: 40 })
      .then(r => setItems(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
  if (!items.length) return <Empty message="Chưa có hồ sơ nào" />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
      {items.map(p => {
        const [ck, cl] = CONF[p.confidence_lvl] ?? ['dim', p.confidence_lvl ?? 'unknown']
        const thumbSrc = snapUrl(p.face_event_id)
        return (
          <div key={p.id} onClick={() => navigate(`/enroll/profiles/${p.id}`)} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <Avatar gender={p.gender} size={66} src={thumbSrc} />
            <div style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'center' }}>{p.display_name}</div>
            <div style={{ fontSize: 11, color: 'var(--tlo)' }}>{(p.gender === 'female' ? 'Nữ' : p.gender === 'male' ? 'Nam' : '—') + (p.age_estimate ? ` · ~${p.age_estimate}t` : '')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Badge kind={ck}>{cl}</Badge><Badge kind="teal">{p.known_room || '—'}</Badge>
            </div>
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--txl)' }}>face</span>
              <SimBar value={p.face_quality ?? 0} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tlo)' }}>{p.face_quality?.toFixed(2) ?? '—'}</span>
            </div>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txl)', fontFamily: 'var(--mono)', borderTop: '1px solid var(--bg2)', paddingTop: 9 }}>
              <span>×{p.enroll_count} enrolls</span>
              <span>{p.last_seen_ts ? fmtShortDate(p.last_seen_ts) : '—'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
