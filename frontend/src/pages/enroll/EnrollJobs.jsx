import { useState, useEffect, useCallback } from 'react'
import { Card, Badge, Btn, Icon, Empty, Spinner } from '../../components/UI'
import { STATUS } from '../enrollData'
import { getEnrollJobs, retryJob, cancelJob } from '../../api/client'
import { fmtTime, fmtShortDate, fmtDuration } from '../../utils'
import { SubHeader, useEnrollBus } from './EnrollShell'

const JOB_COLS = '70px 0.7fr 0.8fr 1.1fr 0.8fr 1fr 1.1fr'
const FILTERS = [
  ['active', 'Đang chạy / lỗi'],
  ['running', 'Đang chạy'],
  ['failed', 'Lỗi'],
  ['pending', 'Chờ xử lý'],
  ['', 'Tất cả'],
]

export default function EnrollJobs() {
  const { bumpRefresh } = useEnrollBus()
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active')
  const [acting, setActing] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: 100 }
    if (filter && filter !== 'active') params.status = filter
    getEnrollJobs(params)
      .then(r => {
        let rows = r.data
        if (filter === 'active') rows = rows.filter(j => j.status === 'running' || j.status === 'failed')
        setItems(rows)
      })
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => { load() }, [filter])

  function doRetry(id) {
    setActing(id)
    retryJob(id).then(() => { load(); bumpRefresh() }).finally(() => setActing(null))
  }
  function doCancel(id) {
    setActing(id)
    cancelJob(id).then(() => { load(); bumpRefresh() }).finally(() => setActing(null))
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SubHeader title="Tác vụ" sub="Theo dõi job đang chạy / lỗi và chạy lại khi cần" right={
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: 3 }}>
            {FILTERS.map(([v, l]) => (
              <span key={v} onClick={() => setFilter(v)} style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: filter === v ? 'var(--bg3)' : 'transparent', color: filter === v ? 'var(--thi)' : 'var(--tlo)' }}>{l}</span>
            ))}
          </div>
          <Btn variant="ghost" onClick={load}><Icon name="refresh" size={13} />Làm mới</Btn>
        </div>
      } />

      {loading ? (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
      ) : !items.length ? (
        <Empty message="Không có tác vụ nào khớp bộ lọc" />
      ) : (
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: JOB_COLS, gap: 10, padding: '11px 16px', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.8px', color: 'var(--txl)', textTransform: 'uppercase', borderBottom: '1px solid var(--bg2)' }}>
            <div>Job ID</div><div>Chiều</div><div>Phòng</div><div>Trạng thái</div><div>Thời lượng</div><div>Lúc</div><div>Thao tác</div>
          </div>
          {items.map(j => {
            const [sk, sl] = STATUS[j.status] ?? ['dim', j.status]
            const dur = fmtDuration(j.started_at, j.finished_at)
            const canRetry = j.status === 'failed' || j.status === 'skipped'
            const canCancel = j.status === 'pending'
            return (
              <div key={j.id} style={{ display: 'grid', gridTemplateColumns: JOB_COLS, gap: 10, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--bg1)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--tmd)' }}>#{j.id}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: j.direction === 'incoming' ? 'var(--in)' : 'var(--out)' }}>{j.direction === 'incoming' ? '↓ Vào' : '↑ Ra'}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tmd)' }}>{j.room_label}</div>
                <div><Badge kind={sk}>{sl}</Badge></div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tlo)' }}>{dur}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>{fmtShortDate(j.event_time_vn)} {fmtTime(j.event_time_vn)}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {canRetry && <span onClick={() => acting !== j.id && doRetry(j.id)} style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--in3)', color: 'var(--in)', cursor: 'pointer' }}>{acting === j.id ? '…' : '↺ Chạy lại'}</span>}
                  {canCancel && <span onClick={() => acting !== j.id && doCancel(j.id)} style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--ln)', color: 'var(--tlo)', cursor: 'pointer' }}>Huỷ</span>}
                  {j.last_error && <span title={j.last_error} style={{ fontSize: 10.5, color: 'var(--alm)', cursor: 'help', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{j.last_error}</span>}
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
