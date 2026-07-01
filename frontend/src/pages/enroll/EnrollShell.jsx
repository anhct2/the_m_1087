import { useState, useEffect } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { Icon, Btn } from '../../components/UI'
import { getEnrollSummary, getEnrollQueue, getWorkerStatus, postBackfill, postReleaseStuck } from '../../api/client'

// Mỗi sub-screen của Enroll (Sessions/Review/Duplicates/Profiles/Occupancy/Jobs)
// nằm ở route con của /enroll (xem AppShell ENROLL_SUBNAV + App.jsx) và dùng
// chung header/metrics/queue-strip ở đây. Lấy reloadHeader() qua useOutletContext()
// để làm mới số liệu sau khi assign/backfill/retry.
export default function EnrollShell() {
  const [summary, setSummary] = useState(null)
  const [queue, setQueue]     = useState([])
  const [worker, setWorker]   = useState([])

  function loadHeader() {
    getEnrollSummary().then(r => setSummary(r.data)).catch(() => {})
    getEnrollQueue().then(r => setQueue(r.data)).catch(() => {})
    getWorkerStatus().then(r => setWorker(r.data)).catch(() => {})
  }

  useEffect(() => { loadHeader() }, [])

  const metrics = summary ? [
    { label: 'Sessions 24h',    value: String(summary.sessions_24h ?? 0),  valueColor: '' },
    { label: 'Enrolled 24h',    value: String(summary.enrolled_24h ?? 0),  valueColor: 'var(--in)' },
    { label: 'Failed 24h',      value: String(summary.failed_24h ?? 0),    valueColor: 'var(--alm)' },
    { label: 'Profiles',        value: String(summary.total_profiles ?? 0), valueColor: '' },
    { label: 'Phòng có khách',  value: String(summary.rooms_occupied ?? 0), valueColor: 'var(--te)' },
    { label: 'Avg quality',     value: summary.avg_quality_24h != null ? `${Math.round(summary.avg_quality_24h * 100)}%` : '—', valueColor: '' },
  ] : Array(6).fill({ label: '…', value: '—' })

  const queueDots = [
    { label: 'pending', value: queue.find(q => q.status === 'pending')?.cnt ?? 0, dot: 'var(--am)' },
    { label: 'running', value: queue.find(q => q.status === 'running')?.cnt ?? 0, dot: 'var(--out)' },
    { label: 'failed',  value: queue.find(q => q.status === 'failed')?.cnt ?? 0,  dot: 'var(--alm)' },
  ]

  const workerInfo = worker[0]
  const workerOk = workerInfo && workerInfo.seconds_ago < 120

  return (
    <div style={{ padding: '20px 24px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>Enroll · Nhận diện khuôn mặt</h1>
          <div style={{ fontSize: 12.5, color: 'var(--tlo)', marginTop: 4 }}>Quản lý phiên enroll, profile khách và hàng đợi xử lý</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={() => postBackfill({ days: 1 }).then(loadHeader)}><Icon name="refresh" size={13} />Backfill 1d</Btn>
          <Btn variant="ghost" onClick={() => { postReleaseStuck().then(loadHeader) }}><Icon name="refresh" size={13} />Release stuck</Btn>
          <Btn variant="ghost" onClick={loadHeader}><Icon name="refresh" size={13} />Làm mới</Btn>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 12 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 11, padding: '14px 15px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--tlo)' }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600, marginTop: 8, letterSpacing: '-0.5px', color: m.valueColor || 'var(--thi)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Queue strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 11, padding: '12px 18px', marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tmd)' }}>Hàng đợi xử lý</span>
        {queueDots.map(q => (
          <span key={q.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--tmd)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: q.dot }} />{q.label} <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--thi)' }}>{q.value}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: workerOk ? 'var(--in)' : 'var(--alm)' }}>
          {workerInfo
            ? `Worker ${workerInfo.worker_id} · ${workerOk ? 'hoạt động' : `offline ${workerInfo.seconds_ago}s`}`
            : 'Worker — không có dữ liệu'}
        </span>
      </div>

      <Outlet context={{ reloadHeader: loadHeader }} />
    </div>
  )
}

export function useEnrollHeader() {
  return useOutletContext()
}
