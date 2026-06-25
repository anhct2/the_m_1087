import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getEnrollSummary, getEnrollQueue, getEnrollSessions,
  getEnrollSession, getEnrollProfiles, patchEnrollProfile,
  getOccupancy, getEnrollJobs, postBackfill, cancelJob,
  retrySession, assignSession, searchProfiles,
} from '../api/client'
import { Icon, Spinner, Empty } from '../components/UI'
import s from './Enroll.module.css'

// ── Helpers ───────────────────────────────────────────────────
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
  enrolled:     s.rowEnrolled,
  done:         s.rowEnrolled,
  failed:       s.rowFailed,
  low_quality:  s.rowLowQ,
  processing:   s.rowRunning,
  running:      s.rowRunning,
}
const CONF_META = {
  gate_code:       { cls: s.stEnrolled, label: 'gate_code' },
  camera_chain:    { cls: s.stTeal,     label: 'camera' },
  appearance_only: { cls: s.stLowQ,     label: 'appearance' },
  unknown:         { cls: s.stNone,     label: 'unknown' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { icon: '?', label: status, cls: s.stNone }
  return <span className={`${s.badge} ${m.cls}`}>{m.icon} {m.label}</span>
}

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

// ── Metric Cards ──────────────────────────────────────────────
function MetricCards({ summary, queue }) {
  const pending = queue.find(q => q.status === 'pending')?.cnt || 0
  const running = queue.find(q => q.status === 'running')?.cnt || 0
  const failed  = queue.find(q => q.status === 'failed')?.cnt  || 0

  const cards = [
    { label: 'Sessions 24h',    val: summary.sessions_24h },
    { label: 'Enrolled 24h',    val: summary.enrolled_24h,   hi: 'green' },
    { label: 'Failed 24h',      val: summary.failed_24h,     hi: summary.failed_24h > 0 ? 'red' : null },
    { label: 'Profiles',        val: summary.total_profiles },
    { label: 'Phòng có khách',  val: `${summary.rooms_occupied || 0}/12`, hi: summary.rooms_occupied > 0 ? 'teal' : null },
    { label: 'Avg quality',     val: fmtPct(summary.avg_quality_24h) },
    { label: 'Jobs pending',    val: pending, hi: pending > 0 ? 'amber' : null },
    { label: 'Jobs running',    val: running, hi: running > 0 ? 'blue' : null },
    { label: 'Jobs failed',     val: failed,  hi: failed > 0  ? 'red'  : null },
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

// ── Assign Modal ──────────────────────────────────────────────
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
                  <div className={s.searchAvatar}>
                    {p.gender === 'female' ? '♀' : p.gender === 'male' ? '♂' : '?'}
                  </div>
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

// ── Backfill Modal ────────────────────────────────────────────
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

// ── Session Detail ────────────────────────────────────────────
function SessionDetail({ d, onClose, onRetry, onAssign }) {
  const canRetry = ['failed', 'low_quality', 'no_detection'].includes(d.status)

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
        {d.direction && <span>Hướng: <strong>{d.direction}</strong></span>}
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
                </div>
                <ScoreBar value={c.confidence} />
                <div className={s.camMeta}>
                  <span>{c.frames_processed} frames</span>
                  <span>{c.persons_detected} người</span>
                  {c.face_score > 0 && <span>face {c.face_score?.toFixed(2)}</span>}
                  {c.has_multi_person && <span className={`${s.badge} ${s.stLowQ}`}>multi</span>}
                  {c.has_occlusion && <span className={`${s.badge} ${s.stLowQ}`}>bị che</span>}
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
                  <div className={s.avatar}>
                    {p.gender === 'female' ? '♀' : p.gender === 'male' ? '♂' : '?'}
                  </div>
                  <div>
                    <div className={s.personName}>
                      {p.display_name || `Unknown · ${p.id?.slice(0,6)}`}
                      {p.is_new && <span className={`${s.badge} ${s.stEnrolled}`} style={{marginLeft:6}}>mới</span>}
                    </div>
                    <div className={s.personSub}>{p.known_room}{p.age_estimate ? ` · ~${p.age_estimate}t` : ''}</div>
                  </div>
                  <span className={`${s.badge} ${CONF_META[p.confidence_lvl]?.cls || s.stNone}`}>
                    {CONF_META[p.confidence_lvl]?.label || p.confidence_lvl}
                  </span>
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

// ── Sessions Tab ──────────────────────────────────────────────
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
          {['enrolled','low_quality','no_detection','failed','processing'].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button className={s.btnSecondary} onClick={load}>
          <Icon name="refresh" size={13} /> Làm mới
        </button>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              {['Thời gian','Phòng','Trạng thái','Người','Quality','Camera','Xử lý',''].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className={s.tdCenter}><Spinner /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className={s.tdCenter}><Empty /></td></tr>
            )}
            {!loading && rows.map(r => (
              <tr key={r.id}
                data-status={r.status}
                className={`${s.tableRow} ${ROW_CLS[r.status] || ''} ${selected === r.id ? s.tableRowActive : ''}`}
                onClick={() => openDetail(r.id)}>
                <td className={s.tdTime}>{fmtDt(r.event_time_vn)}</td>
                <td><span className={`${s.badge} ${s.stTeal}`}>{r.room_label}</span></td>
                <td><StatusBadge status={r.status} /></td>
                <td className={s.tdCenter}>
                  <span className={r.persons_enrolled > 0 ? s.countGreen : s.countGray}>
                    {r.persons_enrolled}
                  </span>
                  <span className={s.countSep}>/</span>
                  {r.person_count}
                </td>
                <td className={s.tdWide}><ScoreBar value={r.overall_quality} /></td>
                <td className={s.tdMuted}>{r.stopped_at_cam || '—'}</td>
                <td className={s.tdMuted}>{fmtMs(r.total_ms)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <div className={s.actionCell}>
                    {['failed','low_quality','no_detection'].includes(r.status) && (
                      <button className={`${s.btnAction} ${s.btnRetry}`}
                        title="Retry"
                        onClick={async () => {
                          try {
                            await retrySession(r.id)
                            setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: 'processing' } : x))
                          } catch (e) { alert(e.response?.data?.detail || 'Lỗi') }
                        }}>
                        ↺
                      </button>
                    )}
                    <button className={`${s.btnAction} ${s.btnAssign}`}
                      title="Gán người"
                      onClick={() => setAssign(r)}>
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

// ── Profiles Tab ──────────────────────────────────────────────
function ProfilesTab() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [roomF,   setRoomF]   = useState('')
  const [confF,   setConfF]   = useState('')
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')

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

  const saveName = async (id) => {
    if (!editVal.trim()) return
    await patchEnrollProfile(id, { display_name: editVal.trim() })
    setEditing(null); load()
  }

  return (
    <div>
      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Lọc phòng"
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
      </div>

      {loading ? <div className={s.center}><Spinner /></div> : (
        <div className={s.profileGrid}>
          {rows.length === 0 && <div className={s.center}><Empty /></div>}
          {rows.map(p => (
            <div key={p.id} className={s.profileCard}>
              <div className={s.profileHead}>
                <div className={s.avatar}>
                  {p.gender === 'female' ? '♀' : p.gender === 'male' ? '♂' : '?'}
                </div>
                <div className={s.profileInfo}>
                  {editing === p.id ? (
                    <div className={s.editRow}>
                      <input className={s.filterInput} value={editVal}
                        onChange={e => setEditVal(e.target.value)} autoFocus
                        onKeyDown={e => e.key === 'Enter' && saveName(p.id)} />
                      <button className={s.btnIcon} onClick={() => saveName(p.id)}>✓</button>
                      <button className={s.btnIcon} onClick={() => setEditing(null)}>✕</button>
                    </div>
                  ) : (
                    <div className={s.profileNameRow}>
                      <span className={s.profileName}>
                        {p.display_name || `Unknown · ${p.id.slice(0,6)}`}
                      </span>
                      <button className={s.btnIcon}
                        onClick={() => { setEditing(p.id); setEditVal(p.display_name || '') }}>
                        <Icon name="edit" size={11} />
                      </button>
                    </div>
                  )}
                  <div className={s.profileSub}>{p.known_room}{p.age_estimate ? ` · ~${p.age_estimate}t` : ''}</div>
                </div>
                <span className={`${s.badge} ${CONF_META[p.confidence_lvl]?.cls || s.stNone}`}>
                  {CONF_META[p.confidence_lvl]?.label || p.confidence_lvl}
                </span>
              </div>
              <ScoreBar value={p.face_quality} label="face" />
              <div className={s.profileFooter}>
                <span className={s.profileNotes}>{p.appearance_notes}</span>
                <span className={s.profileLast}>×{p.enroll_count} · {fmtDt(p.last_seen_ts)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Occupancy Tab ─────────────────────────────────────────────
function OccupancyTab() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { const { data } = await getOccupancy(); setRows(data) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const byRoom = rows.reduce((acc, r) => {
    ;(acc[r.room_id] = acc[r.room_id] || []).push(r)
    return acc
  }, {})

  const allRooms = [2,3,4,5,6,7].flatMap(f => [`P.${f}01`, `P.${f}02`])

  return (
    <div>
      <div className={s.filterRow}>
        <span className={s.occupancyMeta}>{Object.keys(byRoom).length} / 12 phòng có khách</span>
        <button className={s.btnSecondary} onClick={load}><Icon name="refresh" size={13} /> Làm mới</button>
      </div>
      {loading ? <div className={s.center}><Spinner /></div> : (
        <div className={s.roomGrid}>
          {allRooms.map(room => {
            const occ = byRoom[room] || []
            return (
              <div key={room} className={`${s.roomCard} ${occ.length > 0 ? s.roomOccupied : ''}`}>
                <div className={s.roomHeader}>
                  <strong className={s.roomName}>{room}</strong>
                  <span className={`${s.badge} ${occ.length > 0 ? s.stEnrolled : s.stNone}`}>
                    {occ.length > 0 ? `${occ.length} người` : 'trống'}
                  </span>
                </div>
                {occ.map((o, i) => (
                  <div key={i} className={`${s.occupant} ${i > 0 ? s.occupantBorder : ''}`}>
                    <div className={s.occupantName}>
                      {o.display_name || `Unknown ${o.person_id?.slice(0,6)}`}
                      {o.gender && <span className={s.tdMuted}> {o.gender === 'female' ? '♀' : '♂'}{o.age_estimate ? ` ~${o.age_estimate}t` : ''}</span>}
                    </div>
                    {o.appearance_notes && <div className={s.notes}>{o.appearance_notes}</div>}
                    <div className={s.occupantTime}>Vào {fmtDt(o.entry_ts)} · {fmtHr(o.hours_in_room)}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Jobs Tab ──────────────────────────────────────────────────
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
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>{['#','Phòng','Thời gian','Trạng thái','Lần thử','Worker','Lỗi',''].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className={s.tdCenter}><Spinner /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className={s.tdCenter}><Empty /></td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id}
                className={`${s.tableRow} ${ROW_CLS[r.status] || ''}`}>
                <td className={s.tdMuted}>{r.id}</td>
                <td><span className={`${s.badge} ${s.stTeal}`}>{r.room_label}</span></td>
                <td className={s.tdTime}>{fmtDt(r.event_time_vn)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className={s.tdCenter}>{r.attempt_count}/{r.max_attempts}</td>
                <td className={s.tdMuted}>{r.locked_by || '—'}</td>
                <td className={s.tdError}>{r.last_error || '—'}</td>
                <td>
                  {r.status === 'pending' && (
                    <button className={s.btnIcon} title="Hủy" onClick={() => handleCancel(r.id)}>
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
const TABS = [
  { id: 'sessions',  label: 'Sessions' },
  { id: 'profiles',  label: 'Profiles' },
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'jobs',      label: 'Jobs' },
]

export default function Enroll() {
  const [tab,          setTab]      = useState('sessions')
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

  const failedJobs = queue.find(q => q.status === 'failed')?.cnt || 0
  const pendingJobs = queue.find(q => q.status === 'pending')?.cnt || 0

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div>
          <h2 className={s.pageTitle}>Enroll</h2>
          <span className={s.pageSub}>Nhận diện và quản lý khách</span>
        </div>
        <div className={s.pageActions}>
          {failedJobs > 0 && (
            <span className={`${s.badge} ${s.stFailed}`}>{failedJobs} jobs failed</span>
          )}
          {pendingJobs > 0 && (
            <span className={`${s.badge} ${s.stLowQ}`}>{pendingJobs} pending</span>
          )}
          <button className={s.btnSecondary} onClick={() => setBackfill(true)}>
            Backfill
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

      {tab === 'sessions'  && <SessionsTab />}
      {tab === 'profiles'  && <ProfilesTab />}
      {tab === 'occupancy' && <OccupancyTab />}
      {tab === 'jobs'      && <JobsTab onRefreshStats={loadStats} />}

      {showBackfill && <BackfillModal onClose={() => setBackfill(false)} />}
    </div>
  )
}
