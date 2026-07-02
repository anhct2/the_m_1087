import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Card, Badge, Icon, SimBar, Avatar, Btn, Loading, DirText } from '../components/UI'
import { Lightbox } from '../components/Lightbox'
import { ClipPlayer } from '../components/ClipPlayer'
import { genderText } from './enrollData'
import { ConfBadge } from './enroll/EnrollShell'
import { getEnrollProfile, postReenroll } from '../api/client'
import { fmtTime, fmtShortDate, fmtDate, snapUrl, clipUrl } from '../utils'

// Nhóm clip theo ngày (VN) — mới nhất trước
function groupClipsByDay(clips) {
  const groups = {}
  for (const c of clips) {
    const d = new Date(c.event_time_vn)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    ;(groups[key] ||= []).push(c)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
}

export default function EnrollProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [p, setP]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [reenrolling, setReenrolling] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [clip, setClip] = useState(null)

  useEffect(() => {
    setLoading(true)
    getEnrollProfile(id)
      .then(r => setP(r.data))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loading pad={60} size={24} />
  if (!p)      return <div style={{ padding: 40, textAlign: 'center', color: 'var(--txl)' }}>Không tìm thấy hồ sơ</div>

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

  const sessions   = p.sessions ?? []
  const stays      = p.stays    ?? []
  const manualLog  = p.manual_assignments ?? []
  const clipGroups = groupClipsByDay(p.clips ?? [])

  return (
    <div style={{ padding: '20px 24px' }}>
      <button onClick={() => navigate('/enroll/profiles')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--tlo)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <Icon name="chevLeft" size={14} />Enroll / Profiles / <span style={{ color: 'var(--tmd)' }}>{p.display_name}</span>
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <Avatar gender={p.gender} size={60} src={thumbSrc} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>{p.display_name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <ConfBadge level={p.confidence_lvl} />
            <Badge kind="teal">{p.known_room || '—'}</Badge>
            <Badge kind="dim">{genderText(p.gender)}</Badge>
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

      {/* Ảnh/clip liên quan theo ngày — nhấp ảnh để phóng to, nút play để xem clip */}
      <Card pad={18} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Ảnh / clip liên quan theo ngày</div>
        {clipGroups.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--tlo)' }}>Chưa có clip nào</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {clipGroups.map(([day, dayClips]) => (
                <div key={day}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)', marginBottom: 8 }}>{fmtDate(dayClips[0].event_time_vn)}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {dayClips.map((c, i) => {
                      const lbItems = dayClips.filter(x => x.frigate_event_id).map(x => ({ src: snapUrl(x.frigate_event_id), eventId: x.frigate_event_id, caption: `${x.camera_id} · ${fmtTime(x.event_time_vn)} · ${x.direction === 'incoming' ? 'Vào' : 'Ra'}` }))
                      const lbIndex = lbItems.findIndex(x => x.eventId === c.frigate_event_id)
                      return (
                        <div key={i} style={{ width: 92 }}>
                          <div style={{ position: 'relative', width: 92, height: 69, borderRadius: 8, overflow: 'hidden', border: `1px solid ${c.stopped_here ? 'var(--in3)' : 'var(--ln)'}`, cursor: 'zoom-in' }} onClick={() => setLightbox({ items: lbItems, index: Math.max(0, lbIndex) })}>
                            <img src={snapUrl(c.frigate_event_id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', top: 4, left: 5, fontFamily: 'var(--mono)', fontSize: 9, color: 'oklch(0.95 0.005 255)', background: 'oklch(0 0 0 / 0.5)', padding: '1px 4px', borderRadius: 3 }}>{c.camera_id}</span>
                            <span style={{ position: 'absolute', top: 4, right: 5, fontFamily: 'var(--mono)', fontSize: 8.5, color: c.direction === 'incoming' ? 'var(--in)' : 'var(--out)', background: 'oklch(0 0 0 / 0.5)', padding: '1px 4px', borderRadius: 3 }}>{c.direction === 'incoming' ? 'VÀO' : 'RA'}</span>
                            <button onClick={e => { e.stopPropagation(); setClip({ src: c.clip_url || clipUrl(c.frigate_event_id), caption: `${c.camera_id} · ${fmtTime(c.event_time_vn)}` }) }} style={{ position: 'absolute', bottom: 4, right: 5, width: 22, height: 22, borderRadius: '50%', background: 'oklch(0 0 0 / 0.55)', border: '1px solid oklch(1 0 0 / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="play" size={11} style={{ color: 'oklch(0.98 0 0)' }} /></button>
                          </div>
                          <Link to={`/enroll/sessions/gate/${c.door_id}`} style={{ display: 'block', fontSize: 9.5, color: 'var(--in)', marginTop: 3, textAlign: 'center', fontFamily: 'var(--mono)', textDecoration: 'none' }}>{fmtTime(c.event_time_vn)}</Link>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Card>

      {/* Timeline + stays */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
        <Card pad={18}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Lịch sử phiên enroll (map với Gate Log)</div>
          {sessions.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--tlo)' }}>Chưa có phiên nào</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sessions.map((t) => {
                  const isGood = t.status === 'enrolled'
                  return (
                    <div key={t.id} style={{ display: 'flex', gap: 12, padding: '8px 6px', borderRadius: 8, alignItems: 'center' }}>
                      <Avatar gender={p.gender} size={30} src={snapUrl(t.snap_event_id)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <DirText dir={t.direction} />
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tmd)' }}>{fmtShortDate(t.event_time_vn)} {fmtTime(t.event_time_vn)}</span>
                          <Badge kind={isGood ? 'green' : 'amber'}>{t.room_label}</Badge>
                          {t.overall_quality > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{Math.round(t.overall_quality * 100)}%</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {t.door_id && <Link to={`/enroll/sessions/gate/${t.door_id}`} title="Chi tiết phiên" style={{ display: 'flex', width: 24, height: 24, borderRadius: 6, border: '1px solid var(--ln)', alignItems: 'center', justifyContent: 'center', color: 'var(--tlo)' }}><Icon name="users" size={11} /></Link>}
                        {t.door_id && <Link to={`/gate-log?focus=${t.door_id}`} title="Xem ở Gate Log" style={{ display: 'flex', width: 24, height: 24, borderRadius: 6, border: '1px solid var(--ln)', alignItems: 'center', justifyContent: 'center', color: 'var(--tlo)' }}><Icon name="gate" size={11} /></Link>}
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

      {manualLog.length > 0 && (
        <Card pad={18} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Lịch sử gán thủ công</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {manualLog.map(m => (
              <div key={m.id} style={{ fontSize: 12, color: 'var(--tmd)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge kind="teal">{m.source === 'gate_log' ? 'Gate Log' : 'Enroll'}</Badge>
                <span>{m.room_label || '—'}</span>
                <Link to={`/gate-log?focus=${m.door_id}`} style={{ fontSize: 11, color: 'var(--in)', textDecoration: 'none' }}>door #{m.door_id}</Link>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>{fmtDate(m.assigned_at)} {fmtTime(m.assigned_at)} · {m.assigned_by}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {lightbox && <Lightbox items={lightbox.items} index={lightbox.index} onIndex={i => setLightbox(lb => ({ ...lb, index: i }))} onClose={() => setLightbox(null)} />}
      {clip && <ClipPlayer src={clip.src} caption={clip.caption} onClose={() => setClip(null)} />}
    </div>
  )
}
