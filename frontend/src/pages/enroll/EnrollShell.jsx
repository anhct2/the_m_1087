import { useState, useEffect } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { Icon, Btn } from '../../components/UI'
import { getEnrollSummary, getEnrollQueue, getWorkerStatus, postBackfill, postReleaseStuck, postMergeRoomProfiles } from '../../api/client'

/**
 * Khung Enroll: chỉ cung cấp "bus làm mới" cho các màn con qua context.
 * KHÔNG render header dùng chung — mỗi màn con tự thiết kế header của mình.
 * Riêng màn Phiên nhận diện dùng <EnrollOverview/> (số liệu + hàng đợi + nút
 * thao tác) vì đó là nơi thông tin tổng quan này phù hợp nhất.
 */
export default function EnrollShell() {
  const [tick, setTick] = useState(0)
  const bumpRefresh = () => setTick(t => t + 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 54px)', minHeight: 0 }}>
      <Outlet context={{ refreshTick: tick, bumpRefresh }} />
    </div>
  )
}

export function useEnrollBus() {
  return useOutletContext() ?? { refreshTick: 0, bumpRefresh: () => {} }
}

/**
 * Header tổng quan cho màn Phiên nhận diện: metric cards + hàng đợi + 3 nút
 * thao tác (Nạp lại dữ liệu / Giải phóng job kẹt / Làm mới) — có phản hồi rõ
 * ràng khi bấm.
 */
export function EnrollOverview({ onRefresh }) {
  const [summary, setSummary] = useState(null)
  const [queue, setQueue]     = useState([])
  const [worker, setWorker]   = useState([])
  const [busy, setBusy]       = useState('')
  const [msg, setMsg]         = useState('')

  function loadHeader() {
    getEnrollSummary().then(r => setSummary(r.data)).catch(() => {})
    getEnrollQueue().then(r => setQueue(r.data)).catch(() => {})
    getWorkerStatus().then(r => setWorker(r.data)).catch(() => {})
  }
  useEffect(() => { loadHeader() }, [])

  function doBackfill() {
    setBusy('backfill'); setMsg('')
    postBackfill({ days: 1 })
      .then(r => setMsg(`Đã nạp ${r.data.enqueued ?? 0} phiên vào hàng đợi (tìm thấy ${r.data.total_found ?? 0})`))
      .catch(e => setMsg('Lỗi nạp dữ liệu: ' + (e?.response?.data?.detail || e.message)))
      .finally(() => { setBusy(''); loadHeader(); onRefresh?.() })
  }
  function doRelease() {
    setBusy('release'); setMsg('')
    postReleaseStuck()
      .then(r => setMsg(`Đã giải phóng ${r.data.jobs_reset ?? 0} job, đặt ${r.data.sessions_reset ?? 0} phiên về lỗi`))
      .catch(e => setMsg('Lỗi giải phóng: ' + (e?.response?.data?.detail || e.message)))
      .finally(() => { setBusy(''); loadHeader(); onRefresh?.() })
  }
  // Job gộp profile theo phòng + cụm cửa sổ thời gian (worker cũng tự chạy định kỳ)
  function doMergeRoom() {
    setBusy('merge'); setMsg('')
    postMergeRoomProfiles({ days: 7 })
      .then(r => setMsg(`Đã gộp ${r.data.merged ?? 0} cặp hồ sơ trùng (theo phòng + cụm thời gian)`))
      .catch(e => setMsg('Lỗi gộp hồ sơ: ' + (e?.response?.data?.detail || e.message)))
      .finally(() => { setBusy(''); loadHeader(); onRefresh?.() })
  }
  function doRefresh() {
    setBusy('refresh'); setMsg('')
    loadHeader(); onRefresh?.()
    setTimeout(() => { setBusy(''); setMsg('Đã làm mới') }, 300)
  }

  const metrics = summary ? [
    { label: 'Phiên 24h',       value: String(summary.sessions_24h ?? 0) },
    { label: 'Đã nhận diện 24h', value: String(summary.enrolled_24h ?? 0), valueColor: 'var(--in)' },
    { label: 'Lỗi 24h',         value: String(summary.failed_24h ?? 0), valueColor: 'var(--alm)' },
    { label: 'Hồ sơ',           value: String(summary.total_profiles ?? 0) },
    { label: 'Phòng có khách',  value: String(summary.rooms_occupied ?? 0), valueColor: 'var(--te)' },
    { label: 'Chất lượng TB',   value: summary.avg_quality_24h != null ? `${Math.round(summary.avg_quality_24h * 100)}%` : '—' },
  ] : Array(6).fill({ label: '…', value: '—' })

  const queueDots = [
    { label: 'chờ xử lý', value: queue.find(q => q.status === 'pending')?.cnt ?? 0, dot: 'var(--am)' },
    { label: 'đang chạy', value: queue.find(q => q.status === 'running')?.cnt ?? 0, dot: 'var(--out)' },
    { label: 'lỗi',       value: queue.find(q => q.status === 'failed')?.cnt ?? 0,  dot: 'var(--alm)' },
  ]
  const workerInfo = worker[0]
  const workerOk = workerInfo && workerInfo.seconds_ago < 120

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>Phiên nhận diện</h1>
          <div style={{ fontSize: 12.5, color: 'var(--tlo)', marginTop: 4 }}>Danh sách phiên khớp 1-1 với Gate Log · quản lý hàng đợi xử lý</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {msg && <span style={{ fontSize: 11.5, color: 'var(--tlo)' }}>{msg}</span>}
          <Btn variant="ghost" onClick={doBackfill} disabled={!!busy}><Icon name="refresh" size={13} />{busy === 'backfill' ? 'Đang nạp…' : 'Nạp lại 1 ngày'}</Btn>
          <Btn variant="ghost" onClick={doMergeRoom} disabled={!!busy}><Icon name="refresh" size={13} />{busy === 'merge' ? 'Đang gộp…' : 'Gộp hồ sơ trùng'}</Btn>
          <Btn variant="ghost" onClick={doRelease} disabled={!!busy}><Icon name="refresh" size={13} />{busy === 'release' ? 'Đang xử lý…' : 'Giải phóng job kẹt'}</Btn>
          <Btn variant="ghost" onClick={doRefresh} disabled={!!busy}><Icon name="refresh" size={13} />Làm mới</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 11, padding: '14px 15px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--tlo)' }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600, marginTop: 8, letterSpacing: '-0.5px', color: m.valueColor || 'var(--thi)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 11, padding: '12px 18px', marginBottom: 16, flexWrap: 'wrap' }}>
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
    </div>
  )
}

// Header đơn giản cho các màn con khác (tiêu đề + mô tả + chỗ để filter/actions)
export function SubHeader({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
      <div>
        <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--tlo)', marginTop: 4 }}>{sub}</div>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}
