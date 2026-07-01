import { useState, useEffect, useCallback } from 'react'
import { Card, Badge, DirBadge, Icon, Spinner } from '../components/UI'
import { getSessions, getSessionClips } from '../api/client'
import { fmtTime, fmtShortDate, timeAgo, snapUrl } from '../utils'

const CAM_COLORS = { N1: 'oklch(0.32 0.03 255)', S1: 'oklch(0.30 0.04 200)', S2: 'oklch(0.33 0.03 152)' }
const PAGE = 20

function RoomTag({ children }) {
  return <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--tlo)', background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>{children}</span>
}

// Map backend direction → short key
const dir = d => d === 'incoming' ? 'in' : 'out'

export default function GateLog() {
  const [items, setItems]     = useState([])
  const [total, setTotal]     = useState(0)
  const [offset, setOffset]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [sel, setSel]         = useState(0)
  const [clips, setClips]     = useState([])
  const [clipsLoading, setClipsLoading] = useState(false)

  // Filter state
  const [filterDir, setFilterDir]   = useState('')
  const [filterName, setFilterName] = useState('')
  const [filterRoom, setFilterRoom] = useState('')

  const load = useCallback((off = 0) => {
    setLoading(true)
    const params = { limit: PAGE, offset: off }
    if (filterDir)  params.direction = filterDir
    if (filterName) params.user_name = filterName
    if (filterRoom) params.room      = filterRoom
    getSessions(params)
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setOffset(off); setSel(0) })
      .finally(() => setLoading(false))
  }, [filterDir, filterName, filterRoom])

  useEffect(() => { load(0) }, [])  // initial load

  // Load clips for selected session
  useEffect(() => {
    if (!items.length) return
    const s = items[sel]
    if (!s) return
    setClipsLoading(true)
    getSessionClips(s.session_id)
      .then(r => setClips(r.data))
      .catch(() => setClips([]))
      .finally(() => setClipsLoading(false))
  }, [sel, items])

  const totalPages = Math.ceil(total / PAGE)
  const currentPage = Math.floor(offset / PAGE) + 1
  const se = items[sel]

  // Build 3-camera display for detail panel
  const detailCams = se
    ? [
        { label: 'N1', eventId: se.event_id_n1 },
        { label: 'S1', eventId: se.event_id_s1 },
        { label: 'S2', eventId: se.event_id_s2 },
      ]
    : []

  const chip = { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '6px 11px' }

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 11, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: 3 }}>
          {[['', 'Tất cả'], ['incoming', 'Vào'], ['outgoing', 'Ra']].map(([val, label]) => (
            <span
              key={val}
              onClick={() => setFilterDir(val)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: filterDir === val ? 'var(--bg3)' : 'transparent', color: filterDir === val ? 'var(--thi)' : 'var(--tlo)', fontWeight: filterDir === val ? 500 : 400 }}
            >
              {val && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: val === 'incoming' ? 'var(--in)' : 'var(--out)', marginRight: 6 }} />}
              {label}
            </span>
          ))}
        </div>
        <input
          placeholder="Tên người…"
          value={filterName}
          onChange={e => setFilterName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(0)}
          style={{ background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '7px 11px', color: 'var(--thi)', fontSize: 12.5, fontFamily: 'inherit', width: 150, outline: 'none' }}
        />
        <input
          placeholder="Phòng (P.301,P.302)…"
          value={filterRoom}
          onChange={e => setFilterRoom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(0)}
          style={{ background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '7px 11px', color: 'var(--thi)', fontSize: 12.5, fontFamily: 'inherit', width: 160, outline: 'none' }}
        />
        <button
          onClick={() => load(0)}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--in)', color: 'oklch(0.16 0.03 152)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          <Icon name="search" size={13} />Lọc
        </button>
      </div>

      {/* Split panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 14, height: 'calc(100vh - 200px)' }}>
        {/* Feed */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--bg2)' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Dòng sự kiện</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{loading ? '…' : `${total} bản ghi`}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            ) : items.map((ev, i) => {
              const isIn = ev.direction === 'incoming'
              const selected = i === sel
              const evCams = isIn
                ? [{ label: 'N1', eventId: ev.event_id_n1 }, { label: 'S1', eventId: ev.event_id_s1 }, { label: 'S2', eventId: ev.event_id_s2 }]
                : [{ label: 'S2', eventId: ev.event_id_s2 }, { label: 'S1', eventId: ev.event_id_s1 }, { label: 'N1', eventId: ev.event_id_n1 }]
              const snap = snapUrl(ev.event_id_n1 || ev.event_id_s2 || ev.event_id_s1)
              return (
                <div key={ev.session_id} onClick={() => setSel(i)} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px 12px 16px', borderBottom: '1px solid var(--bg1)', cursor: 'pointer', background: selected ? 'var(--bg2)' : 'transparent' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: isIn ? 'var(--in)' : 'var(--out)', opacity: selected ? 1 : 0.45 }} />
                  <div style={{ textAlign: 'center', minWidth: 46 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{fmtTime(ev.event_time_local)}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--txl)', marginTop: 2 }}>{timeAgo(ev.event_time_local)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {evCams.map(cam => (
                      <div key={cam.label} style={{ width: 38, height: 38, borderRadius: 6, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 2, overflow: 'hidden', background: `linear-gradient(135deg, ${CAM_COLORS[cam.label]}, oklch(0.18 0.01 255))` }}>
                        {cam.eventId && <img src={snapUrl(cam.eventId)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />}
                        <span style={{ position: 'relative', fontFamily: 'var(--mono)', fontSize: 8.5, color: 'oklch(0.92 0.005 255)', background: 'oklch(0.12 0.006 255 / 0.7)', padding: '1px 3px', borderRadius: 3 }}>{cam.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <DirBadge dir={dir(ev.direction)} /><RoomTag>{ev.label}</RoomTag>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.user_name || 'Unknown'}</div>
                    <div style={{ fontSize: 10, color: 'var(--txl)', marginTop: 2, fontFamily: 'var(--mono)' }}>{ev.method} · Δ{ev.delta_seconds?.toFixed(1) ?? '?'}s</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: '1px solid var(--bg2)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)' }}>{total} sự kiện · trang {currentPage}/{totalPages || 1}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span
                onClick={() => offset > 0 && load(offset - PAGE)}
                style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln)', color: offset > 0 ? 'var(--tmd)' : 'var(--txl)', cursor: offset > 0 ? 'pointer' : 'default' }}
              >‹ Trước</span>
              <span
                onClick={() => offset + PAGE < total && load(offset + PAGE)}
                style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln2)', color: offset + PAGE < total ? 'var(--tmd)' : 'var(--txl)', cursor: offset + PAGE < total ? 'pointer' : 'default' }}
              >Sau ›</span>
            </div>
          </div>
        </Card>

        {/* Detail */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          {!se ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txl)', fontSize: 12 }}>Không có dữ liệu</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid var(--bg2)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Chi tiết sự kiện</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>Session #{se.session_id}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>{se.user_name || 'Unknown'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
                      <DirBadge dir={dir(se.direction)} /><RoomTag>{se.label}</RoomTag>
                      <span style={{ fontSize: 11.5, color: 'var(--tlo)', fontFamily: 'var(--mono)' }}>{fmtShortDate(se.event_time_local)} · {fmtTime(se.event_time_local)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, textAlign: 'right', fontSize: 11 }}>
                    <div><span style={{ color: 'var(--txl)' }}>Phương thức </span><span style={{ color: 'var(--in)', fontFamily: 'var(--mono)' }}>{se.method}</span></div>
                    <div><span style={{ color: 'var(--txl)' }}>Score </span><span style={{ color: 'var(--in)', fontFamily: 'var(--mono)' }}>{se.match_score?.toFixed(3) ?? '—'}</span></div>
                  </div>
                </div>

                {clipsLoading ? (
                  <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    {detailCams.map(cam => {
                      const clip = clips.find(c => c.camera === cam.label)
                      const thumbUrl = snapUrl(cam.eventId)
                      return (
                        <div key={cam.label}>
                          <div style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 9, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--ln)', background: `linear-gradient(135deg, ${CAM_COLORS[cam.label]}, oklch(0.16 0.01 255))` }}>
                            {thumbUrl && <img src={thumbUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {!cam.eventId && (
                              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, oklch(1 0 0 / 0.03) 0px, transparent 2px, transparent 4px)' }} />
                            )}
                            {clip?.clip_url && (
                              <a href={clip.clip_url} target="_blank" rel="noreferrer" style={{ position: 'absolute', width: 48, height: 48, borderRadius: '50%', background: 'oklch(1 0 0 / 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                                <Icon name="play" size={20} style={{ color: 'oklch(0.98 0 0)' }} />
                              </a>
                            )}
                            <span style={{ position: 'absolute', top: 9, left: 10, display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'oklch(0.95 0.005 255)', zIndex: 1 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: cam.eventId ? 'var(--in)' : 'var(--alm)' }} />{cam.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                            {thumbUrl && (
                              <a href={thumbUrl} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--tlo)', border: '1px solid var(--ln)', borderRadius: 6, padding: 4, cursor: 'pointer', textDecoration: 'none' }}>Ảnh gốc</a>
                            )}
                            {clip?.clip_url && (
                              <a href={clip.clip_url} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--tlo)', border: '1px solid var(--ln)', borderRadius: 6, padding: 4, cursor: 'pointer', textDecoration: 'none' }}>Tải clip</a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bg2)', fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                  <span style={{ color: 'var(--tlo)' }}>Δ {se.delta_seconds?.toFixed(1) ?? '?'}s</span>
                  <span style={{ color: 'var(--tlo)' }}>score {se.match_score?.toFixed(3) ?? '—'}</span>
                  {se.clip_finalized && <Badge kind="green">clip OK</Badge>}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
