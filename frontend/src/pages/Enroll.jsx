import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Badge, Icon, SimBar, Avatar, Modal, Btn, color4, Spinner, Empty } from '../components/UI'
import {
  STATUS, CONF, CAM_COLORS, simColor,
} from './enrollData'
import {
  getEnrollSummary, getEnrollQueue, getEnrollSessions, getEnrollSession,
  getEnrollProfiles, getOccupancy, getEnrollJobs,
  assignSession, searchProfiles, postBackfill, postReleaseStuck, getWorkerStatus,
  retrySession, getEnrollReview, getDuplicates, dismissCluster,
} from '../api/client'
import { fmtTime, fmtShortDate, timeAgo, fmtDuration, snapUrl } from '../utils'

const TABS = [
  { id: 'sessions',  label: 'Sessions' },
  { id: 'review',    label: 'Cần xử lý' },
  { id: 'dup',       label: 'Trùng lặp' },
  { id: 'profiles',  label: 'Profiles' },
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'jobs',      label: 'Jobs' },
]

const RoomTag = ({ children }) => <Badge kind="teal">{children}</Badge>

export default function Enroll() {
  const [tab, setTab]         = useState('sessions')
  const [drawer, setDrawer]   = useState(null)   // session id
  const [assign, setAssign]   = useState(null)   // session id for assign
  const [summary, setSummary] = useState(null)
  const [queue, setQueue]     = useState([])
  const [worker, setWorker]   = useState([])
  const navigate = useNavigate()

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'oklch(0.17 0.006 255)', border: '1px solid var(--ln)', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 15px', borderRadius: 8, fontSize: 12.5, fontWeight: active ? 600 : 500, fontFamily: 'inherit', border: 'none', cursor: 'pointer', background: active ? 'var(--inb)' : 'transparent', color: active ? 'oklch(0.85 0.11 152)' : 'var(--tlo)' }}>
              {t.label}
              {t.note && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txl)', background: 'var(--bg2)', borderRadius: 20, padding: '1px 6px', marginLeft: 5 }}>TODO</span>}
            </button>
          )
        })}
      </div>

      {tab === 'sessions'  && <SessionsTab onOpen={id => setDrawer(id)} onAssign={id => setAssign(id)} />}
      {tab === 'review'    && <ReviewTab onOpen={id => setDrawer(id)} onAssign={id => setAssign(id)} />}
      {tab === 'dup'       && <DupTab onMerge={id => navigate(`/enroll/merge/${id}`)} />}
      {tab === 'profiles'  && <ProfilesTab onOpen={p => navigate(`/enroll/profiles/${p.id}`)} />}
      {tab === 'occupancy' && <OccupancyTab />}
      {tab === 'jobs'      && <JobsTab onRefresh={loadHeader} />}

      {drawer != null && <SessionDrawer id={drawer} onClose={() => setDrawer(null)} onAssign={id => { setDrawer(null); setAssign(id) }} onRetry={() => { setDrawer(null); loadHeader() }} />}
      {assign != null && <AssignModal sessionId={assign} onClose={() => { setAssign(null); loadHeader() }} />}
    </div>
  )
}

/* ── Review tab ─────────────────────────────────────────────── */
const REV_COLS = '44px 1.4fr 0.7fr 1.1fr 0.7fr 2fr 0.8fr'
const PAGE_REV = 20

function ReviewTab({ onOpen, onAssign }) {
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [offset, setOffset] = useState(0)
  const [days, setDays]     = useState(7)
  const [loading, setLoading] = useState(true)

  function load(off = 0, d = days) {
    setLoading(true)
    getEnrollReview({ limit: PAGE_REV, offset: off, days: d })
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setOffset(off) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(0) }, [])

  if (loading && !items.length) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--tlo)' }}>Hiển thị {days} ngày gần nhất:</span>
        {[7, 14, 30].map(d => (
          <span key={d} onClick={() => { setDays(d); load(0, d) }}
            style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--ln)', background: days === d ? 'var(--inb)' : 'var(--bg1)', color: days === d ? 'oklch(0.85 0.11 152)' : 'var(--tlo)' }}>
            {d}d
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{total} sessions cần xử lý</span>
      </div>
      {items.length === 0 ? (
        <Empty message="Không có session nào cần xử lý" />
      ) : (
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: REV_COLS, gap: 10, padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.8px', color: 'var(--txl)', textTransform: 'uppercase', borderBottom: '1px solid var(--bg2)' }}>
            <div>Snap</div><div>Thời gian</div><div>Phòng</div><div>Trạng thái</div><div>Chiều</div><div>Lý do</div><div>Quality</div>
          </div>
          {items.map(r => {
            const [sk, sl] = STATUS[r.status] ?? ['dim', r.status]
            const isIn = r.direction === 'incoming'
            const reason = r.error_msg
              ? r.error_msg.slice(0, 60)
              : r.recognized_person_id == null
              ? 'enrolled nhưng không có profile'
              : '—'
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: REV_COLS, gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--bg1)' }}>
                <Avatar gender={null} size={34} src={snapUrl(r.snap_event_id)} />
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tmd)' }}>{fmtTime(r.event_time_vn)} · {fmtShortDate(r.event_time_vn)}</div>
                <div><Badge kind="teal">{r.room_label}</Badge></div>
                <div><Badge kind={sk}>{sl}</Badge></div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: isIn ? 'var(--in)' : 'var(--out)' }}>{isIn ? '↓ Vào' : '↑ Ra'}</div>
                <div style={{ fontSize: 11, color: 'var(--txl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span onClick={() => onOpen(r.id)} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--ln)', color: 'var(--tmd)', cursor: 'pointer' }}>Xem</span>
                  <span onClick={() => onAssign(r.id)} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--ln2)', color: 'var(--in)', cursor: 'pointer' }}>Gán</span>
                </div>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: '1px solid var(--bg2)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)' }}>{offset + 1}–{Math.min(offset + PAGE_REV, total)} / {total}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span onClick={() => offset > 0 && load(offset - PAGE_REV)} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln)', color: offset > 0 ? 'var(--tmd)' : 'var(--txl)', cursor: offset > 0 ? 'pointer' : 'default' }}>← Trước</span>
              <span onClick={() => offset + PAGE_REV < total && load(offset + PAGE_REV)} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln2)', color: offset + PAGE_REV < total ? 'var(--tmd)' : 'var(--txl)', cursor: offset + PAGE_REV < total ? 'pointer' : 'default' }}>Sau →</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ── Duplicates tab ──────────────────────────────────────────── */
function DupTab({ onMerge }) {
  const [clusters, setClusters] = useState([])
  const [loading, setLoading]   = useState(true)

  function load() {
    setLoading(true)
    getDuplicates().then(r => setClusters(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function handleDismiss(cluster) {
    const memberIds = cluster.members.slice(1).map(m => m.id)
    dismissCluster(cluster.cluster_id, { member_ids: memberIds })
      .then(() => setClusters(cs => cs.filter(c => c.cluster_id !== cluster.cluster_id)))
  }

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
  if (!clusters.length) return <Empty message="Không phát hiện profile trùng lặp" />

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--tlo)', marginBottom: 14 }}>
        {clusters.length} cluster trùng lặp · threshold cosine similarity ≥ 0.82
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {clusters.map(cluster => {
          const [a, b] = cluster.members
          return (
            <div key={cluster.cluster_id} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 13, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--am)' }}>{Math.round(cluster.max_similarity * 100)}%</span>
                  <span style={{ fontSize: 10.5, color: 'var(--tlo)' }}>similarity · {cluster.members.length} profiles</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                {[a, b].map((m, i) => m && (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderRadius: 10, border: '1px solid var(--ln)', padding: '12px 8px' }}>
                    <Avatar gender={m.gender} size={48} src={snapUrl(m.face_event_id)} />
                    <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'center' }}>{m.display_name || '—'}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--tlo)' }}>{m.known_room || '—'}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txl)' }}>×{m.enroll_count} enrolls</div>
                    {i === 1 && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)' }}>{Math.round(m.similarity * 100)}% sim</div>}
                  </div>
                ))}
                {cluster.members.length > 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px dashed var(--ln)', padding: '12px 8px', minWidth: 52, color: 'var(--txl)', fontSize: 11 }}>
                    +{cluster.members.length - 2}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" style={{ flex: 1, fontSize: 11.5 }} onClick={() => handleDismiss(cluster)}>Bỏ qua</Btn>
                <Btn variant="primary" style={{ flex: 1, fontSize: 11.5 }} onClick={() => onMerge(cluster.cluster_id)}>Xem / Gộp</Btn>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Sessions ─────────────────────────────────────────────── */
const SES_COLS = '52px 1.3fr 0.7fr 1.2fr 0.7fr 1.6fr 1fr 0.7fr'
const PAGE = 20

function SessionsTab({ onOpen, onAssign }) {
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  function load(off = 0) {
    setLoading(true)
    getEnrollSessions({ limit: PAGE, offset: off })
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setOffset(off) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(0) }, [])

  const totalPages  = Math.ceil(total / PAGE)
  const currentPage = Math.floor(offset / PAGE) + 1

  if (loading && !items.length) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>

  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: SES_COLS, gap: 10, padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.8px', color: 'var(--txl)', textTransform: 'uppercase', borderBottom: '1px solid var(--bg2)' }}>
        <div>Snap</div><div>Thời gian</div><div>Phòng</div><div>Trạng thái</div><div>Chiều</div><div>Người / Nhận diện</div><div>Quality</div><div>ms</div>
      </div>
      {items.map(r => {
        const [sk, sl] = STATUS[r.status] ?? ['dim', r.status]
        const isIn = r.direction === 'incoming'
        const hasRecog = r.recognized_person_id != null
        const simPct = r.recognition_sim != null ? Math.round(r.recognition_sim * 100) : null
        const kind = hasRecog ? 'recog' : (r.person_count > 1 ? 'group' : 'dim')
        const who = hasRecog
          ? r.recognized_name || `#${r.recognized_person_id}`
          : r.person_count > 1
          ? `${r.persons_enrolled ?? 0} / ${r.person_count} người`
          : 'Chưa nhận diện'
        const thumbSrc = snapUrl(r.snap_event_id)
        return (
          <div key={r.id} onClick={() => onOpen(r.id)} style={{ display: 'grid', gridTemplateColumns: SES_COLS, gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--bg1)', cursor: 'pointer' }}>
            <Avatar gender={r.recognized_gender} size={34} src={thumbSrc} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tmd)' }}>{fmtTime(r.event_time_vn)} · {fmtShortDate(r.event_time_vn)}</div>
            <div><Badge kind="teal">{r.room_label}</Badge></div>
            <div><Badge kind={sk}>{sl}</Badge></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: isIn ? 'var(--in)' : 'var(--out)' }}>{isIn ? '↓ Vào' : '↑ Ra'}</div>
            <div style={{ minWidth: 0 }}>
              {kind === 'recog' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <Avatar gender={r.recognized_gender} size={24} />
                  <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
                  {simPct != null && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--in)' }}>{simPct}%</span>}
                </span>
              ) : <Badge kind={kind === 'group' ? 'green' : 'dim'}>{who}</Badge>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SimBar value={r.overall_quality ?? 0} width={60} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tlo)', minWidth: 26 }}>{r.overall_quality > 0 ? r.overall_quality.toFixed(2) : '—'}</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{r.total_ms ? `${r.total_ms}ms` : '—'}</div>
          </div>
        )
      })}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: '1px solid var(--bg2)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)' }}>{offset + 1}–{Math.min(offset + PAGE, total)} / {total} sessions</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span onClick={() => offset > 0 && load(offset - PAGE)} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln)', color: offset > 0 ? 'var(--tmd)' : 'var(--txl)', cursor: offset > 0 ? 'pointer' : 'default' }}>← Trước</span>
          <span onClick={() => offset + PAGE < total && load(offset + PAGE)} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln2)', color: offset + PAGE < total ? 'var(--tmd)' : 'var(--txl)', cursor: offset + PAGE < total ? 'pointer' : 'default' }}>Sau →</span>
        </div>
      </div>
    </Card>
  )
}

/* ── Profiles ─────────────────────────────────────────────── */
function ProfilesTab({ onOpen }) {
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
          <div key={p.id} onClick={() => onOpen(p)} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
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

/* ── Occupancy ────────────────────────────────────────────── */
function OccupancyTab() {
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOccupancy()
      .then(r => setRows(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>

  // Group by room_id
  const roomMap = {}
  rows.forEach(r => {
    if (!roomMap[r.room_id]) roomMap[r.room_id] = []
    roomMap[r.room_id].push(r)
  })

  const floors = [2, 3, 4, 5, 6, 7]
  const durText = h => h < 1 ? `${Math.round(h * 60)}m` : `${Number(h).toFixed(1)}h`
  const durColor = h => h > 8 ? 'var(--alm)' : h > 4 ? 'var(--am)' : 'var(--in)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {floors.map(f => (
        <div key={f} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 12, alignItems: 'start' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--tlo)', paddingTop: 14 }}>Tầng {f}</div>
          {[`P.${f}01`, `P.${f}02`].map(rk => {
            const g = roomMap[rk] || []
            return (
              <div key={rk} style={{ borderRadius: 11, padding: 13, border: `1px solid ${g.length ? 'var(--in3)' : 'var(--ln)'}`, background: g.length ? 'oklch(0.2 0.02 152 / 0.28)' : 'oklch(0.175 0.006 255)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{rk}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: g.length ? 'oklch(0.8 0.12 152)' : 'var(--txl)' }}>{g.length ? `${g.length} người` : 'trống'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {g.map((gu, gi) => {
                    const hrs = Number(gu.hours_in_room ?? 0)
                    const entryTime = gu.entry_ts ? fmtTime(gu.entry_ts) : '—'
                    return (
                      <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar gender={gu.gender} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gu.display_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                            <div style={{ flex: 1, maxWidth: 120, height: 5, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, (hrs / 12) * 100)}%`, background: durColor(hrs) }} />
                            </div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tmd)' }}>{durText(hrs)}</span>
                            <span style={{ fontSize: 10, color: 'var(--txl)' }}>vào {entryTime}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ── Jobs ─────────────────────────────────────────────────── */
const JOB_COLS = '1fr 0.8fr 0.8fr 1.2fr 0.8fr 1fr'

function JobsTab({ onRefresh }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    getEnrollJobs({ limit: 50 })
      .then(r => setItems(r.data))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

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

/* ── Session drawer ───────────────────────────────────────── */
function SessionDrawer({ id, onClose, onAssign, onRetry }) {
  const [s, setS]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getEnrollSession(id)
      .then(r => setS(r.data))
      .finally(() => setLoading(false))
  }, [id])

  if (!s && loading) return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.08 0.005 255 / 0.55)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '92%', background: 'oklch(0.175 0.006 255)', borderLeft: '1px solid var(--ln2)', zIndex: 41, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={24} />
      </div>
    </>
  )
  if (!s) return null

  const [sk, sl] = STATUS[s.status] ?? ['dim', s.status]
  const isIn = s.direction === 'incoming'
  const cams = (s.camera_clips ?? []).sort((a, b) => a.camera_order - b.camera_order)
  const who = s.recognized_name || (s.person_count > 1 ? `${s.persons_enrolled}/${s.person_count} người` : 'Chưa nhận diện')
  const gender = s.recognized_gender || ''

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.08 0.005 255 / 0.55)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '92%', background: 'oklch(0.175 0.006 255)', borderLeft: '1px solid var(--ln2)', zIndex: 41, display: 'flex', flexDirection: 'column', boxShadow: '-16px 0 40px oklch(0 0 0 / 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--bg2)' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Chi tiết session</span>
          <Badge kind={sk}>{sl}</Badge><Badge kind="teal">{s.room_label}</Badge>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <Avatar gender={gender} size={52} src={snapUrl(s.snap_event_id)} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{who}</div>
              <div style={{ fontSize: 12, color: 'var(--tlo)', marginTop: 3, fontFamily: 'var(--mono)' }}>{isIn ? '↓ Vào' : '↑ Ra'} · {fmtTime(s.event_time_vn)} · {fmtShortDate(s.event_time_vn)}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {[
              ['Overall quality', s.overall_quality > 0 ? s.overall_quality.toFixed(2) : '—', 'var(--in)'],
              ['Người nhận diện', s.person_count ?? '—', ''],
              ['Dừng ở cam', s.stopped_at_cam || '—', ''],
              ['Thời gian xử lý', s.total_ms ? `${s.total_ms}ms` : '—', ''],
            ].map(([k, v, c], i) => (
              <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--ln)', borderRadius: 9, padding: '11px 13px' }}>
                <div style={{ fontSize: 10.5, color: 'var(--tlo)' }}>{k}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: i === 0 ? 16 : 13, fontWeight: 600, marginTop: i === 0 ? 4 : 6, color: c || 'var(--thi)' }}>{v}</div>
              </div>
            ))}
          </div>
          {cams.length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', marginBottom: 10 }}>Kết quả từng camera</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cams.length, 3)},1fr)`, gap: 10, marginBottom: 20 }}>
                {cams.slice(0, 3).map((cam, ci) => (
                  <div key={ci}>
                    <div style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 9, overflow: 'hidden', border: `1px solid ${cam.stopped_here ? 'var(--in3)' : 'var(--ln)'}`, background: `linear-gradient(135deg, ${CAM_COLORS[cam.camera_id] || 'oklch(0.28 0.02 255)'}, oklch(0.15 0.01 255))` }}>
                      {cam.frigate_event_id && (
                        <img src={snapUrl(cam.frigate_event_id)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      <span style={{ position: 'absolute', top: 8, left: 9, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'oklch(0.95 0.005 255)', background: 'oklch(0 0 0 / 0.4)', padding: '1px 4px', borderRadius: 3 }}>{cam.camera_id}</span>
                      {cam.stopped_here && <span style={{ position: 'absolute', bottom: 6, right: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--in)', background: 'oklch(0 0 0 / 0.5)', padding: '1px 4px', borderRadius: 3 }}>STOP</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <SimBar value={cam.confidence ?? 0} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tlo)' }}>{cam.confidence?.toFixed(2) ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="primary" onClick={() => onAssign(id)} style={{ flex: 1 }}>＋ Gán người</Btn>
            <Btn variant="ghost" onClick={() => retrySession(id).then(onRetry)}>↺ Retry</Btn>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Assign modal ─────────────────────────────────────────── */
function AssignModal({ sessionId, onClose }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [newName, setNewName] = useState('')
  const [newRoom, setNewRoom] = useState('')

  useEffect(() => {
    setLoading(true)
    searchProfiles(query)
      .then(r => setResults(r.data))
      .finally(() => setLoading(false))
  }, [query])

  function doAssign(profileId) {
    setSaving(true)
    assignSession(sessionId, { profile_id: profileId })
      .then(onClose)
      .finally(() => setSaving(false))
  }

  function doCreate() {
    if (!newName.trim()) return
    setSaving(true)
    assignSession(sessionId, { display_name: newName.trim(), known_room: newRoom.trim() })
      .then(onClose)
      .finally(() => setSaving(false))
  }

  return (
    <Modal onClose={onClose} width={440} align="top">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--ln)' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Gán người vào session</span>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={13} /></button>
      </div>
      <div style={{ padding: '16px 18px' }}>
        {/* Search existing */}
        <div style={{ fontSize: 11, color: 'var(--txl)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)', marginBottom: 8 }}>Tìm hồ sơ</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 9, padding: '0 12px', height: 40, marginBottom: 10 }}>
          <Icon name="search" size={15} style={{ color: 'var(--tlo)' }} />
          <input
            placeholder="Tìm theo tên hoặc phòng…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--thi)', fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
          {loading ? <div style={{ padding: 12, textAlign: 'center' }}><Spinner size={14} /></div>
            : results.map(p => {
              const [ck, cl] = CONF[p.confidence_lvl] ?? ['dim', 'unknown']
              return (
                <div key={p.id} onClick={() => doAssign(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, cursor: 'pointer' }}>
                  <Avatar gender={p.gender} size={34} src={snapUrl(p.face_event_id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.display_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--tlo)', fontFamily: 'var(--mono)' }}>{p.known_room}</div>
                  </div>
                  <Badge kind={ck}>{cl}</Badge>
                </div>
              )
            })
          }
        </div>

        {/* Create new */}
        <div style={{ borderTop: '1px solid var(--bg2)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--txl)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)', marginBottom: 8 }}>Tạo người mới</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Tên…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ flex: 2, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '7px 10px', color: 'var(--thi)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
            />
            <input
              placeholder="Phòng (P.301)…"
              value={newRoom}
              onChange={e => setNewRoom(e.target.value)}
              style={{ flex: 1, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '7px 10px', color: 'var(--thi)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
            />
          </div>
          <Btn variant="ghost" onClick={doCreate} disabled={saving || !newName.trim()} style={{ width: '100%', marginTop: 8 }}>
            {saving ? '…' : '＋ Tạo & gán'}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
