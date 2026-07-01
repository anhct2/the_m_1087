import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, Badge, Icon, SimBar, Avatar, Btn, Spinner, Empty } from '../../components/UI'
import { AssignPersonModal } from '../../components/AssignPersonModal'
import { STATUS, CAM_COLORS } from '../enrollData'
import { getGateSessionById, assignGateSession, retrySession } from '../../api/client'
import { fmtTime, fmtShortDate, snapUrl } from '../../utils'

/**
 * Nội dung chi tiết 1 gate session (khoá bằng door_id — dùng chung với
 * Gate Log). Có thể chưa có enroll_session_id (chưa được xử lý) — vẫn cho
 * xem clip gate + gán người thủ công, lúc đó BE sẽ tạo enroll_session tại chỗ.
 */
function GateSessionBody({ s, onAssignClick, onRetry }) {
  const [sk, sl] = STATUS[s.effective_status] ?? ['dim', s.effective_status]
  const isIn = s.direction === 'incoming'
  const cams = (s.camera_clips ?? []).slice().sort((a, b) => a.camera_order - b.camera_order)
  const gateClips = s.gate_clips ?? []
  const who = s.recognized_name
    || (s.person_count > 1 ? `${s.persons_enrolled ?? 0}/${s.person_count} người` : null)
    || (s.enroll_session_id ? 'Chưa nhận diện' : 'Chưa xử lý')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Avatar gender={s.recognized_gender} size={52} src={snapUrl(s.snap_event_id)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{who}</div>
          <div style={{ fontSize: 12, color: 'var(--tlo)', marginTop: 3, fontFamily: 'var(--mono)' }}>
            {isIn ? '↓ Vào' : '↑ Ra'} · {fmtTime(s.event_time_vn)} · {fmtShortDate(s.event_time_vn)} · <Badge kind="teal">{s.room_label}</Badge>
          </div>
        </div>
        <Link to={`/gate-log?focus=${s.door_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--in)', textDecoration: 'none', border: '1px solid var(--in3)', borderRadius: 7, padding: '6px 10px' }}>
          <Icon name="gate" size={13} />Xem ở Gate Log
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Badge kind={sk}>{sl}</Badge>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>door_id #{s.door_id}</span>
        {s.gate_method && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>· {s.gate_method}</span>}
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

      {cams.length > 0 ? (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', marginBottom: 10 }}>Kết quả từng camera (enroll)</div>
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
      ) : gateClips.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', marginBottom: 10 }}>Clip gate log (chưa qua enroll)</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(gateClips.length, 3)},1fr)`, gap: 10, marginBottom: 20 }}>
            {gateClips.slice(0, 3).map((cam, ci) => (
              <div key={ci} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--ln)', background: `linear-gradient(135deg, ${CAM_COLORS[cam.camera] || 'oklch(0.28 0.02 255)'}, oklch(0.15 0.01 255))` }}>
                {cam.frigate_event_id && <img src={snapUrl(cam.frigate_event_id)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
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
        <Btn variant="primary" onClick={onAssignClick} style={{ flex: 1 }}>＋ Gán phòng / người</Btn>
        {s.enroll_session_id && <Btn variant="ghost" onClick={() => retrySession(s.enroll_session_id).then(onRetry)}>↺ Retry</Btn>}
      </div>
    </>
  )
}

export function GateSessionDrawer({ doorId, onClose, onChanged }) {
  const [s, setS]           = useState(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)

  function load() {
    setLoading(true)
    getGateSessionById(doorId).then(r => setS(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [doorId])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.08 0.005 255 / 0.55)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '92%', background: 'oklch(0.175 0.006 255)', borderLeft: '1px solid var(--ln2)', zIndex: 41, display: 'flex', flexDirection: 'column', boxShadow: '-16px 0 40px oklch(0 0 0 / 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--bg2)' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Chi tiết session</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 20 }}>
          {loading || !s ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={20} /></div>
            : <GateSessionBody s={s} onAssignClick={() => setAssigning(true)} onRetry={() => { load(); onChanged?.() }} />}
        </div>
      </div>
      {assigning && s && (
        <AssignPersonModal
          title="Gán phòng / người cho session"
          defaultRoom={s.room_label}
          onClose={() => setAssigning(false)}
          onAssign={payload => assignGateSession(doorId, { ...payload, source: 'enroll' }).then(() => { load(); onChanged?.() })}
        />
      )}
    </>
  )
}

export default function GateSessionPage() {
  const { doorId } = useParams()
  const navigate = useNavigate()
  const [s, setS] = useState(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)

  function load() {
    setLoading(true)
    getGateSessionById(doorId).then(r => setS(r.data)).catch(() => setS(null)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [doorId])

  return (
    <div style={{ padding: '20px 24px' }}>
      <button onClick={() => navigate('/enroll/sessions')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--tlo)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <Icon name="chevLeft" size={14} />Enroll / Sessions / <span style={{ color: 'var(--tmd)' }}>door #{doorId}</span>
      </button>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={24} /></div>
        : !s ? <Empty message="Không tìm thấy session này" />
        : (
          <Card pad={20} style={{ maxWidth: 640 }}>
            <GateSessionBody s={s} onAssignClick={() => setAssigning(true)} onRetry={load} />
          </Card>
        )}
      {assigning && s && (
        <AssignPersonModal
          title="Gán phòng / người cho session"
          defaultRoom={s.room_label}
          onClose={() => setAssigning(false)}
          onAssign={payload => assignGateSession(doorId, { ...payload, source: 'enroll' }).then(load)}
        />
      )}
    </div>
  )
}
