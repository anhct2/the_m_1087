import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getSessions, getSessionClips, getEnrollByUnlockAll, assignSession, searchProfiles } from '../api/client'
import { Icon, DirBadge, MethodTag, Spinner, Empty, ColHead } from '../components/UI'
import s from './GateLog.module.css'

const VN_TZ = 'Asia/Ho_Chi_Minh'
const PAGE   = 50
const ROOMS  = [
  'P.201','P.202','P.301','P.302','P.401','P.402',
  'P.501','P.502','P.601','P.602','P.701','P.702',
]

const snapProxy = eventId =>
  eventId ? `/api/media/snapshot/${eventId}` : null

const fmt = {
  time: iso => iso ? new Date(iso).toLocaleTimeString('vi-VN', {
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:VN_TZ
  }) : '—',
  datetime: iso => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:VN_TZ })
         + ' · '
         + d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:VN_TZ })
  },
  ago: iso => {
    if (!iso) return ''
    const sec = Math.round((Date.now() - new Date(iso)) / 1000)
    if (sec < 60) return 'vừa xong'
    const min = Math.floor(sec / 60)
    return min < 60 ? `${min}m trước` : `${Math.floor(min/60)}h trước`
  },
}
const todayStr     = () => new Date().toLocaleDateString('sv-SE', { timeZone: VN_TZ })
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toLocaleDateString('sv-SE', { timeZone:VN_TZ }) }

/* ── Fullscreen lightbox (Facebook-style) ───────────────────── */
function Lightbox({ sessions, idx, camera, onClose, onNav }) {
  const sess    = sessions[idx]
  const hasPrev = idx > 0
  const hasNext = idx < sessions.length - 1
  const [imgErr, setImgErr] = useState(false)

  const prevKey = useRef(null)
  const key = `${idx}-${camera}`
  if (prevKey.current !== key) { prevKey.current = key; if (imgErr) setImgErr(false) }

  const eventId = camera === 'N1' ? sess.event_id_n1
                : camera === 'S2' ? sess.event_id_s2
                : sess.event_id_s1
  const src     = snapProxy(eventId)
  const isIn    = sess.direction === 'incoming'

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft'  && hasPrev) onNav(idx - 1)
      if (e.key === 'ArrowRight' && hasNext) onNav(idx + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [idx, hasPrev, hasNext, onClose, onNav])

  return (
    <div className={s.lbOverlay} onClick={onClose}>
      {/* Camera tag */}
      <span className={s.lbCamTag}>{camera}</span>

      {/* Close */}
      <button className={s.lbClose} onClick={onClose}>
        <Icon name="x" size={18} />
      </button>

      {/* Image */}
      {src && !imgErr
        ? <img
            src={src} alt={camera} className={s.lbImg}
            onClick={e => e.stopPropagation()}
            onError={() => setImgErr(true)}
          />
        : <div className={s.lbNoSig} onClick={e => e.stopPropagation()}>
            NO SIGNAL
          </div>
      }

      {/* Nav arrows */}
      <button
        className={`${s.lbNav} ${s.lbNavLeft}`}
        disabled={!hasPrev}
        onClick={e => { e.stopPropagation(); onNav(idx - 1) }}
      >
        <Icon name="chevLeft" size={24} />
      </button>
      <button
        className={`${s.lbNav} ${s.lbNavRight}`}
        disabled={!hasNext}
        onClick={e => { e.stopPropagation(); onNav(idx + 1) }}
      >
        <Icon name="chevron" size={24} />
      </button>

      {/* Bottom meta */}
      <div className={s.lbMeta}>
        <span className={s.lbMetaName}>{sess.user_name || 'Unknown'}</span>
        <span className={s.lbMetaDir} style={{ color: isIn ? 'var(--in)' : 'var(--out)' }}>
          {isIn ? '↓ Vào' : '↑ Ra'}{sess.label && sess.label !== sess.user_name ? ` · ${sess.label}` : ''}
        </span>
        <span className={s.lbMetaTime}>{fmt.datetime(sess.event_time_local)}</span>
        <span className={s.lbCounter}>{idx + 1} / {sessions.length}</span>
      </div>
    </div>
  )
}

/* ── Room multi-select picker ────────────────────────────────── */
function RoomPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = room =>
    onChange(value.includes(room) ? value.filter(r => r !== room) : [...value, room])

  const label = value.length === 0 ? 'Tất cả phòng'
    : value.length === 1 ? value[0]
    : `${value.length} phòng`

  return (
    <div className={s.roomPicker} ref={ref}>
      <button
        className={`${s.pickerTrigger} ${value.length > 0 ? s.pickerTriggerOn : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {label}
        <Icon name="chevron" size={10} style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className={s.pickerDropdown}>
          <div className={s.pickerGrid}>
            {ROOMS.map(r => (
              <label key={r} className={`${s.pickerItem} ${value.includes(r) ? s.pickerItemOn : ''}`}>
                <input type="checkbox" checked={value.includes(r)} onChange={() => toggle(r)} />
                {r}
              </label>
            ))}
          </div>
          {value.length > 0 && (
            <button className={s.pickerClear} onClick={() => onChange([])}>Xóa bộ lọc</button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Thumb ────────────────────────────────────────────────────── */
const Thumb = memo(function Thumb({ src, label, showRec }) {
  const [err, setErr] = useState(false)
  const prevSrc = useRef(null)
  if (prevSrc.current !== src) { prevSrc.current = src; if (err) setErr(false) }

  return (
    <div className={s.thumb}>
      {src && !err
        ? <img src={src} alt={label} className={s.thumbImg} onError={() => setErr(true)} />
        : <div className={s.thumbEmpty} />}
      <span className={s.thumbLabel}>{label}</span>
      {showRec && <span className={s.recDot} />}
    </div>
  )
})

function TriThumb({ direction, eventIdN1, eventIdS1, eventIdS2, onThumbClick }) {
  const isIn = direction === 'incoming'
  const cams = isIn
    ? [{ label:'N1', id:eventIdN1 }, { label:'S1', id:eventIdS1 }, { label:'S2', id:eventIdS2, rec:true }]
    : [{ label:'S2', id:eventIdS2, rec:true }, { label:'S1', id:eventIdS1 }, { label:'N1', id:eventIdN1 }]
  return (
    <div className={s.dualThumb}>
      {cams.map(c => (
        <div key={c.label} className={s.thumbWrap}
          onClick={e => { e.stopPropagation(); onThumbClick(c.label) }}
          title={`Xem ảnh ${c.label} fullscreen`}
        >
          <Thumb src={snapProxy(c.id)} label={c.label} showRec={!!c.rec} />
        </div>
      ))}
    </div>
  )
}

/* ── Cam pane ─────────────────────────────────────────────────── */
function CamPane({ camera, eventId, clipUrl, finalized }) {
  const [showVideo, setShowVideo] = useState(false)
  const [snapErr,   setSnapErr]   = useState(false)
  const prevId = useRef(null)
  if (prevId.current !== eventId) {
    prevId.current = eventId
    if (snapErr) setSnapErr(false)
    if (showVideo) setShowVideo(false)
  }

  const proxySnap = snapProxy(eventId)

  return (
    <div className={s.camPane}>
      {showVideo ? (
        <video controls autoPlay preload="metadata" className={s.camVideo}>
          <source src={clipUrl} type="video/mp4" />
        </video>
      ) : (
        <>
          {proxySnap && !snapErr
            ? <img className={s.camSnap} src={proxySnap} alt={camera} onError={() => setSnapErr(true)} />
            : <div className={s.camNoSignal}><span>NO SIGNAL</span></div>}
          {finalized && clipUrl && (
            <div className={s.camOverlay} onClick={() => setShowVideo(true)}>
              <div className={s.playBtn}><Icon name="play" size={22} /></div>
            </div>
          )}
        </>
      )}
      <div className={s.camLabel}>● {camera}</div>
    </div>
  )
}

/* ── Detail panel ─────────────────────────────────────────────── */
function DetailPanel({ sessionId, sessionDir, enrollKey }) {
  const navigate  = useNavigate()
  const [clips,       setClips]   = useState(null)
  const [showAll,     setShowAll] = useState(false)
  const [loading,     setLoading] = useState(false)
  const [enrollInfo,  setEnroll]  = useState(null)
  const [showAssign,  setShowAssign] = useState(false)
  const [assignQ,     setAssignQ]   = useState('')
  const [assignRes,   setAssignRes] = useState([])
  const [assigning,   setAssigning] = useState(false)
  const assignTimer   = useRef(null)
  const enrollGenRef  = useRef(0)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setLoading(true); setClips(null); setShowAll(false); setEnroll(null); setShowAssign(false)
    getSessionClips(sessionId)
      .then(r => { if (!cancelled) setClips(r.data) })
      .catch(() => { if (!cancelled) setClips([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId])

  const reloadEnroll = useCallback((key) => {
    if (!key) { setEnroll(null); return }
    const gen = ++enrollGenRef.current
    getEnrollByUnlockAll(key)
      .then(r => { if (enrollGenRef.current === gen) setEnroll(r.data || {}) })
      .catch(() => {})
  }, [])

  useEffect(() => { reloadEnroll(enrollKey) }, [enrollKey, reloadEnroll])

  useEffect(() => {
    if (!showAssign) return
    clearTimeout(assignTimer.current)
    assignTimer.current = setTimeout(async () => {
      try { const { data } = await searchProfiles(assignQ); setAssignRes(data) } catch {}
    }, 250)
    return () => clearTimeout(assignTimer.current)
  }, [assignQ, showAssign])

  const doAssign = async (profileId) => {
    if (!enrollInfo?.outgoing?.id) return
    setAssigning(true)
    try {
      await assignSession(enrollInfo.outgoing.id, { profile_id: profileId })
      setShowAssign(false)
      reloadEnroll(enrollKey)
    } catch (e) {
      alert(e.response?.data?.detail || 'Lỗi khi gán')
    } finally { setAssigning(false) }
  }

  if (!sessionId) return (
    <div className={s.detEmpty}>
      <div className={s.detEmptyIcon}>⬡</div>
      <p>Chọn sự kiện bên trái để xem</p>
    </div>
  )
  if (loading) return <div className={s.detCenter}><Spinner size={22} /></div>
  if (!clips?.length) return <div className={s.detEmpty}><p>Không có clip nào</p></div>

  const best     = clips.find(c => c.is_best_match) || clips[0]
  const isIn     = (sessionDir || best.direction) === 'incoming'
  const camOrder = isIn ? ['N1', 'S1', 'S2'] : ['S2', 'S1', 'N1']
  const camClips = camOrder.map(lbl => ({
    label: lbl,
    clip:  clips.find(c => c.camera === lbl && c.is_best_match) || clips.find(c => c.camera === lbl) || null,
  }))
  const relAll   = clips.filter(c => !c.is_best_match)

  return (
    <div className={s.detScroll}>
      <div className={s.detInfoRow}>
        <div className={s.detInfoMain}>
          <div className={s.detName}>{best.user_name || 'Unknown'}</div>
          <div className={s.detSub}>
            <DirBadge dir={best.direction} />
            {best.label && <span className={s.detRoom}>{best.label}</span>}
            <span className={s.detTime}>{fmt.datetime(best.start_local)}</span>
          </div>
        </div>
        <div className={s.detMeta}>
          <div className={s.detMetaRow}>
            <span className={s.mk}>Phương thức</span>
            <span className={s.mv}><MethodTag method={best.method}/></span>
          </div>
          <div className={s.detMetaRow}>
            <span className={s.mk}>Frigate ID</span>
            <span className={s.mv} style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--txl)',wordBreak:'break-all'}}>
              {best.frigate_event_id}
            </span>
          </div>
          {enrollInfo?.incoming && (
            <div className={s.detMetaRow}>
              <span className={s.mk}>Enroll ↓</span>
              <span className={s.mv}>
                <span
                  title="Xem trong Enroll"
                  style={{ cursor: 'pointer', color: enrollInfo.incoming.status === 'enrolled' ? 'var(--in)' : 'var(--tmd)',
                           textDecoration: 'underline', textUnderlineOffset: 3 }}
                  onClick={() => navigate('/enroll?tab=sessions')}
                >
                  {enrollInfo.incoming.status} · {enrollInfo.incoming.persons_enrolled}/{enrollInfo.incoming.person_count} người
                </span>
              </span>
            </div>
          )}
          {enrollInfo?.outgoing && (
            <div className={s.detMetaRow}>
              <span className={s.mk}>Nhận diện ↑</span>
              <span className={s.mv}>
                {enrollInfo.outgoing.recognized_name ? (
                  <span style={{ color: 'var(--in)' }}>
                    {enrollInfo.outgoing.recognized_name}
                    {enrollInfo.outgoing.recognized_room && ` · ${enrollInfo.outgoing.recognized_room}`}
                    {enrollInfo.outgoing.recognition_sim != null
                      ? ` (${(enrollInfo.outgoing.recognition_sim * 100).toFixed(0)}%)`
                      : ''}
                  </span>
                ) : (
                  <span style={{ color: 'var(--tmd)', display:'inline-flex', alignItems:'center', gap:6 }}>
                    {enrollInfo.outgoing.status} · chưa nhận diện
                    <button
                      style={{ fontSize:10, padding:'2px 6px', background:'var(--su)', color:'var(--tx)', border:'1px solid var(--bd)', borderRadius:4, cursor:'pointer' }}
                      onClick={() => { setShowAssign(v => !v); setAssignQ(''); setAssignRes([]) }}
                    >
                      {showAssign ? 'Đóng' : 'Gán người'}
                    </button>
                  </span>
                )}
              </span>
            </div>
          )}
          {showAssign && enrollInfo?.outgoing && !enrollInfo.outgoing.recognized_name && (
            <div style={{ gridColumn:'1/-1', margin:'4px 0', background:'var(--su)', border:'1px solid var(--bd)', borderRadius:6, padding:10 }}>
              <input
                autoFocus
                style={{ width:'100%', background:'var(--bg)', color:'var(--tx)', border:'1px solid var(--bd)', borderRadius:4, padding:'4px 8px', fontSize:12, boxSizing:'border-box' }}
                placeholder="Tìm theo tên hoặc phòng…"
                value={assignQ}
                onChange={e => setAssignQ(e.target.value)}
              />
              <div style={{ maxHeight:150, overflowY:'auto', marginTop:6 }}>
                {assignRes.length === 0 && <div style={{ fontSize:11, color:'var(--tmd)', padding:'4px 0' }}>Không tìm thấy</div>}
                {assignRes.map(p => (
                  <div key={p.id}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 4px', cursor:'pointer', borderRadius:4 }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--hv)'}
                    onMouseLeave={e => e.currentTarget.style.background=''}
                    onClick={() => doAssign(p.id)}
                  >
                    <span style={{ fontSize:11, fontWeight:600 }}>{p.display_name || `?${p.id.slice(0,6)}`}</span>
                    <span style={{ fontSize:10, color:'var(--tmd)' }}>{p.known_room}</span>
                    {assigning && <Spinner size={10} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={s.camGrid}>
        {camClips.map(({ label, clip }) => (
          <div key={label} className={s.camWrap}>
            <CamPane
              camera={label}
              eventId={clip?.frigate_event_id}
              clipUrl={clip?.clip_url}
              finalized={clip?.clip_finalized}
            />
            {(clip?.snapshot_url || (clip?.clip_finalized && clip?.clip_url)) && (
              <div className={s.camFooter}>
                {clip?.snapshot_url && (
                  <a className={s.camActBtn} href={clip.snapshot_url} target="_blank" rel="noreferrer">
                    <Icon name="expand" size={9}/>Ảnh gốc
                  </a>
                )}
                {clip?.clip_finalized && clip?.clip_url && (
                  <a className={s.camActBtn} href={clip.clip_url} target="_blank" rel="noreferrer" download>
                    <Icon name="film" size={9}/>Tải clip
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={s.clipMeta}>
        <span className={s.cmStat}>Δ {parseFloat(best.delta_seconds||0).toFixed(1)}s</span>
        {best.frigate_score && <span className={s.cmStat}>{(best.frigate_score*100).toFixed(1)}% conf</span>}
        <span className={s.cmStat} style={{color:'var(--in)'}}>score {parseFloat(best.match_score||0).toFixed(3)}</span>
        <div className={s.cmActions}>
          {relAll.length > 0 && (
            <button className={`${s.cmBtn} ${s.cmBtnGhost}`} onClick={() => setShowAll(v => !v)}>
              <Icon name="expand" size={11}/>{showAll ? 'Ẩn bớt' : `${relAll.length} clip liên quan`}
            </button>
          )}
        </div>
      </div>

      {showAll && relAll.length > 0 && (
        <div className={s.relSection}>
          <div className={s.relTitle}>Tất cả clip liên quan ({relAll.length})</div>
          <div className={s.relGrid}>
            {relAll.map((c, i) => (
              <div key={i} className={s.relCard} onClick={() => c.clip_url && window.open(c.clip_url,'_blank')}>
                {c.frigate_event_id
                  ? <img className={s.relThumb} src={snapProxy(c.frigate_event_id)} alt={c.camera} loading="lazy" onError={e=>{e.target.style.display='none'}}/>
                  : <div className={s.relThumb}/>}
                <div className={s.relInfo}>
                  <span className={s.relCam}>{c.camera}</span>
                  <span>Δ{parseFloat(c.delta_seconds||0).toFixed(1)}s · <span style={{color:'var(--in)'}}>{parseFloat(c.match_score||0).toFixed(2)}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Event row ────────────────────────────────────────────────── */
const EventRow = memo(function EventRow({ session, selected, onClick, onThumbClick }) {
  const isIn = session.direction === 'incoming'
  return (
    <div className={`${s.evRow} ${selected ? s.evSelected : ''} ${isIn ? s.evIn : s.evOut}`} onClick={onClick}>
      <div className={s.evTime}>
        <div className={s.evTimeMain}>{fmt.time(session.event_time_local)}</div>
        <div className={s.evTimeAgo}>{fmt.ago(session.event_time_local)}</div>
      </div>
      <TriThumb
        direction={session.direction}
        eventIdN1={session.event_id_n1}
        eventIdS1={session.event_id_s1}
        eventIdS2={session.event_id_s2}
        onThumbClick={onThumbClick}
      />
      <div className={s.evMeta}>
        <div className={s.evRow1}>
          <DirBadge dir={session.direction} />
          {session.label && session.label !== session.user_name && <span className={s.evRoom}>{session.label}</span>}
          <span className={s.evUser}>{session.user_name || 'Unknown'}</span>
        </div>
        <div className={s.evRow2}>
          <MethodTag method={session.method} />
          {session.delta_seconds != null && <span className={s.evDelta}>Δ{parseFloat(session.delta_seconds).toFixed(1)}s</span>}
        </div>
      </div>
      <Icon name="chevron" size={13} style={{ color:'var(--txl)', alignSelf:'center', flexShrink:0 }} />
    </div>
  )
})

/* ── Filter bar ───────────────────────────────────────────────── */
function FilterBar({ onApply, defaultFilters }) {
  const [f, setF] = useState(defaultFilters || {
    since: yesterdayStr(), until: todayStr(),
    direction: '', user_name: '', rooms: [],
  })
  const set = (k, v) => setF(p => ({...p, [k]: v}))
  const dirs = [['','Tất cả'],['incoming','Vào'],['outgoing','Ra']]

  return (
    <div className={s.filters}>
      <div className={s.fdate}>
        <Icon name="calendar" size={13} style={{color:'var(--txl)'}}/>
        <input type="date" className={s.dateInput} value={f.since}
          onChange={e => set('since', e.target.value)} onKeyDown={e => e.key==='Enter' && onApply(f)}/>
        <span className={s.dateSep}>→</span>
        <input type="date" className={s.dateInput} value={f.until}
          onChange={e => set('until', e.target.value)} onKeyDown={e => e.key==='Enter' && onApply(f)}/>
      </div>
      <span className={s.flabel}>Chiều</span>
      <div className={s.fgroup}>
        {dirs.map(([k,l]) => (
          <button key={k} className={`${s.fbtn} ${f.direction===k?s.fbtnOn:''}`}
            onClick={() => set('direction', k)}>
            {k && <span className={s.fswitch} style={{background:k==='incoming'?'var(--in)':'var(--out)'}}/>}{l}
          </button>
        ))}
      </div>
      <span className={s.flabel}>Người</span>
      <input className={s.finput} placeholder="Tên người..." value={f.user_name}
        onChange={e => set('user_name', e.target.value)} onKeyDown={e => e.key==='Enter' && onApply(f)}/>
      <span className={s.flabel}>Phòng</span>
      <RoomPicker value={f.rooms} onChange={rooms => set('rooms', rooms)} />
      <button className={s.applyBtn} onClick={() => onApply(f)}>
        <Icon name="search" size={13}/>Lọc
      </button>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function GateLog() {
  const [searchParams]  = useSearchParams()
  const [sessions,  setSessions]  = useState(null)
  const [total,     setTotal]     = useState(0)
  const [offset,    setOffset]    = useState(0)
  const [selSess,   setSelSess]   = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [lb,        setLb]        = useState(null)   // { idx, camera }
  const [feedWidth, setFeedWidth] = useState(33.3)   // 1/3 + 2/3

  const initFilters = {
    since:     searchParams.get('since')     || yesterdayStr(),
    until:     searchParams.get('until')     || todayStr(),
    direction: searchParams.get('direction') || '',
    user_name: searchParams.get('user_name') || '',
    rooms:     searchParams.get('room')      ? [searchParams.get('room')] : [],
  }

  const filtersRef    = useRef(initFilters)
  const offsetRef     = useRef(0)
  const bodyRef       = useRef(null)
  const isResizingRef = useRef(false)

  useEffect(() => {
    const onMove = e => {
      if (!isResizingRef.current || !bodyRef.current) return
      const rect = bodyRef.current.getBoundingClientRect()
      const pct  = ((e.clientX - rect.left) / rect.width) * 100
      setFeedWidth(Math.min(Math.max(pct, 22), 74))
    }
    const onUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false
        document.body.style.cursor    = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [])

  const load = useCallback(async (filters, off = 0) => {
    filtersRef.current = filters
    offsetRef.current  = off
    setLoading(true); setSessions(null)
    try {
      const p = { offset: off, limit: PAGE }
      if (filters.since)         p.since     = filters.since
      if (filters.until)         p.until     = filters.until + 'T23:59:59'
      if (filters.direction)     p.direction = filters.direction
      if (filters.user_name)     p.user_name = filters.user_name
      if (filters.rooms?.length) p.room      = filters.rooms.join(',')
      const { data } = await getSessions(p)
      setSessions(data.items); setTotal(data.total); setOffset(off)
    } catch { setSessions([]) }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { load(filtersRef.current, 0) }, [load])

  const handleApply = useCallback(f  => load(f, 0), [load])
  const handlePrev  = useCallback(() => load(filtersRef.current, offsetRef.current - PAGE), [load])
  const handleNext  = useCallback(() => load(filtersRef.current, offsetRef.current + PAGE), [load])

  return (
    <div className={s.page}>
      <FilterBar onApply={handleApply} defaultFilters={initFilters} />
      <div className={s.body} ref={bodyRef} style={{'--feed-w': `${feedWidth}%`}}>
        <div className={s.feedCol}>
          <ColHead title="Dòng sự kiện" right={`${total} bản ghi`} />
          <div className={s.feed}>
            {loading && <div className={s.loadRow}><Spinner size={18}/><span>Đang tải...</span></div>}
            {!loading && sessions?.length === 0 && <Empty message="Không có dữ liệu"/>}
            {sessions?.map((sess, idx) => (
              <EventRow
                key={`${sess.session_id}-${sess.event_time_local}`}
                session={sess}
                selected={selSess?.id === sess.session_id}
                onClick={() => setSelSess({
                  id: sess.session_id,
                  direction: sess.direction,
                  enrollKey: sess.direction === 'outgoing' ? String(sess.session_id) : sess.unlock_id,
                })}
                onThumbClick={camera => setLb({ idx, camera })}
              />
            ))}
          </div>
          <div className={s.pag}>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--tlo)'}}>
              {total} sự kiện · trang {Math.floor(offset/PAGE)+1}/{Math.ceil(total/PAGE)||1}
            </span>
            <div style={{display:'flex',gap:6}}>
              <button className={s.pagBtn} disabled={offset===0} onClick={handlePrev}>‹ Trước</button>
              <button className={s.pagBtn} disabled={offset+PAGE>=total} onClick={handleNext}>Sau ›</button>
            </div>
          </div>
        </div>

        <div
          className={s.resizer}
          onMouseDown={e => {
            isResizingRef.current       = true
            document.body.style.cursor    = 'col-resize'
            document.body.style.userSelect = 'none'
            e.preventDefault()
          }}
        />

        <div className={s.detCol}>
          <ColHead title="Chi tiết sự kiện" right={selSess ? `Session #${selSess.id}` : 'Chọn sự kiện bên trái'} />
          <DetailPanel sessionId={selSess?.id} sessionDir={selSess?.direction} enrollKey={selSess?.enrollKey} />
        </div>
      </div>

      {lb != null && sessions && (
        <Lightbox
          sessions={sessions}
          idx={lb.idx}
          camera={lb.camera}
          onClose={() => setLb(null)}
          onNav={newIdx => setLb(prev => ({...prev, idx: newIdx}))}
        />
      )}
    </div>
  )
}
