import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEnrollProfile, patchEnrollProfile, postReenroll } from '../api/client'
import { Icon, Spinner } from '../components/UI'
import s from './EnrollProfile.module.css'

const VN_TZ = 'Asia/Ho_Chi_Minh'

function fmtDt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: VN_TZ,
  })
}
function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: VN_TZ,
  })
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: VN_TZ,
  })
}
function fmtHr(v) {
  if (v == null) return '—'
  const h = parseFloat(v)
  if (h < 1) return `${Math.round(h * 60)}m`
  return `${h.toFixed(1)}h`
}
function fmtPct(v) {
  return v != null ? `${Math.round(v * 100)}%` : '—'
}

const CONF_LABEL = {
  gate_code:       'gate code',
  camera_chain:    'camera chain',
  appearance_only: 'appearance only',
  unknown:         'unknown',
}
const CONF_COLOR = {
  gate_code: '#22c55e', camera_chain: '#0d9488', appearance_only: '#f59e0b', unknown: '#475569',
}

function FaceAvatar({ gender, confidence, size = 52 }) {
  const bc = CONF_COLOR[confidence] || '#475569'
  const bg = gender === 'female' ? '#501620' : gender === 'male' ? '#162850' : '#1a2030'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      position: 'relative', overflow: 'hidden',
      background: `radial-gradient(circle at 50% 62%, ${bg} 0%, #050810 100%)`,
      border: `2px solid ${bc}55`,
      boxShadow: `0 0 0 2px ${bc}1a, 0 2px 8px rgba(0,0,0,.6)`,
    }}>
      <svg style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', opacity: .35 }}
        width={size} height={size * 1.15} viewBox="0 0 100 115">
        <ellipse cx={50} cy={34} rx={21} ry={25} fill="#c8bdb0" />
        <path d="M5 115 Q5 68 50 68 Q95 68 95 115" fill="#c8bdb0" />
      </svg>
    </div>
  )
}
const STATUS_MOD = {
  enrolled:     s.tagGreen,
  low_quality:  s.tagAmber,
  no_detection: s.tagDim,
  failed:       s.tagRed,
}

function Tag({ text, mod }) {
  return <span className={`${s.tag} ${mod || s.tagDim}`}>{text}</span>
}

function ScoreBar({ value, warn = 0.45, ok = 0.70 }) {
  const v   = value ?? 0
  const pct = Math.min(100, Math.round(v * 100))
  const cls = v >= ok ? s.barGreen : v >= warn ? s.barAmber : s.barRed
  return (
    <div className={s.barRow}>
      <div className={s.barTrack}>
        <div className={`${s.barFill} ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.barVal}>{v.toFixed(2)}</span>
    </div>
  )
}

export default function EnrollProfile() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState(null)
  const [editing, setEditing]   = useState(false)
  const [nameVal, setNameVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [reenrolling, setRE]    = useState(false)
  const [reenrollResult, setRER] = useState(null)
  const inputRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data: d } = await getEnrollProfile(id)
      setData(d)
      setNameVal(d.display_name || '')
    } catch (e) {
      setErr('Không tải được profile')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const saveName = async () => {
    if (!nameVal.trim()) return
    setSaving(true)
    try {
      await patchEnrollProfile(id, { display_name: nameVal.trim() })
      setData(d => ({ ...d, display_name: nameVal.trim() }))
      setEditing(false)
    } finally { setSaving(false) }
  }

  const handleReenroll = async () => {
    if (reenrolling) return
    setRE(true); setRER(null)
    try {
      const { data: r } = await postReenroll(id)
      setRER(r)
    } catch {
      setRER({ error: 'Thất bại — kiểm tra worker-enroll trên f87' })
    } finally { setRE(false) }
  }

  if (loading) return (
    <div className={s.center}><Spinner size={20} /><span className={s.tlo}>Đang tải...</span></div>
  )
  if (err || !data) return (
    <div className={s.center}>
      <span className={s.tlo}>{err || 'Không tìm thấy profile'}</span>
      <button className={s.btn} onClick={() => navigate('/enroll')}>← Quay lại</button>
    </div>
  )

  const p = data
  const displayName = p.display_name || `Unknown · ${p.id?.slice(0, 8)}`

  return (
    <div className={s.page}>

      <div className={s.topbar}>
        <button className={s.back} onClick={() => navigate('/enroll')}>
          <Icon name="chevron-left" size={14} />
          Enroll
        </button>
        <span className={s.breadcrumb}>/</span>
        <span className={s.breadcrumbCurrent}>{displayName}</span>
        <div className={s.topActions}>
          <button className={s.btn} onClick={load}>
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>

      <div className={s.body}>

        <div className={s.headerCard}>
          <FaceAvatar gender={p.gender} confidence={p.confidence_lvl} size={52} />

          <div className={s.headerInfo}>
            {editing ? (
              <div className={s.editRow}>
                <input
                  ref={inputRef}
                  className={s.nameInput}
                  value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveName()
                    if (e.key === 'Escape') { setEditing(false); setNameVal(p.display_name || '') }
                  }}
                  placeholder="Nhập tên khách..."
                />
                <button className={`${s.btn} ${s.btnGreen}`} onClick={saveName} disabled={saving}>
                  {saving ? <Spinner size={12} /> : <Icon name="check" size={13} />}
                </button>
                <button className={s.btn} onClick={() => { setEditing(false); setNameVal(p.display_name || '') }}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ) : (
              <div className={s.nameRow}>
                <span className={s.name}>{displayName}</span>
                <button className={s.iconBtn} onClick={() => setEditing(true)} title="Đặt tên">
                  <Icon name="edit" size={13} />
                </button>
              </div>
            )}

            <div className={s.headerMeta}>
              <Tag text={CONF_LABEL[p.confidence_lvl] || p.confidence_lvl}
                   mod={p.confidence_lvl === 'gate_code' ? s.tagGreen : s.tagAmber} />
              {p.known_room && <Tag text={p.known_room} mod={s.tagBlue} />}
              {p.gender && <Tag text={p.gender === 'female' ? 'Nữ' : 'Nam'} mod={s.tagDim} />}
              {p.age_estimate && <Tag text={`~${p.age_estimate}t`} mod={s.tagDim} />}
              <span className={s.metaId}>#{p.id?.slice(0, 8)}</span>
            </div>

            <div className={s.headerDates}>
              <span>Lần đầu: {fmtDt(p.first_seen_ts)}</span>
              <span className={s.sep}>·</span>
              <span>Lần cuối: {fmtDt(p.last_seen_ts)}</span>
              <span className={s.sep}>·</span>
              <span>Enrolled {p.enroll_count}×</span>
            </div>
          </div>

          <div className={s.headerActions}>
            <button
              className={`${s.btn} ${reenrolling ? s.btnLoading : ''}`}
              onClick={handleReenroll}
              disabled={reenrolling}
            >
              {reenrolling
                ? <><Spinner size={12} /> Re-enrolling...</>
                : <><Icon name="refresh" size={13} /> Re-enroll</>}
            </button>
          </div>
        </div>

        {reenrollResult && (
          <div className={`${s.toast} ${reenrollResult.error ? s.toastErr : s.toastOk}`}>
            {reenrollResult.error
              ? <><Icon name="alert-triangle" size={13} /> {reenrollResult.error}</>
              : <><Icon name="check" size={13} /> Job #{reenrollResult.job_id} đã enqueue — worker f87 sẽ xử lý trong ~{reenrollResult.delay_s}s</>
            }
          </div>
        )}

        <div className={s.metricsRow}>
          {[
            { label: 'Face quality',  value: p.face_quality != null ? p.face_quality.toFixed(2) : '—', hi: (p.face_quality||0) >= 0.45 },
            { label: 'Face source',   value: p.face_source_cam || '—' },
            { label: 'Face frames',   value: p.face_frame_count ?? '—' },
            { label: 'Enroll count',  value: `${p.enroll_count}×` },
            { label: 'Body ratio',    value: p.body_ratio != null ? p.body_ratio.toFixed(1) : '—' },
          ].map(c => (
            <div key={c.label} className={s.metricCard}>
              <div className={s.metricLabel}>{c.label}</div>
              <div className={`${s.metricVal} ${c.hi ? s.valGreen : ''}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <div className={s.twoCol}>
          <div className={s.card}>
            <div className={s.cardHead}>Đặc trưng khuôn mặt</div>
            <div className={s.scoreList}>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Face quality (avg)</span>
                <ScoreBar value={p.face_quality} />
              </div>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Confidence lvl</span>
                <span className={s.scoreText}>
                  {p.face_quality >= 0.45 ? 'CONFIDENT' : p.face_quality >= 0.30 ? 'POSSIBLE' : 'LOW'}
                </span>
              </div>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Embedding dim</span>
                <span className={s.scoreText}>512-dim ArcFace R100</span>
              </div>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Source camera</span>
                <span className={s.scoreText}>{p.face_source_cam || '—'}</span>
              </div>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Frames đóng góp</span>
                <span className={s.scoreText}>{p.face_frame_count} frames</span>
              </div>
            </div>
          </div>

          <div className={s.card}>
            <div className={s.cardHead}>Màu sắc trang phục</div>
            <div className={s.scoreList}>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Upper body (áo)</span>
                <div className={s.colorRow}>
                  <ScoreBar value={p.color_upper_sim} warn={0.4} ok={0.65} />
                  {p.color_upper_hex && (
                    <div className={s.colorSwatch} style={{ background: p.color_upper_hex }} />
                  )}
                </div>
              </div>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Lower body (quần)</span>
                <div className={s.colorRow}>
                  <ScoreBar value={p.color_lower_sim} warn={0.4} ok={0.65} />
                  {p.color_lower_hex && (
                    <div className={s.colorSwatch} style={{ background: p.color_lower_hex }} />
                  )}
                </div>
              </div>
              <div className={s.scoreRow}>
                <span className={s.scoreLabel}>Histogram dim</span>
                <span className={s.scoreText}>24-dim HSV / body</span>
              </div>
              {p.appearance_notes && (
                <div className={s.notesRow}>
                  <Icon name="tag" size={12} />
                  {p.appearance_notes}
                </div>
              )}
              {p.body_ratio != null && (
                <div className={s.scoreRow}>
                  <span className={s.scoreLabel}>Body ratio (H/W)</span>
                  <span className={s.scoreText}>{p.body_ratio.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>Lịch sử enroll sessions</div>
          {(!p.sessions || p.sessions.length === 0) ? (
            <div className={s.empty}>Chưa có session nào</div>
          ) : (
            <div className={s.timeline}>
              {p.sessions.map((ses, i) => (
                <div key={ses.id} className={s.tlItem}>
                  <div className={s.tlDotCol}>
                    <div className={`${s.tlDot}
                      ${ses.status === 'enrolled' ? s.dotGreen
                        : ses.status === 'low_quality' ? s.dotAmber
                        : s.dotDim}`} />
                    {i < p.sessions.length - 1 && <div className={s.tlLine} />}
                  </div>
                  <div className={s.tlContent}>
                    <div className={s.tlHead}>
                      <span className={s.tlTime}>{fmtDt(ses.event_time_vn)}</span>
                      <Tag text={ses.status} mod={STATUS_MOD[ses.status]} />
                      {ses.is_new && <Tag text="first enroll" mod={s.tagBlue} />}
                      <span className={s.tlQ}>{fmtPct(ses.overall_quality)}</span>
                    </div>
                    <div className={s.tlMeta}>
                      {ses.room_label && <span>{ses.room_label}</span>}
                      {ses.merge_sim != null && (
                        <span>merge sim {ses.merge_sim.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>Room stays</div>
          {(!p.stays || p.stays.length === 0) ? (
            <div className={s.empty}>Chưa có room stay nào</div>
          ) : (
            <div className={s.stayGrid}>
              {p.stays.map((stay, i) => (
                <div key={i} className={`${s.stayCard} ${!stay.exit_ts ? s.stayActive : ''}`}>
                  <div className={s.stayHead}>
                    <span className={s.stayRoom}>{stay.room_id}</span>
                    <Tag
                      text={stay.exit_ts ? 'đã ra' : 'đang ở'}
                      mod={stay.exit_ts ? s.tagDim : s.tagGreen}
                    />
                  </div>
                  <div className={s.stayRows}>
                    <div className={s.stayRow}>
                      <Icon name="login" size={12} />
                      <span>Vào: {fmtDt(stay.entry_ts)}</span>
                      {stay.entry_confidence && (
                        <Tag text={stay.entry_confidence} mod={s.tagDim} />
                      )}
                    </div>
                    <div className={s.stayRow}>
                      <Icon name="logout" size={12} />
                      <span>{stay.exit_ts ? `Ra: ${fmtDt(stay.exit_ts)}` : 'Ra: —'}</span>
                    </div>
                    {!stay.exit_ts && stay.entry_ts && (
                      <div className={s.stayDuration}>
                        {fmtHr((Date.now() - new Date(stay.entry_ts)) / 3_600_000)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
