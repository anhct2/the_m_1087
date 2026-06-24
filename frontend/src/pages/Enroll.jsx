import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getEnrollSummary, getEnrollQueue, getEnrollSessions,
  getEnrollSession, getEnrollProfiles, patchEnrollProfile,
  getOccupancy, getEnrollJobs, postBackfill, cancelJob,
} from '../api/client'
import { Icon, Spinner, Empty } from '../components/UI'
import s from './Enroll.module.css'

// ── Helpers ──────────────────────────────────────────────────
const fmtDt = (v) =>
  v ? new Date(v).toLocaleString('vi-VN', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
  }) : '—'

const fmtPct = (v) => (v != null ? `${(v * 100).toFixed(0)}%` : '—')
const fmtMs  = (v) => (v != null ? `${v}ms` : '—')
const fmtHr  = (v) => (v != null ? `${Number(v).toFixed(1)}h` : '—')

const STATUS_CLS = {
  enrolled:     s.tagGreen,
  low_quality:  s.tagAmber,
  no_detection: s.tagGray,
  failed:       s.tagRed,
  processing:   s.tagBlue,
  pending:      s.tagGray,
  running:      s.tagBlue,
  done:         s.tagGreen,
  skipped:      s.tagGray,
}
const CONF_CLS = {
  gate_code:       s.tagGreen,
  camera_chain:    s.tagTeal,
  appearance_only: s.tagAmber,
  unknown:         s.tagGray,
}

function Tag({ text, cls }) {
  return <span className={`${s.tag} ${cls || s.tagGray}`}>{text}</span>
}

function ScoreBar({ value }) {
  const pct = Math.min(100, ((value || 0)) * 100)
  const cls = pct >= 70 ? s.barGreen : pct >= 45 ? s.barAmber : s.barRed
  return (
    <div className={s.barWrap}>
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

  const cards = [
    { label: 'Sessions 24h',    val: summary.sessions_24h,  hi: false },
    { label: 'Enrolled 24h',    val: summary.enrolled_24h,  hi: true },
    { label: 'Failed 24h',      val: summary.failed_24h,    warn: (summary.failed_24h > 0) },
    { label: 'Profiles',        val: summary.total_profiles },
    { label: 'Phòng có khách',  val: `${summary.rooms_occupied || 0}/12` },
    { label: 'Avg quality 24h', val: fmtPct(summary.avg_quality_24h) },
    { label: 'Jobs pending',    val: pending, warn: pending > 0 },
    { label: 'Jobs running',    val: running },
  ]
  return (
    <div className={s.metricsGrid}>
      {cards.map(c => (
        <div key={c.label} className={s.metricCard}>
          <div className={s.metricLabel}>{c.label}</div>
          <div className={`${s.metricVal} ${c.hi ? s.metricGreen : c.warn ? s.metricAmber : ''}`}>
            {c.val ?? '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Sessions Tab ──────────────────────────────────────────────
function SessionsTab() {
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [roomF,    setRoomF]    = useState('')
  const [statusF,  setStatusF]  = useState('')
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)
  const [detailLoading, setDL]  = useState(false)

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
    if (selected === id) { setSelected(null); setDetail(null); return }
    setSelected(id)
    setDL(true)
    try {
      const { data } = await getEnrollSession(id)
      setDetail(data)
    } finally { setDL(false) }
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
              {['Thời gian','Phòng','Trạng thái','Người','Quality','Dừng ở','Nguồn','Xử lý',''].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className={s.tdCenter}><Spinner /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className={s.tdCenter}><Empty /></td></tr>
            )}
            {!loading && rows.map(r => (
              <tr key={r.id}
                className={`${s.tableRow} ${selected === r.id ? s.tableRowActive : ''}`}
                onClick={() => openDetail(r.id)}>
                <td>{fmtDt(r.event_time_vn)}</td>
                <td><Tag text={r.room_label} cls={s.tagBlue} /></td>
                <td><Tag text={r.status} cls={STATUS_CLS[r.status]} /></td>
                <td className={s.tdCenter}>{r.persons_enrolled}/{r.person_count}</td>
                <td className={s.tdWide}><ScoreBar value={r.overall_quality} /></td>
                <td className={s.tdMuted}>{r.stopped_at_cam || '—'}</td>
                <td className={s.tdMuted}>{r.used_video ? '📹' : '📷'}</td>
                <td className={s.tdMuted}>{fmtMs(r.total_ms)}</td>
                <td>
                  <button className={s.btnIcon}
                    onClick={e => { e.stopPropagation(); openDetail(r.id) }}>
                    <Icon name="eye" size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailLoading && <div className={s.detailLoading}><Spinner /></div>}
      {detail && !detailLoading && (
        <SessionDetail d={detail} onClose={() => { setDetail(null); setSelected(null) }} />
      )}
    </div>
  )
}

function SessionDetail({ d, onClose }) {
  return (
    <div className={s.detailPanel}>
      <div className={s.detailHeader}>
        <span className={s.detailTitle}>Chi tiết session</span>
        <Tag text={d.room_label} cls={s.tagBlue} />
        <Tag text={d.status} cls={STATUS_CLS[d.status]} />
        <span className={s.detailMeta}>{fmtDt(d.event_time_vn)}</span>
        <button className={s.btnIcon} onClick={onClose} style={{ marginLeft: 'auto' }}>
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className={s.detailMeta2}>
        <span>Quality: <strong>{fmtPct(d.overall_quality)}</strong></span>
        <span>Face: <strong>{d.best_face_score?.toFixed(3) || '—'}</strong></span>
        <span>Dừng ở: <strong>{d.stopped_at_cam || 'hết camera'}</strong></span>
        <span>Nguồn: <strong>{d.used_video ? 'video' : 'snapshot'}</strong></span>
        <span>Thời gian: <strong>{fmtMs(d.total_ms)}</strong></span>
      </div>

      {d.camera_clips?.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionLabel}>Kết quả từng camera</div>
          <div className={s.camGrid}>
            {d.camera_clips.map(c => (
              <div key={c.camera_id}
                className={`${s.camCard} ${c.stopped_here ? s.camCardActive : ''}`}>
                <div className={s.camCardHeader}>
                  <strong>{c.camera_id}</strong>
                  {c.stopped_here && <Tag text="dừng" cls={s.tagGreen} />}
                  <span className={s.camSrc}>
                    {c.source_type === 'snapshot' ? '📷' : '📹'} {c.source_type}
                  </span>
                </div>
                <ScoreBar value={c.confidence} />
                <div className={s.camMeta}>
                  <span>{c.frames_processed} frames</span>
                  <span>{c.persons_detected} người</span>
                  {c.has_multi_person && <Tag text="multi" cls={s.tagAmber} />}
                  {c.has_occlusion && <Tag text="bị che" cls={s.tagAmber} />}
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
            {d.persons.map(p => <PersonMini key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {d.error_msg && (
        <div className={s.errorBox}>{d.error_msg}</div>
      )}
    </div>
  )
}

// ── Profiles Tab ─────────────────────────────────────────────
function ProfilesTab() {
  const navigate = useNavigate()
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
    setEditing(null)
    load()
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
          {rows.map(p => (
            <div key={p.id} className={s.profileCard}>
              <div className={s.profileHead}>
                <div className={s.avatar}>
                  {p.gender === 'female' ? '♀' : p.gender === 'male' ? '♂' : '?'}
                </div>
                <div className={s.profileInfo}>
                  {editing === p.id ? (
                    <div className={s.editRow}>
                      <input className={s.editInput} value={editVal}
                        onChange={e => setEditVal(e.target.value)} autoFocus
                        onKeyDown={e => e.key === 'Enter' && saveName(p.id)}
                      />
                      <button className={s.btnIcon} onClick={() => saveName(p.id)}>✓</button>
                      <button className={s.btnIcon} onClick={() => setEditing(null)}>✕</button>
                    </div>
                  ) : (
                    <div className={s.profileNameRow}>
                      <span className={s.profileName}>
                        {p.display_name || `Unknown · ${p.id.slice(0, 6)}`}
                      </span>
                      <button className={s.btnIcon}
                        onClick={() => { setEditing(p.id); setEditVal(p.display_name || '') }}>
                        <Icon name="edit" size={11} />
                      </button>
                      <button className={s.btnIcon}
                        onClick={() => navigate(`/enroll/profiles/${p.id}`)}>
                        <Icon name="eye" size={11} />
                      </button>
                    </div>
                  )}
                  <div className={s.profileSub}>
                    {p.known_room}
                    {p.age_estimate ? ` · ~${p.age_estimate}t` : ''}
                  </div>
                </div>
                <Tag text={p.confidence_lvl} cls={CONF_CLS[p.confidence_lvl]} />
              </div>

              <div className={s.profileScoreRow}>
                <span className={s.scoreLbl}>face</span>
                <ScoreBar value={p.face_quality} />
              </div>

              <div className={s.profileTags}>
                {p.face_source_cam && (
                  <Tag text={`${p.face_source_cam} · ${p.face_frame_count}f`} cls={s.tagGray} />
                )}
                <Tag text={`${p.enroll_count}x enrolled`} cls={s.tagGray} />
              </div>

              {p.appearance_notes && (
                <div className={s.profileNotes}>{p.appearance_notes}</div>
              )}
              <div className={s.profileLast}>Gần nhất: {fmtDt(p.last_seen_ts)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PersonMini({ p }) {
  return (
    <div className={s.personMini}>
      <div className={s.personMiniHead}>
        <div className={s.avatarSm}>
          {p.gender === 'female' ? '♀' : '♂'}
        </div>
        <div>
          <div className={s.personMiniName}>
            {p.display_name || `Unknown · ${p.id?.slice(0, 6)}`}
          </div>
          <div className={s.personMiniSub}>
            {p.age_estimate ? `~${p.age_estimate}t ` : ''}{p.known_room}
          </div>
        </div>
        <Tag text={p.confidence_lvl} cls={CONF_CLS[p.confidence_lvl]} />
      </div>
      <ScoreBar value={p.face_quality} />
      {p.appearance_notes && (
        <div className={s.profileNotes}>{p.appearance_notes}</div>
      )}
    </div>
  )
}

// ── Occupancy Tab ────────────────────────────────────────────
function OccupancyTab() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await getOccupancy()
      setRows(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const byRoom = rows.reduce((acc, r) => {
    ;(acc[r.room_id] = acc[r.room_id] || []).push(r)
    return acc
  }, {})

  const allRooms = [2, 3, 4, 5, 6, 7].flatMap(f => [`P.${f}01`, `P.${f}02`])

  return (
    <div>
      <div className={s.filterRow}>
        <span className={s.occupancyMeta}>
          {Object.keys(byRoom).length} / 12 phòng có khách
        </span>
        <button className={s.btnSecondary} onClick={load}>
          <Icon name="refresh" size={13} /> Làm mới
        </button>
      </div>

      {loading ? <div className={s.center}><Spinner /></div> : (
        <div className={s.roomGrid}>
          {allRooms.map(room => {
            const occ = byRoom[room] || []
            return (
              <div key={room}
                className={`${s.roomCard} ${occ.length > 0 ? s.roomCardOccupied : ''}`}>
                <div className={s.roomHeader}>
                  <strong className={s.roomName}>{room}</strong>
                  <Tag
                    text={occ.length > 0 ? `${occ.length} người` : 'trống'}
                    cls={occ.length > 0 ? s.tagGreen : s.tagGray}
                  />
                </div>
                {occ.map((o, i) => (
                  <div key={i} className={`${s.occupant} ${i > 0 ? s.occupantBorder : ''}`}>
                    <div className={s.occupantName}>
                      {o.display_name || `Unknown · ${o.person_id?.slice(0, 6)}`}
                      {o.gender && (
                        <span className={s.occupantMeta}>
                          {' '}{o.gender === 'female' ? '♀' : '♂'}
                          {o.age_estimate ? ` ~${o.age_estimate}t` : ''}
                        </span>
                      )}
                    </div>
                    {o.appearance_notes && (
                      <div className={s.profileNotes}>{o.appearance_notes}</div>
                    )}
                    <div className={s.occupantTime}>
                      Vào {fmtDt(o.entry_ts)} · {fmtHr(o.hours_in_room)}
                    </div>
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
    <div className={s.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalTitle}>Backfill enroll jobs</div>
        <label className={s.modalLabel}>Số ngày nhìn lại</label>
        <input type="number" className={s.filterInput}
          value={days} onChange={e => setDays(+e.target.value)} min={1} max={90} />
        <label className={s.modalLabel} style={{ marginTop: 10 }}>Phòng cụ thể (tùy chọn)</label>
        <input className={s.filterInput} placeholder="P.302"
          value={room} onChange={e => setRoom(e.target.value)} />
        {result && (
          <div className={s.resultBox}>
            Đã enqueue <strong>{result.enqueued}</strong> / {result.total_found} jobs
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

// ── Main Page ─────────────────────────────────────────────────
const TABS = [
  { id: 'sessions',  label: 'Sessions' },
  { id: 'profiles',  label: 'Profiles' },
  { id: 'occupancy', label: 'Occupancy' },
]

export default function Enroll() {
  const [tab,          setTab]    = useState('sessions')
  const [summary,      setSummary] = useState({})
  const [queue,        setQueue]   = useState([])
  const [showBackfill, setBackfill] = useState(false)

  const loadStats = async () => {
    try {
      const [s, q] = await Promise.all([
        getEnrollSummary().then(r => r.data),
        getEnrollQueue().then(r => r.data),
      ])
      setSummary(s)
      setQueue(q)
    } catch (e) { /* silent */ }
  }

  useEffect(() => {
    loadStats()
    const t = setInterval(loadStats, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h2 className={s.pageTitle}>Enroll</h2>
        <span className={s.pageSub}>Nhận diện và quản lý khách</span>
        <div className={s.pageActions}>
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
            className={`${s.tabBtn} ${tab === t.id ? s.tabBtnActive : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sessions'  && <SessionsTab />}
      {tab === 'profiles'  && <ProfilesTab />}
      {tab === 'occupancy' && <OccupancyTab />}

      {showBackfill && <BackfillModal onClose={() => setBackfill(false)} />}
    </div>
  )
}
