import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getEnrollSummary, getEnrollQueue, getEnrollSessions,
  getEnrollSession, getEnrollProfiles, patchEnrollProfile,
  getOccupancy, getEnrollJobs, postBackfill, cancelJob, retryJob,
  retrySession, assignSession, searchProfiles,
} from '../api/client'
import { Icon, Spinner, Empty, Lightbox } from '../components/UI'
import s from './Enroll.module.css'

// ── Helpers ───────────────────────────────────────────────────────
const fmtDt = (v) =>
  v ? new Date(v).toLocaleString('vi-VN', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
  }) : '—'
const fmtPct = (v) => (v != null ? `${(v * 100).toFixed(0)}%` : '—')
const fmtMs  = (v) => (v != null ? `${v}ms` : '—')
const fmtHr  = (v) => (v != null ? `${Number(v).toFixed(1)}h` : '—')

const STATUS_META = {
  enrolled:     { icon: '✓', label: 'enrolled',     cls: s.stEnrolled },
  low_quality:  { icon: '⚠', label: 'low quality',  cls: s.stLowQ },
  no_detection: { icon: '–', label: 'no detection', cls: s.stNone },
  failed:       { icon: '✕', label: 'failed',       cls: s.stFailed },
  processing:   { icon: '…', label: 'processing',   cls: s.stRunning },
  running:      { icon: '…', label: 'running',      cls: s.stRunning },
  done:         { icon: '✓', label: 'done',         cls: s.stEnrolled },
  pending:      { icon: '○', label: 'pending',      cls: s.stNone },
  skipped:      { icon: '–', label: 'skipped',      cls: s.stNone },
}
const ROW_CLS = {
  enrolled:   s.rowEnrolled,
  done:       s.rowEnrolled,
  failed:     s.rowFailed,
  low_quality:s.rowLowQ,
  processing: s.rowRunning,
  running:    s.rowRunning,
}
const CONF_META = {
  gate_code:       { cls: s.stEnrolled, label: 'gate code',   color: '#22c55e' },
  camera_chain:    { cls: s.stTeal,     label: 'camera',      color: '#0d9488' },
  appearance_only: { cls: s.stLowQ,     label: 'appearance',  color: '#f59e0b' },
  unknown:         { cls: s.stNone,     label: 'unknown',     color: '#475569' },
}

// ── CamThumb ──────────────────────────────────────────────────────
const STATUS_COLOR = {
  enrolled: '#22c55e', low_quality: '#f59e0b', no_detection: '#475569',
  failed: '#ef4444', processing: '#60a5fa', done: '#22c55e',
}

function CamThumb({ camId, quality, status, eventId, width = 60, height = 42 }) {
  const c     = STATUS_COLOR[status] || '#475569'
  const q     = quality || 0
  const pct   = q > 0.01 ? `${Math.round(q * 100)}%` : status === 'processing' ? '…' : '—'
  const label = !camId || camId === '—' ? 'no-cam' : camId.length > 14 ? camId.slice(0, 14) : camId
  const snapSrc = eventId ? `/api/media/snapshot/${eventId}` : null
  const [lbOpen, setLbOpen] = useState(false)

  return (
    <div className={s.camThumb} style={{ width, height, border: `1px solid ${c}44` }}>
      {snapSrc ? (
        <img
          src={snapSrc}
          alt={camId}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1, cursor: 'zoom-in' }}
          onError={e => { e.currentTarget.style.display = 'none' }}
          onClick={e => { e.stopPropagation(); setLbOpen(true) }}
        />
      ) : (
        <>
          <div className={s.camScanline} />
          <svg className={s.camSilhouette} width={24} height={32} viewBox="0 0 44 60">
            <circle cx={22} cy={12} r={9} fill="#94a3b8" />
            <path d="M2 60 Q2 36 22 36 Q42 36 42 60" fill="#94a3b8" />
          </svg>
        </>
      )}
      <div className={s.camQChip} style={{ background: `${c}cc`, border: `1px solid ${c}`, color: '#fff', zIndex: 10 }}>
        {pct}
      </div>
      <div className={s.camLabel} style={{ zIndex: 10 }}>{label}</div>
      <div className={s.camRec} style={{ zIndex: 10 }} />
      {status === 'processing' && (
        <div className={s.camProcessing} style={{ zIndex: 11 }}>
          <div className={s.camSpinner} />
        </div>
      )}
      {lbOpen && snapSrc && <Lightbox src={snapSrc} onClose={() => setLbOpen(false)} />}
    </div>
  )
}

// ── FaceAvatar ────────────────────────────────────────────────────
function FaceAvatar({ gender, confidence, eventId, size = 36, noLightbox = false }) {
  const [imgErr, setImgErr] = useState(false)
  const [lbOpen, setLbOpen] = useState(false)
  const bc  = CONF_META[confidence]?.color || '#475569'
  const bg  = gender === 'female' ? '#501620' : gender === 'male' ? '#162850' : '#1a2030'
  const src = eventId && !imgErr ? `/api/media/snapshot/${eventId}` : null

  return (
    <div className={s.faceAvatar} style={{
      width: size, height: size,
      background: `radial-gradient(circle at 50% 62%, ${bg} 0%, #050810 100%)`,
      border: `2px solid ${bc}55`,
      boxShadow: `0 0 0 2px ${bc}1a, 0 2px 8px rgba(0,0,0,.6)`,
      cursor: src && !noLightbox ? 'zoom-in' : undefined,
    }}
      onClick={src && !noLightbox ? e => { e.stopPropagation(); setLbOpen(true) } : undefined}
    >
      {src
        ? <img src={src} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center', borderRadius:'50%' }}
            onError={() => setImgErr(true)} />
        : <svg className={s.faceAvatarSvg} width={size} height={size * 1.15} viewBox="0 0 100 115">
            <ellipse cx={50} cy={34} rx={21} ry={25} fill="#c8bdb0" />
            <path d="M5 115 Q5 68 50 68 Q95 68 95 115" fill="#c8bdb0" />
          </svg>
      }
      {lbOpen && src && <Lightbox src={src} onClose={() => setLbOpen(false)} />}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { icon: '?', label: status, cls: s.stNone }
  return <span className={`${s.badge} ${m.cls}`}>{m.icon} {m.label}</span>
}

// ── Score bar ─────────────────────────────────────────────────────
function ScoreBar({ value, label }) {
  const pct = Math.min(100, ((value || 0)) * 100)
  const cls = pct >= 70 ? s.barGreen : pct >= 45 ? s.barAmber : s.barRed
  return (
    <div className={s.barWrap}>
      {label && <span className={s.barLabel}>{label}</span>}
      <div className={s.barTrack}>
        <div className={`${s.barFill} ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.barVal}>{value != null ? value.toFixed(2) : '—'}</span>
    </div>
  )
}

// ── Metric Cards ──────────────────────────────────────────────────
function MetricCards({ summary, queue }) {
  const pending = queue.find(q => q.status === 'pending')?.cnt || 0
  const running = queue.find(q => q.status === 'running')?.cnt || 0
  const failed  = queue.find(q => q.status === 'failed')?.cnt  || 0

  const cards = [
    { label: 'Sessions 24h',   val: summary.sessions_24h },
    { label: 'Enrolled 24h',   val: summary.enrolled_24h,  hi: 'green' },
    { label: 'Failed 24h',     val: summary.failed_24h,    hi: summary.failed_24h > 0 ? 'red' : null },
    { label: 'Profiles',       val: summary.total_profiles },
    { label: 'Phòng có khách', val: `${summary.rooms_occupied || 0}/12`, hi: summary.rooms_occupied > 0 ? 'teal' : null },
    { label: 'Avg quality',    val: fmtPct(summary.avg_quality_24h) },
    { label: 'Jobs pending',   val: pending, hi: pending > 0 ? 'amber' : null },
    { label: 'Jobs running',   val: running, hi: running > 0 ? 'blue' : null },
    { label: 'Jobs failed',    val: failed,  hi: failed > 0  ? 'red'  : null },
  ]
  return (
    <div className={s.metricsGrid}>
      {cards.map(c => (
        <div key={c.label} className={s.metricCard}>
          <div className={s.metricLabel}>{c.label}</div>
          <div className={`${s.metricVal} ${c.hi ? s[`hi_${c.hi}`] : ''}`}>
            {c.val ?? '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Assign Modal ──────────────────────────────────────────────────
function AssignModal({ session, onClose, onDone }) {
  const [q,        setQ]        = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newRoom,  setNewRoom]  = useState(session?.room_label || '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const timer = useRef(null)

  const search = useCallback(async (val) => {
    setLoading(true)
    try {
      const { data } = await searchProfiles(val)
      setResults(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(q), 280)
    return () => clearTimeout(timer.current)
  }, [q, search])

  useEffect(() => { search('') }, [search])

  const doAssign = async (profileId) => {
    setSaving(true); setError('')
    try {
      await assignSession(session.id, { profile_id: profileId })
      onDone()
    } catch (e) {
      setError(e.response?.data?.detail || 'Lỗi khi gán')
    } finally { setSaving(false) }
  }

  const doCreate = async () => {
    if (!newName.trim()) { setError('Cần nhập tên'); return }
    setSaving(true); setError('')
    try {
      await assignSession(session.id, { display_name: newName.trim(), known_room: newRoom })
      onDone()
    } catch (e) {
      setError(e.response?.data?.detail || 'Lỗi khi tạo')
    } finally { setSaving(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>Gán người vào session</span>
          <button className={s.btnIcon} onClick={onClose}><Icon name="x" size={14}/></button>
        </div>
        <div className={s.modalSub}>{session.room_label} · {fmtDt(session.event_time_vn)}</div>

        {!creating ? (
          <>
            <input
              className={s.searchInput}
              placeholder="Tìm theo tên hoặc phòng…"
              value={q} onChange={e => setQ(e.target.value)}
              autoFocus
            />
            <div className={s.searchResults}>
              {loading && <div className={s.searchMsg}><Spinner /></div>}
              {!loading && results.length === 0 && (
                <div className={s.searchMsg}>Không tìm thấy profile nào</div>
              )}
              {results.map(p => (
                <div key={p.id} className={s.searchRow} onClick={() => doAssign(p.id)}>
                  <FaceAvatar gender={p.gender} confidence={p.confidence_lvl} eventId={p.face_event_id} size={30} noLightbox />
                  <div className={s.searchInfo}>
                    <div className={s.searchName}>{p.display_name || `Unknown ${p.id.slice(0,6)}`}</div>
                    <div className={s.searchMeta}>{p.known_room} · quality {p.face_quality?.toFixed(2)}</div>
                  </div>
                  <span className={`${s.badge} ${CONF_META[p.confidence_lvl]?.cls || s.stNone}`}>
                    {CONF_META[p.confidence_lvl]?.label || p.confidence_lvl}
                  </span>
                </div>
              ))}
            </div>
            <button className={s.btnSecondary} style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
              onClick={() => setCreating(true)}>
              + Tạo người mới
            </button>
          </>
        ) : (
          <div className={s.createForm}>
            <label className={s.formLabel}>Tên</label>
            <input className={s.searchInput} placeholder="Nguyễn Văn A"
              value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            <label className={s.formLabel}>Phòng</label>
            <input className={s.searchInput} value={newRoom}
              onChange={e => setNewRoom(e.target.value)} />
            <div className={s.modalActions}>
              <button className={s.btnSecondary} onClick={() => setCreating(false)}>← Quay lại</button>
              <button className={s.btnPrimary} onClick={doCreate} disabled={saving}>
                {saving ? 'Đang lưu…' : 'Tạo & gán'}
              </button>
            </div>
          </div>
        )}

        {error && <div className={s.errorBox}>{error}</div>}
        {saving && !creating && <div className={s.searchMsg}><Spinner /></div>}
      </div>
    </div>
  )
}

// ── Backfill Modal ────────────────────────────────────────────────
function BackfillModal({ onClose }) {
  const [days,    setDays]    = useState(7)
  const [room,    setRoom]    = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)

  const run = async () => {
    setLoading(true)
    try {
      const { data } = await postBackfill({ days, room: room || undefined })
      setResult(data)
    } finally { setLoading(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>Backfill enroll jobs</span>
          <button className={s.btnIcon} onClick={onClose}><Icon name="x" size={14}/></button>
        </div>
        <label className={s.formLabel}>Số ngày nhìn lại</label>
        <input type="number" className={s.searchInput}
          value={days} onChange={e => setDays(+e.target.value)} min={1} max={90} />
        <label className={s.formLabel} style={{ marginTop: 8 }}>Phòng cụ thể (để trống = tất cả)</label>
        <input className={s.searchInput} placeholder="P.302"
          value={room} onChange={e => setRoom(e.target.value)} />
        {result && (
          <div className={s.resultBox}>
            Đã enqueue <strong>{result.enqueued}</strong> / {result.total_found} events
          </div>
        )}
        <div className={s.modalActions}>
          <button className={s.btnSecondary} onClick={onClose}>Hủy</button>
          <button className={s.btnPrimary} onClick={run} disabled={loading}>
            {loading ? 'Đang chạy…' : 'Chạy backfill'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Session Detail ────────────────────────────────────────────────
function SessionDetail({ d, onClose, onRetry, onAssign }) {
  const navigate = useNavigate()
  const canRetry = ['failed', 'low_quality', 'no_detection', 'skipped'].includes(d.status)

  const toGateLog = () => {
    if (!d.event_time_vn) return
    const dateStr = new Date(d.event_time_vn).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
    const params = new URLSearchParams({ since: dateStr, until: dateStr })
    if (d.room_label) params.set('room', d.room_label)
    navigate(`/gate-log?${params}`)
  }

  return (
    <div className={s.detailPanel}>
      <div className={s.detailHeader}>
        <span className={s.detailTitle}>Chi tiết session</span>
        <StatusBadge status={d.status} />
        <span className={`${s.badge} ${s.stTeal}`}>{d.room_label}</span>
        <span className={s.detailMeta}>{fmtDt(d.event_time_vn)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {canRetry && (
            <button className={`${s.btnAction} ${s.btnRetry}`} onClick={onRetry}>
              ↺ Retry
            </button>
          )}
          <button className={`${s.btnAction} ${s.btnAssign}`} onClick={onAssign}>
            ＋ Gán người
          </button>
          {d.event_time_vn && (
            <button className={s.btnSecondary} onClick={toGateLog} title="Xem trong Gate Log">
              → Gate Log
            </button>
          )}
          <button className={s.btnIcon} onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <div className={s.detailMeta2}>
        <span>Quality: <strong>{fmtPct(d.overall_quality)}</strong></span>
        <span>Face score: <strong>{d.best_face_score?.toFixed(3) || '—'}</strong></span>
        <span>Dừng ở: <strong>{d.stopped_at_cam || 'hết cam'}</strong></span>
        <span>Nguồn: <strong>{d.used_video ? '📹 video' : '📷 snapshot'}</strong></span>
        <span>Thời gian xử lý: <strong>{fmtMs(d.total_ms)}</strong></span>
        {d.direction && <span>Hướng: <strong style={{ color: d.direction === 'IN' ? '#60a5fa' : '#a855f7' }}>{d.direction}</strong></span>}
        {d.user_name  && <span>User: <strong>{d.user_name}</strong></span>}
      </div>

      {d.error_msg && (
        <div className={s.errorBox}>⚠ {d.error_msg}</div>
      )}

      {d.camera_clips?.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionLabel}>Kết quả từng camera</div>
          <div className={s.camGrid}>
            {d.camera_clips.map(c => (
              <div key={c.camera_id}
                className={`${s.camCard} ${c.stopped_here ? s.camStopped : ''}`}>
                <div className={s.camHead}>
                  <strong>{c.camera_id}</strong>
                  {c.stopped_here && <span className={`${s.badge} ${s.stEnrolled}`}>✓ dừng</span>}
                  <span className={s.camSrc}>{c.source_type === 'snapshot' ? '📷' : '📹'}</span>
                  {c.clip_finalized && <span className={`${s.badge} ${s.stRunning}`}>🎬 video</span>}
                </div>

                {/* Video player nếu có clip */}
                {c.clip_finalized && c.frigate_event_id ? (
                  <video
                    className={s.clipVideo}
                    src={`/api/media/clip/${c.frigate_event_id}`}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    poster={`/api/media/snapshot/${c.frigate_event_id}`}
                  />
                ) : (
                  <CamThumb
                    camId={c.camera_id}
                    quality={c.confidence}
                    status={c.stopped_here ? 'enrolled' : 'low_quality'}
                    eventId={c.frigate_event_id}
                    width={150}
                    height={100}
                  />
                )}

                <div style={{ marginTop: 8 }}>
                  <ScoreBar value={c.confidence} />
                </div>
                <div className={s.camMeta}>
                  <span>{c.frames_processed} frames</span>
                  <span>{c.persons_detected} người</span>
                  {c.face_score > 0 && <span>face {c.face_score?.toFixed(2)}</span>}
                  {c.has_multi_person && <span className={`${s.badge} ${s.stLowQ}`}>multi</span>}
                  {c.has_occlusion && <span className={`${s.badge} ${s.stLowQ}`}>bị che</span>}
                  {!c.frigate_event_id && <span className={s.noMedia}>no media</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.persons?.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionLabel}>Người được enroll</div>
          <div className={s.personGrid}>
            {d.persons.map(p => (
              <div key={p.id} className={s.personCard}>
                <div className={s.personHead}>
                  <FaceAvatar gender={p.gender} confidence={p.confidence_lvl} size={44} />
                  <div>
                    <div className={s.personName}>
                      {p.display_name || `Unknown · ${p.id?.slice(0,6)}`}
                      {p.is_new && <span className={`${s.badge} ${s.stEnrolled}`} style={{marginLeft:6}}>mới</span>}
                    </div>
                    <div className={s.personSub}>{p.known_room}{p.age_estimate ? ` · ~${p.age_estimate}t` : ''}</div>
                    <span className={`${s.badge} ${CONF_META[p.confidence_lvl]?.cls || s.stNone}`}>
                      {CONF_META[p.confidence_lvl]?.label || p.confidence_lvl}
                    </span>
                  </div>
                </div>
                <ScoreBar value={p.face_quality} label="face" />
                {p.appearance_notes && (
                  <div className={s.notes}>{p.appearance_notes}</div>
                )}
                {p.merge_sim != null && (
                  <div className={s.simScore}>similarity {(p.merge_sim * 100).toFixed(0)}%</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sessions Tab ──────────────────────────────────────────────────
function SessionsTab() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [roomF,   setRoomF]   = useState('')
  const [statusF, setStatusF] = useState('')
  const [selected, setSel]    = useState(null)
  const [detail,  setDetail]  = useState(null)
  const [detailL, setDL]      = useState(false)
  const [assignSes, setAssign] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (roomF)   params.room   = roomF
      if (statusF) params.status = statusF
      const { data } = await getEnrollSessions(params)
      setRows(data)
    } finally { setLoading(false) }
  }, [roomF, statusF])

  useEffect(() => { load() }, [load])

  const openDetail = async (id) => {
    if (selected === id) { setSel(null); setDetail(null); return }
    setSel(id); setDL(true)
    try {
      const { data } = await getEnrollSession(id)
      setDetail(data)
    } finally { setDL(false) }
  }

  const handleRetry = async () => {
    if (!detail) return
    try {
      await retrySession(detail.id)
      setDetail(prev => ({ ...prev, status: 'processing' }))
      setRows(prev => prev.map(r => r.id === detail.id ? { ...r, status: 'processing' } : r))
    } catch (e) {
      alert(e.response?.data?.detail || 'Lỗi khi retry')
    }
  }

  const handleAssignDone = async () => {
    setAssign(null)
    if (detail) {
      const { data } = await getEnrollSession(detail.id)
      setDetail(data)
    }
    load()
  }

  return (
    <div>
      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Lọc phòng (P.302…)"
          value={roomF} onChange={e => setRoomF(e.target.value)} />
        <select className={s.filterSelect}
          value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {['enrolled','low_quality','no_detection','failed','processing','skipped'].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button className={s.btnSecondary} onClick={load}>
          <Icon name="refresh" size={13} /> Làm mới
        </button>
        <span className={s.filterMeta}>{rows.length} sessions</span>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Snap</th>
              <th>Thời gian</th>
              <th>Phòng</th>
              <th>Trạng thái</th>
              <th>Dir</th>
              <th className={s.tdCenter}>Người</th>
              <th>Quality</th>
              <th>Camera</th>
              <th className={s.tdRight}>ms</th>
              <th style={{ width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className={s.tdCenter}><Spinner /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={10} className={s.tdCenter}><Empty /></td></tr>
            )}
            {!loading && rows.map(r => (
              <tr key={r.id}
                data-status={r.status}
                className={`${s.tableRow} ${ROW_CLS[r.status] || ''} ${selected === r.id ? s.tableRowActive : ''}`}
                onClick={() => openDetail(r.id)}>
                <td style={{ padding: '6px 10px' }}>
                  <CamThumb
                    camId={r.stopped_at_cam}
                    quality={r.overall_quality}
                    status={r.status}
                    eventId={r.snap_event_id}
                    width={60}
                    height={42}
                  />
                </td>
                <td className={s.tdTime}>{fmtDt(r.event_time_vn)}</td>
                <td><span className={`${s.badge} ${s.stTeal}`}>{r.room_label}</span></td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  {r.direction && (
                    <span className={r.direction === 'IN' ? s.dirIn : s.dirOut}>
                      {r.direction}
                    </span>
                  )}
                </td>
                <td className={s.tdCenter}>
                  <span className={r.persons_enrolled > 0 ? s.countGreen : s.countGray}>
                    {r.persons_enrolled}
                  </span>
                  <span className={s.countSep}>/</span>
                  {r.person_count}
                </td>
                <td className={s.tdWide}><ScoreBar value={r.overall_quality} /></td>
                <td className={s.tdMuted}>{r.stopped_at_cam || '—'}</td>
                <td className={`${s.tdMuted} ${s.tdRight}`}>{fmtMs(r.total_ms)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <div className={s.actionCell}>
                    {['failed','low_quality','no_detection','skipped'].includes(r.status) && (
                      <button className={`${s.btnAction} ${s.btnRetry}`}
                        title="Retry"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await retrySession(r.id)
                            setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: 'processing' } : x))
                          } catch (err) { alert(err.response?.data?.detail || 'Lỗi') }
                        }}>
                        ↺
                      </button>
                    )}
                    <button className={`${s.btnAction} ${s.btnAssign}`}
                      title="Gán người"
                      onClick={(e) => { e.stopPropagation(); setAssign(r) }}>
                      ＋
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailL && <div className={s.detailLoading}><Spinner /></div>}
      {detail && !detailL && (
        <SessionDetail
          d={detail}
          onClose={() => { setDetail(null); setSel(null) }}
          onRetry={handleRetry}
          onAssign={() => setAssign(detail)}
        />
      )}

      {assignSes && (
        <AssignModal
          session={assignSes}
          onClose={() => setAssign(null)}
          onDone={handleAssignDone}
        />
      )}
    </div>
  )
}

// ── Profiles Tab ──────────────────────────────────────────────────
function ProfilesTab() {
  const navigate  = useNavigate()
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [roomF,   setRoomF]   = useState('')
  const [confF,   setConfF]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (roomF) params.room       = roomF
      if (confF) params.confidence = confF
      const { data } = await getEnrollProfiles(params)
      setRows(data)
    } finally { setLoading(false) }
  }, [roomF, confF])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Lọc tên hoặc phòng"
          value={roomF} onChange={e => setRoomF(e.target.value)} />
        <select className={s.filterSelect}
          value={confF} onChange={e => setConfF(e.target.value)}>
          <option value="">Tất cả confidence</option>
          {['gate_code','camera_chain','appearance_only','unknown'].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button className={s.btnSecondary} onClick={load}>
          <Icon name="refresh" size={13} /> Làm mới
        </button>
        <span className={s.filterMeta}>{rows.length} profiles</span>
      </div>

      {loading ? <div className={s.center}><Spinner /></div> : (
        <div className={s.profileGrid}>
          {rows.length === 0 && <div className={s.center}><Empty /></div>}
          {rows.map(p => (
            <div key={p.id} className={s.profileCard}
              onClick={() => navigate(`/enroll/profiles/${p.id}`)}>
              <div className={s.profileAvatar}>
                <FaceAvatar gender={p.gender} confidence={p.confidence_lvl} eventId={p.face_event_id} size={72} />
              </div>
              <div className={s.profileName}>
                {p.display_name || `Unknown · ${p.id.slice(0,6)}`}
              </div>
              <div className={s.profileSub}>
                {p.gender === 'female' ? 'Nữ' : p.gender === 'male' ? 'Nam' : ''}
                {p.age_estimate ? ` · ~${p.age_estimate}t` : ''}
              </div>
              <div className={s.profileBadges}>
                <span className={`${s.badge} ${CONF_META[p.confidence_lvl]?.cls || s.stNone}`}>
                  {CONF_META[p.confidence_lvl]?.label || p.confidence_lvl}
                </span>
                <span className={`${s.badge} ${s.stTeal}`}>{p.known_room}</span>
              </div>
              <ScoreBar value={p.face_quality} label="face" />
              {p.appearance_notes && (
                <div className={s.profileNotes}>{p.appearance_notes}</div>
              )}
              <div className={s.profileFooter}>
                <span>×{p.enroll_count} enrolls</span>
                <span>{fmtDt(p.last_seen_ts)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Occupancy Tab ─────────────────────────────────────────────────
const FLOORS = [2, 3, 4, 5, 6, 7]

function durLabel(hours) {
  if (!hours) return ''
  const h = parseFloat(hours)
  if (h < 1) return `${Math.round(h * 60)}m`
  return `${h.toFixed(1)}h`
}

function OccupancyTab() {
  const navigate  = useNavigate()
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { const { data } = await getOccupancy(); setRows(data) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  const byRoom = rows.reduce((acc, r) => {
    ;(acc[r.room_id] = acc[r.room_id] || []).push(r)
    return acc
  }, {})

  const totalOccupied = Object.keys(byRoom).length
  const totalGuests   = rows.length

  return (
    <div>
      <div className={s.filterRow}>
        <div className={s.occSummaryRow}>
          <div className={s.occStat}>
            <span className={s.occStatVal} style={{ color: totalOccupied > 0 ? '#4ade80' : 'var(--c-text-2)' }}>
              {totalOccupied}
            </span>
            <span className={s.occStatLabel}>phòng có khách</span>
          </div>
          <div className={s.occStatDiv} />
          <div className={s.occStat}>
            <span className={s.occStatVal}>{totalGuests}</span>
            <span className={s.occStatLabel}>khách đang ở</span>
          </div>
          <div className={s.occStatDiv} />
          <div className={s.occStat}>
            <span className={s.occStatVal}>{12 - totalOccupied}</span>
            <span className={s.occStatLabel}>phòng trống</span>
          </div>
        </div>
        <button className={s.btnSecondary} onClick={load} style={{ marginLeft: 'auto' }}>
          <Icon name="refresh" size={13} /> Làm mới
        </button>
      </div>

      {loading ? (
        <div className={s.center}><Spinner /></div>
      ) : (
        <div className={s.floorList}>
          {FLOORS.map(floor => {
            const rooms = [`P.${floor}01`, `P.${floor}02`]
            const hasAny = rooms.some(r => byRoom[r]?.length > 0)
            return (
              <div key={floor} className={s.floorRow}>
                <div className={`${s.floorLabel} ${hasAny ? s.floorLabelActive : ''}`}>
                  Tầng {floor}
                </div>
                <div className={s.floorRooms}>
                  {rooms.map(room => {
                    const occ = byRoom[room] || []
                    const occupied = occ.length > 0
                    return (
                      <div key={room}
                        className={`${s.roomBox} ${occupied ? s.roomBoxOccupied : s.roomBoxEmpty}`}>
                        <div className={s.roomBoxHead}>
                          <span className={s.roomBoxName}>{room}</span>
                          {occupied ? (
                            <span className={s.roomBoxCount}>{occ.length} người</span>
                          ) : (
                            <span className={s.roomBoxEmpty2}>trống</span>
                          )}
                        </div>
                        {occupied && (
                          <div className={s.guestList}>
                            {occ.map((o, i) => {
                              const hrs = parseFloat(o.hours_in_room || 0)
                              const dur = durLabel(o.hours_in_room)
                              const durPct = Math.min(100, (hrs / 24) * 100)
                              return (
                                <div key={i}
                                  className={s.guestRow}
                                  onClick={() => o.person_id && navigate(`/enroll/profiles/${o.person_id}`)}>
                                  <FaceAvatar
                                    gender={o.gender}
                                    confidence={o.entry_confidence}
                                    size={32}
                                  />
                                  <div className={s.guestInfo}>
                                    <div className={s.guestName}>
                                      {o.display_name || `Unknown ${o.person_id?.slice(0,6)}`}
                                      {o.gender && (
                                        <span className={s.guestMeta}>
                                          {o.gender === 'female' ? ' ♀' : ' ♂'}
                                          {o.age_estimate ? ` ~${o.age_estimate}t` : ''}
                                        </span>
                                      )}
                                    </div>
                                    {o.appearance_notes && (
                                      <div className={s.guestNotes}>{o.appearance_notes}</div>
                                    )}
                                    <div className={s.guestDurRow}>
                                      <div className={s.guestDurTrack}>
                                        <div className={s.guestDurFill}
                                          style={{ width: `${durPct}%`,
                                            background: hrs > 8 ? '#f87171' : hrs > 4 ? '#fbbf24' : '#4ade80' }} />
                                      </div>
                                      <span className={s.guestDurLabel}>{dur}</span>
                                    </div>
                                    <div className={s.guestTime}>
                                      vào {fmtDt(o.entry_ts)}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Jobs Tab ──────────────────────────────────────────────────────
function JobsTab({ onRefreshStats }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [statusF, setStatusF] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getEnrollJobs(statusF ? { status: statusF } : {})
      setRows(data)
    } finally { setLoading(false) }
  }, [statusF])

  useEffect(() => { load() }, [load])

  const handleCancel = async (id) => {
    await cancelJob(id)
    load(); onRefreshStats?.()
  }

  const handleRetryJob = async (id) => {
    try {
      await retryJob(id)
      load(); onRefreshStats?.()
    } catch (e) {
      alert(e.response?.data?.detail || 'Lỗi khi retry job')
    }
  }

  return (
    <div>
      <div className={s.filterRow}>
        <select className={s.filterSelect} value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="">Tất cả</option>
          {['pending','running','done','failed','skipped'].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button className={s.btnSecondary} onClick={load}><Icon name="refresh" size={13} /> Làm mới</button>
        <span className={s.filterMeta}>{rows.length} jobs</span>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Phòng</th>
              <th>Sự kiện</th>
              <th>Trạng thái</th>
              <th className={s.tdCenter}>Lần thử</th>
              <th>Scheduled</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Worker</th>
              <th>Lỗi</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className={s.tdCenter}><Spinner /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={11} className={s.tdCenter}><Empty /></td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id}
                className={`${s.tableRow} ${ROW_CLS[r.status] || ''}`}>
                <td className={s.tdMuted}>{r.id}</td>
                <td><span className={`${s.badge} ${s.stTeal}`}>{r.room_label}</span></td>
                <td className={s.tdTime}>{fmtDt(r.event_time_vn)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className={s.tdCenter}>
                  <span className={r.attempt_count >= r.max_attempts ? s.countGray : ''}>
                    {r.attempt_count}/{r.max_attempts}
                  </span>
                </td>
                <td className={s.tdTime}>{fmtDt(r.scheduled_at)}</td>
                <td className={s.tdTime}>{r.started_at ? fmtDt(r.started_at) : <span className={s.tdMuted}>—</span>}</td>
                <td className={s.tdTime}>{r.finished_at ? fmtDt(r.finished_at) : <span className={s.tdMuted}>—</span>}</td>
                <td className={s.tdMuted} style={{ maxWidth: 110 }}>{r.locked_by || '—'}</td>
                <td className={s.tdError}>{r.last_error || '—'}</td>
                <td>
                  <div className={s.actionCell}>
                    {['failed','skipped'].includes(r.status) && (
                      <button className={`${s.btnAction} ${s.btnRetry}`}
                        title="Retry job"
                        onClick={() => handleRetryJob(r.id)}>
                        ↺
                      </button>
                    )}
                    {r.status === 'pending' && (
                      <button className={s.btnIcon} title="Hủy" onClick={() => handleCancel(r.id)}>
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
const TABS = [
  { id: 'sessions',  label: 'Sessions' },
  { id: 'profiles',  label: 'Profiles' },
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'jobs',      label: 'Jobs' },
]

export default function Enroll() {
  const [searchParams] = useSearchParams()
  const [tab,          setTab]      = useState(searchParams.get('tab') || 'sessions')
  const [summary,      setSummary]  = useState({})
  const [queue,        setQueue]    = useState([])
  const [showBackfill, setBackfill] = useState(false)

  const loadStats = async () => {
    try {
      const [s, q] = await Promise.all([
        getEnrollSummary().then(r => r.data),
        getEnrollQueue().then(r => r.data),
      ])
      setSummary(s); setQueue(q)
    } catch { /* silent */ }
  }

  useEffect(() => {
    loadStats()
    const t = setInterval(loadStats, 30000)
    return () => clearInterval(t)
  }, [])

  const failedJobs  = queue.find(q => q.status === 'failed')?.cnt || 0
  const pendingJobs = queue.find(q => q.status === 'pending')?.cnt || 0

  return (
    <div className={s.page}>
      <div className={s.pageTop}>
        <div className={s.pageHeader}>
          <div>
            <h2 className={s.pageTitle}>Enroll</h2>
            <span className={s.pageSub}>Camera pipeline · CompreFace · ArcFace R100</span>
          </div>
          <div className={s.pageActions}>
            {failedJobs > 0 && (
              <span className={`${s.badge} ${s.stFailed}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setTab('jobs')}>
                {failedJobs} jobs failed
              </span>
            )}
            {pendingJobs > 0 && (
              <span className={`${s.badge} ${s.stLowQ}`}>{pendingJobs} pending</span>
            )}
            <button className={s.btnSecondary} onClick={() => setBackfill(true)}>
              <Icon name="refresh" size={13} /> Backfill
            </button>
            <button className={s.btnSecondary} onClick={loadStats}>
              <Icon name="refresh" size={13} />
            </button>
          </div>
        </div>

        <MetricCards summary={summary} queue={queue} />

        <div className={s.tabs}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${s.tabBtn} ${tab === t.id ? s.tabActive : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'jobs' && failedJobs > 0 && (
                <span className={s.tabDot} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={s.pageBody}>
        {tab === 'sessions'  && <SessionsTab />}
        {tab === 'profiles'  && <ProfilesTab />}
        {tab === 'occupancy' && <OccupancyTab />}
        {tab === 'jobs'      && <JobsTab onRefreshStats={loadStats} />}
      </div>

      {showBackfill && <BackfillModal onClose={() => setBackfill(false)} />}
    </div>
  )
}
