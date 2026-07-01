import { useState, useEffect } from 'react'
import { Card, Badge, Empty, Spinner } from '../../components/UI'
import { STATUS } from '../enrollData'
import { getEnrollJobs } from '../../api/client'
import { fmtTime, fmtDuration } from '../../utils'
import { useEnrollHeader } from './EnrollShell'

const JOB_COLS = '1fr 0.8fr 0.8fr 1.2fr 0.8fr 1fr'

export default function EnrollJobs() {
  const { reloadHeader } = useEnrollHeader() ?? {}
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    getEnrollJobs({ limit: 50 })
      .then(r => setItems(r.data))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(); reloadHeader?.() }, [])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>

  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: JOB_COLS, gap: 10, padding: '11px 16px', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.8px', color: 'var(--txl)', textTransform: 'uppercase', borderBottom: '1px solid var(--bg2)' }}>
        <div>Job ID</div><div>Chiều</div><div>Phòng</div><div>Trạng thái</div><div>Thời lượng</div><div>Lúc</div>
      </div>
      {items.map(j => {
        const [sk, sl] = STATUS[j.status] ?? ['dim', j.status]
        const dur = fmtDuration(j.started_at, j.finished_at)
        return (
          <div key={j.id} style={{ display: 'grid', gridTemplateColumns: JOB_COLS, gap: 10, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--bg1)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--tmd)' }}>#{j.id}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: j.direction === 'incoming' ? 'var(--in)' : 'var(--out)' }}>{j.direction === 'incoming' ? '↓ Vào' : '↑ Ra'}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tmd)' }}>{j.room_label}</div>
            <div><Badge kind={sk}>{sl}</Badge></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tlo)' }}>{dur}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>{fmtTime(j.event_time_vn)}</div>
          </div>
        )
      })}
      {!items.length && <Empty message="Không có job nào trong 7 ngày" />}
    </Card>
  )
}
