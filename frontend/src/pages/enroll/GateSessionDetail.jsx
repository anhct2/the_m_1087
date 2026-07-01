import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, Badge, Icon, SimBar, Avatar, Btn, Spinner, Empty } from '../../components/UI'
import { OutgoingAssignModal } from '../../components/OutgoingAssignModal'
import { Lightbox } from '../../components/Lightbox'
import { ClipPlayer } from '../../components/ClipPlayer'
import { STATUS, CONF, CAM_COLORS } from '../enrollData'
import { getGateSessionById, retrySession } from '../../api/client'
import { fmtTime, fmtShortDate, snapUrl, clipUrl, toDateInput } from '../../utils'

/**
 * Chi tiết 1 phiên (khoá bằng door_id, dùng chung với Gate Log). Có thể chưa
 * có enroll_session (chưa xử lý) — vẫn xem clip + gán phòng (chỉ chiều Ra).
 */
function GateSessionBody({ s, onAssignClick, onRetry, onSnap, onClip }) {
  const [sk, sl] = STATUS[s.effective_status] ?? ['dim', s.effective_status]
  const isIn = s.direction === 'incoming'
  const cams = (s.camera_clips ?? []).slice().sort((a, b) => a.camera_order - b.camera_order)
  const gateClips = s.gate_clips ?? []
  const persons = s.persons ?? []
  const who = s.recognized_name
    || (s.person_count > 1 ? `${s.persons_enrolled ?? 0}/${s.person_count} người` : null)
    || (s.enroll_session_id ? 'Chưa nhận diện' : 'Chưa xử lý')

  // Ảnh cho lightbox: gộp cả clip enroll + gate clip có ảnh
  const snapItems = (cams.length ? cams.map(c => ({ id: c.frigate_event_id, cam: c.camera_id })) : gateClips.map(c => ({ id: c.frigate_event_id, cam: c.camera })))
    .filter(x => x.id)
    .map(x => ({ src: snapUrl(x.id), eventId: x.id, caption: `${who} · ${x.cam}` }))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div onClick={() => snapItems.length && onSnap(snapItems, 0)} style={{ cursor: s.snap_event_id ? 'zoom-in' : 'default' }}>
          <Avatar gender={s.recognized_gender} size={52} src={snapUrl(s.snap_event_id)} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{who}</div>
          <div style={{ fontSize: 12, color: 'var(--tlo)', marginTop: 3, fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{isIn ? '↓ Vào' : '↑ Ra'} · {fmtTime(s.event_time_vn)} · {fmtShortDate(s.event_time_vn)}</span>
            <Badge kind="teal">{s.room_label}</Badge>
          </div>
        </div>
        <Link to={`/gate-log?focus=${s.door_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--in)', textDecoration: 'none', border: '1px solid var(--in3)', borderRadius: 7, padding: '6px 10px' }}>
          <Icon name="gate" size={13} />Xem ở Gate Log
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge kind={sk}>{sl}</Badge>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>door_id #{s.door_id}</span>
        {s.gate_method && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>· {s.gate_method}</span>}
        {s.enroll_room_label && <Badge kind="teal">phòng gán: {s.enroll_room_label}</Badge>}
      </div>

      {/* Trạng thái sau khi gán phòng thủ công (chờ worker nhận diện lại) */}
      {!isIn && s.enroll_room_label && !s.recognized_person_id && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--am3)', background: 'var(--amb)', fontSize: 12, color: 'var(--am)' }}>
          Đã gán phòng <strong>{s.enroll_room_label}</strong> · đang chờ worker enroll lại để xác định người trong phòng.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 10, marginBottom: 18 }}>
        {[
          ['Chất lượng', s.overall_quality > 0 ? s.overall_quality.toFixed(2) : '—', 'var(--in)'],
          ['Số người', s.person_count ?? '—', ''],
          ['Dừng ở cam', s.stopped_at_cam || '—', ''],
          ['Thời gian xử lý', s.total_ms ? `${s.total_ms}ms` : '—', ''],
        ].map(([k, v, c], i) => (
          <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--ln)', borderRadius: 9, padding: '11px 13px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--tlo)' }}>{k}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: i === 0 ? 16 : 13, fontWeight: 600, marginTop: i === 0 ? 4 : 6, color: c || 'var(--thi)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Người nhận diện (mỗi người 1 hồ sơ + ảnh riêng) */}
      {persons.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', marginBottom: 10 }}>Người nhận diện ({persons.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {persons.map(p => {
              const [ck, cl] = CONF[p.confidence_lvl] ?? ['dim', 'unknown']
              return (
                <Link key={p.id} to={`/enroll/profiles/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--ln)', textDecoration: 'none', background: 'var(--bg2)' }}>
                  <Avatar gender={p.gender} size={40} src={snapUrl(p.face_event_id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--thi)' }}>{p.display_name || 'Chưa đặt tên'}</div>
                    <div style={{ fontSize: 11, color: 'var(--tlo)' }}>{p.known_room || '—'} · {p.is_new ? 'mới' : 'đã có'}</div>
                  </div>
                  <Badge kind={ck}>{cl}</Badge>
                  <Icon name="chevron" size={14} style={{ color: 'var(--tlo)' }} />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Ảnh / clip từng camera */}
      {cams.length > 0 ? (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', marginBottom: 10 }}>Ảnh / clip từng camera</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
            {cams.map((cam, ci) => (
              <div key={ci}>
                <div onClick={() => cam.frigate_event_id && onSnap(snapItems, snapItems.findIndex(x => x.eventId === cam.frigate_event_id))} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 9, overflow: 'hidden', border: `1px solid ${cam.stopped_here ? 'var(--in3)' : 'var(--ln)'}`, background: `linear-gradient(135deg, ${CAM_COLORS[cam.camera_id] || 'oklch(0.28 0.02 255)'}, oklch(0.15 0.01 255))`, cursor: cam.frigate_event_id ? 'zoom-in' : 'default' }}>
                  {cam.frigate_event_id && <img src={snapUrl(cam.frigate_event_id)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {cam.frigate_event_id && (
                    <button onClick={e => { e.stopPropagation(); onClip(cam.clip_url || clipUrl(cam.frigate_event_id), `${cam.camera_id}`) }} style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'oklch(0 0 0 / 0.45)', border: '1px solid oklch(1 0 0 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Icon name="play" size={16} style={{ color: 'oklch(0.98 0 0)' }} />
                    </button>
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
      ) : gateClips.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', marginBottom: 10 }}>Clip Gate Log (chưa qua enroll)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
            {gateClips.filter(c => c.frigate_event_id).map((cam, ci) => (
              <div key={ci} onClick={() => onSnap(snapItems, snapItems.findIndex(x => x.eventId === cam.frigate_event_id))} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--ln)', cursor: 'zoom-in', background: `linear-gradient(135deg, ${CAM_COLORS[cam.camera] || 'oklch(0.28 0.02 255)'}, oklch(0.15 0.01 255))` }}>
                <img src={snapUrl(cam.frigate_event_id)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={e => { e.stopPropagation(); onClip(cam.clip_url || clipUrl(cam.frigate_event_id), cam.camera) }} style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'oklch(0 0 0 / 0.45)', border: '1px solid oklch(1 0 0 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="play" size={16} style={{ color: 'oklch(0.98 0 0)' }} />
                </button>
                <span style={{ position: 'absolute', top: 8, left: 9, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'oklch(0.95 0.005 255)', background: 'oklch(0 0 0 / 0.4)', padding: '1px 4px', borderRadius: 3 }}>{cam.camera}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {s.manual_assignments?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', marginBottom: 8 }}>Lịch sử gán thủ công</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.manual_assignments.map(m => (
              <div key={m.id} style={{ fontSize: 11.5, color: 'var(--tmd)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge kind="teal">{m.source === 'gate_log' ? 'Gate Log' : 'Enroll'}</Badge>
                <span>{m.display_name || '—'} → {m.room_label || '—'}</span>
                <span style={{ color: 'var(--txl)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>{fmtTime(m.assigned_at)} · {m.assigned_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {!isIn && <Btn variant="primary" onClick={onAssignClick} style={{ flex: 1 }}>＋ Gán phòng</Btn>}
        {s.enroll_session_id && <Btn variant="ghost" onClick={() => retrySession(s.enroll_session_id).then(onRetry)}>↺ Chạy lại</Btn>}
      </div>
    </>
  )
}

function useGateSession(doorId) {
  const [s, setS] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    getGateSessionById(doorId).then(r => setS(r.data)).catch(() => setS(null)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [doorId])
  return { s, loading, load }
}

export function GateSessionDrawer({ doorId, onClose, onChanged }) {
  const { s, loading, load } = useGateSession(doorId)
  const [assigning, setAssigning] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [clip, setClip] = useState(null)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.08 0.005 255 / 0.55)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 540, maxWidth: '94%', background: 'oklch(0.175 0.006 255)', borderLeft: '1px solid var(--ln2)', zIndex: 41, display: 'flex', flexDirection: 'column', boxShadow: '-16px 0 40px oklch(0 0 0 / 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--bg2)' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Chi tiết phiên</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 20 }}>
          {loading || !s ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={20} /></div>
            : <GateSessionBody s={s} onAssignClick={() => setAssigning(true)} onRetry={() => { load(); onChanged?.() }} onSnap={(items, index) => setLightbox({ items, index })} onClip={(src, cap) => setClip({ src, caption: cap })} />}
        </div>
      </div>
      {assigning && s && (
        <OutgoingAssignModal doorId={doorId} date={toDateInput(s.event_time_vn)} defaultRoom={s.room_label} onClose={() => setAssigning(false)} onAssigned={() => { setAssigning(false); load(); onChanged?.() }} />
      )}
      {lightbox && <Lightbox items={lightbox.items} index={lightbox.index} onIndex={i => setLightbox(lb => ({ ...lb, index: i }))} onClose={() => setLightbox(null)} />}
      {clip && <ClipPlayer src={clip.src} caption={clip.caption} onClose={() => setClip(null)} />}
    </>
  )
}

export default function GateSessionPage() {
  const { doorId } = useParams()
  const navigate = useNavigate()
  const { s, loading, load } = useGateSession(doorId)
  const [assigning, setAssigning] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [clip, setClip] = useState(null)

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <button onClick={() => navigate('/enroll/sessions')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--tlo)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <Icon name="chevLeft" size={14} />Phiên nhận diện / <span style={{ color: 'var(--tmd)' }}>door #{doorId}</span>
      </button>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={24} /></div>
        : !s ? <Empty message="Không tìm thấy phiên này" />
        : (
          <Card pad={20} style={{ maxWidth: 680 }}>
            <GateSessionBody s={s} onAssignClick={() => setAssigning(true)} onRetry={load} onSnap={(items, index) => setLightbox({ items, index })} onClip={(src, cap) => setClip({ src, caption: cap })} />
          </Card>
        )}
      {assigning && s && (
        <OutgoingAssignModal doorId={doorId} date={toDateInput(s.event_time_vn)} defaultRoom={s.room_label} onClose={() => setAssigning(false)} onAssigned={load} />
      )}
      {lightbox && <Lightbox items={lightbox.items} index={lightbox.index} onIndex={i => setLightbox(lb => ({ ...lb, index: i }))} onClose={() => setLightbox(null)} />}
      {clip && <ClipPlayer src={clip.src} caption={clip.caption} onClose={() => setClip(null)} />}
    </div>
  )
}
