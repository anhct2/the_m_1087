import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Badge, Icon, SimBar, Avatar, Btn, Spinner } from '../components/UI'
import { CONF } from './enrollData'
import { getEnrollProfile, postReenroll } from '../api/client'
import { fmtTime, fmtShortDate, fmtDate, snapUrl } from '../utils'

export default function EnrollProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [p, setP]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [reenrolling, setReenrolling] = useState(false)

  useEffect(() => {
    setLoading(true)
    getEnrollProfile(id)
      .then(r => setP(r.data))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>
  if (!p)      return <div style={{ padding: 40, textAlign: 'center', color: 'var(--txl)' }}>Không tìm thấy hồ sơ</div>

  const [ck, cl] = CONF[p.confidence_lvl] ?? ['dim', p.confidence_lvl ?? 'unknown']
  const thumbSrc = snapUrl(p.face_event_id)

  const metrics = [
    { label: 'Face quality',  value: p.face_quality?.toFixed(2) ?? '—', hi: 'var(--in)' },
    { label: 'Face source',   value: p.face_source_cam || '—' },
    { label: 'Face frames',   value: String(p.face_frame_count ?? '—') },
    { label: 'Enroll count',  value: `${p.enroll_count ?? 0}×` },
    { label: 'Body ratio',    value: p.body_ratio?.toFixed(2) ?? '—' },
  ]

  const faceRows = [
    { label: 'Face quality (avg)', bar: p.face_quality },
    { label: 'Confidence lvl',     text: p.confidence_lvl || '—' },
    { label: 'Source cam',         text: p.face_source_cam || '—' },
    { label: 'Frames đóng góp',    text: `${p.face_frame_count ?? '?'} frames` },
  ]

  const sessions = p.sessions ?? []
  const stays    = p.stays    ?? []

  return (
    <div style={{ padding: '20px 24px' }}>
      <button onClick={() => navigate('/enroll')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--tlo)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <Icon name="chevLeft" size={14} />Enroll / <span style={{ color: 'var(--tmd)' }}>{p.display_name}</span>
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <Avatar gender={p.gender} size={60} src={thumbSrc} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>{p.display_name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Badge kind={ck}>{cl}</Badge>
            <Badge kind="teal">{p.known_room || '—'}</Badge>
            <Badge kind="dim">{p.gender === 'male' ? 'Nam' : p.gender === 'female' ? 'Nữ' : '—'}</Badge>
            {p.age_estimate && <Badge kind="dim">~{p.age_estimate}t</Badge>}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>#{p.id}</span>
          </div>
        </div>
        <Btn
          variant="ghost"
          onClick={() => { setReenrolling(true); postReenroll(p.id).finally(() => setReenrolling(false)) }}
          disabled={reenrolling}
        >
          <Icon name="refresh" size={13} />{reenrolling ? 'Đang xử lý…' : 'Re-enroll'}
        </Btn>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 14 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 11, padding: '13px 15px' }}>
            <div style={{ fontSize: 11, color: 'var(--tlo)' }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 600, marginTop: 6, color: m.hi || 'var(--thi)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Face + appearance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card pad={18}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Đặc trưng khuôn mặt</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {faceRows.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--tlo)' }}>{f.label}</span>
                {f.bar != null
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: 140 }}><SimBar value={f.bar} /><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tmd)' }}>{f.bar.toFixed(2)}</span></span>
                  : <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tmd)' }}>{f.text}</span>}
              </div>
            ))}
          </div>
        </Card>
        <Card pad={18}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Ghi chú ngoại hình</div>
          <div style={{ fontSize: 12.5, color: 'var(--tmd)', lineHeight: 1.7 }}>
            {p.appearance_notes || '—'}
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--tlo)' }}>
            <div><span style={{ color: 'var(--txl)' }}>Lần đầu: </span><span style={{ fontFamily: 'var(--mono)' }}>{fmtDate(p.first_seen_ts)}</span></div>
            <div><span style={{ color: 'var(--txl)' }}>Lần cuối: </span><span style={{ fontFamily: 'var(--mono)' }}>{fmtDate(p.last_seen_ts)}</span></div>
          </div>
        </Card>
      </div>

      {/* Timeline + stays */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
        <Card pad={18}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Lịch sử enroll sessions</div>
          {sessions.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--tlo)' }}>Chưa có session nào</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {sessions.map((t, i) => {
                  const isGood = t.status === 'enrolled'
                  return (
                    <div key={t.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 3, background: isGood ? 'var(--in)' : 'var(--am)' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tmd)' }}>{fmtShortDate(t.event_time_vn)} {fmtTime(t.event_time_vn)}</span>
                          <Badge kind={isGood ? 'green' : 'amber'}>{t.status}</Badge>
                          {t.overall_quality > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{Math.round(t.overall_quality * 100)}%</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--tlo)', marginTop: 4 }}>{t.room_label}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </Card>
        <Card pad={18}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Room stays</div>
          {stays.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--tlo)' }}>Chưa có lịch sử phòng</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stays.map((st, i) => {
                  const active = st.exit_ts == null
                  return (
                    <div key={i} style={{ borderRadius: 10, padding: 13, border: `1px solid ${active ? 'var(--in3)' : 'var(--ln)'}`, background: active ? 'oklch(0.2 0.02 152 / 0.22)' : 'var(--bg1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{st.room_id}</span>
                        <Badge kind={active ? 'green' : 'dim'}>{active ? 'đang ở' : 'đã ra'}</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tlo)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span>Vào: {st.entry_ts ? `${fmtShortDate(st.entry_ts)} ${fmtTime(st.entry_ts)}` : '—'}</span>
                        <span>Ra: {st.exit_ts ? `${fmtShortDate(st.exit_ts)} ${fmtTime(st.exit_ts)}` : '—'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </Card>
      </div>
    </div>
  )
}
