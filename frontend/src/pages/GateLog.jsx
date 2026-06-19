import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { getSessions, getSessionClips } from '../api/client'
import { Icon, DirBadge, MethodTag, Spinner, Empty, ColHead } from '../components/UI'
import s from './GateLog.module.css'

const VN_TZ = 'Asia/Ho_Chi_Minh'
const PAGE   = 50

/* ── Proxy URL: ảnh đi qua backend (giải quyết cross-origin Frigate auth) ── */
const snapProxy = eventId =>
  eventId ? `/api/media/snapshot/${eventId}` : null

/* ── Helpers ── */
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

/* ── Thumb ── */
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

function DualThumb({ direction, eventIdN1, eventIdS1 }) {
  const isIn = direction === 'incoming'
  const cams = isIn
    ? [{ label:'N1', id:eventIdN1 }, { label:'S1', id:eventIdS1, rec:true }]
    : [{ label:'S1', id:eventIdS1 }, { label:'N1', id:eventIdN1, rec:true }]
  return (
    <div className={s.dualThumb}>
      {cams.map(c => <Thumb key={c.label} src={snapProxy(c.id)} label={c.label} showRec={!!c.rec} />)}
    </div>
  )
}

/* ── Cam pane ── */
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

/* ── Detail panel ── */
function DetailPanel({ sessionId, sessionDir }) {
  const [clips,   setClips]   = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setLoading(true); setClips(null); setShowAll(false)
    getSessionClips(sessionId)
      .then(r => { if (!cancelled) setClips(r.data) })
      .catch(() => { if (!cancelled) setClips([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId])

  if (!sessionId) return (
    <div className={s.detEmpty}>
      <div className={s.detEmptyIcon}>⬡</div>
      <p>Chọn sự kiện bên trái để xem</p>
    </div>
  )
  if (loading) return <div className={s.detCenter}><Spinner size={22} /></div>
  if (!clips?.length) return <div className={s.detEmpty}><p>Không có clip nào</p></div>

  const best   = clips.find(c => c.is_best_match) || clips[0]
  const relAll = clips.filter(c => !c.is_best_match)
  const isIn   = (sessionDir || best.direction) === 'incoming'
  const labelA = isIn ? 'N1' : 'S1'
  const labelB = isIn ? 'S1' : 'N1'
  const camA   = clips.find(c => c.camera === labelA && c.is_best_match) || clips.find(c => c.camera === labelA)
  const camB   = clips.find(c => c.camera === labelB && c.is_best_match) || clips.find(c => c.camera === labelB)

  return (
    <div className={s.detScroll}>
      {/* Header */}
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
        </div>
      </div>

      {/* Cameras — ảnh qua proxy, video link thẳng Frigate (browser đã có cookie) */}
      <div className={s.camGrid}>
        <div className={s.camWrap}>
          <CamPane camera={labelA} eventId={camA?.frigate_event_id} clipUrl={camA?.clip_url} finalized={camA?.clip_finalized} />
        </div>
        <div className={s.camWrap}>
          <CamPane camera={labelB} eventId={camB?.frigate_event_id} clipUrl={camB?.clip_url} finalized={camB?.clip_finalized} />
        </div>
      </div>

      {/* Meta bar */}
      <div className={s.clipMeta}>
        <span className={s.cmStat}>Δ {parseFloat(best.delta_seconds||0).toFixed(1)}s</span>
        {best.frigate_score && <span className={s.cmStat}>{(best.frigate_score*100).toFixed(1)}% conf</span>}
        <span className={s.cmStat} style={{color:'var(--in)'}}>score {parseFloat(best.match_score||0).toFixed(3)}</span>
        <div className={s.cmActions}>
          {best.snapshot_url && <a className={s.cmBtn} href={best.snapshot_url} target="_blank" rel="noreferrer"><Icon name="expand" size={11}/>Ảnh gốc</a>}
          {best.clip_url     && <a className={s.cmBtn} href={best.clip_url} target="_blank" rel="noreferrer" download><Icon name="film" size={11}/>Tải clip</a>}
          {relAll.length > 0 && (
            <button className={`${s.cmBtn} ${s.cmBtnGhost}`} onClick={() => setShowAll(v => !v)}>
              <Icon name="expand" size={11}/>{showAll ? 'Ẩn bớt' : `${relAll.length} clip liên quan`}
            </button>
          )}
        </div>
      </div>

      {/* Related */}
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

/* ── Event row ── */
const EventRow = memo(function EventRow({ session, selected, onClick }) {
  const isIn = session.direction === 'incoming'
  return (
    <div className={`${s.evRow} ${selected ? s.evSelected : ''} ${isIn ? s.evIn : s.evOut}`} onClick={onClick}>
      <div className={s.evTime}>
        <div className={s.evTimeMain}>{fmt.time(session.event_time_local)}</div>
        <div className={s.evTimeAgo}>{fmt.ago(session.event_time_local)}</div>
      </div>
      <DualThumb
        direction={session.direction}
        eventIdN1={session.event_id_n1}
        eventIdS1={session.event_id_s1}
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

/* ── Filter bar — local state, chỉ notify parent khi bấm Lọc ── */
function FilterBar({ onApply }) {
  const [f, setF] = useState({
    since: yesterdayStr(), until: todayStr(),
    direction: '', user_name: '', room: '',
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
      <input className={s.finput} style={{width:100}} placeholder="P.602..."
        value={f.room} onChange={e => set('room', e.target.value)} onKeyDown={e => e.key==='Enter' && onApply(f)}/>
      <button className={s.applyBtn} onClick={() => onApply(f)}>
        <Icon name="search" size={13}/>Lọc
      </button>
    </div>
  )
}

/* ── Main ── */
export default function GateLog() {
  const [sessions, setSessions] = useState(null)
  const [total,    setTotal]    = useState(0)
  const [offset,   setOffset]   = useState(0)
  const [selSess,  setSelSess]  = useState(null)
  const [loading,  setLoading]  = useState(false)

  const filtersRef = useRef({ since: yesterdayStr(), until: todayStr(), direction:'', user_name:'', room:'' })
  const offsetRef  = useRef(0)

  const load = useCallback(async (filters, off = 0) => {
    filtersRef.current = filters
    offsetRef.current  = off
    setLoading(true); setSessions(null)
    try {
      const p = { offset: off, limit: PAGE }
      if (filters.since)     p.since     = filters.since
      if (filters.until)     p.until     = filters.until + 'T23:59:59'
      if (filters.direction) p.direction = filters.direction
      if (filters.user_name) p.user_name = filters.user_name
      if (filters.room)      p.room      = filters.room
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
      <FilterBar onApply={handleApply} />
      <div className={s.body}>
        <div className={s.feedCol}>
          <ColHead title="Dòng sự kiện" right={`${total} bản ghi`} />
          <div className={s.feed}>
            {loading && <div className={s.loadRow}><Spinner size={18}/><span>Đang tải...</span></div>}
            {!loading && sessions?.length === 0 && <Empty message="Không có dữ liệu"/>}
            {sessions?.map(sess => (
              <EventRow
                key={`${sess.session_id}-${sess.event_time_local}`}
                session={sess}
                selected={selSess?.id === sess.session_id}
                onClick={() => setSelSess({ id: sess.session_id, direction: sess.direction })}
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

        <div className={s.detCol}>
          <ColHead title="Chi tiết sự kiện" right={selSess ? `Session #${selSess.id}` : 'Chọn sự kiện bên trái'} />
          <DetailPanel sessionId={selSess?.id} sessionDir={selSess?.direction} />
        </div>
      </div>
    </div>
  )
}
