import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card, Badge, Icon, SimBar, Avatar, Spinner } from '../../components/UI'
import { RoomCheckboxFilter } from '../../components/RoomFilter'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { Lightbox } from '../../components/Lightbox'
import { STATUS } from '../enrollData'
import { getGateSessions } from '../../api/client'
import { fmtTime, fmtShortDate, snapUrl } from '../../utils'
import { GateSessionDrawer } from './GateSessionDetail'
import { EnrollOverview, useEnrollBus } from './EnrollShell'

const SES_COLS = '58px 1.3fr 0.7fr 1.2fr 0.6fr 1.6fr 0.9fr 40px'
const PAGE = 20

export default function EnrollSessions() {
  const { bumpRefresh } = useEnrollBus()
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(null)   // door_id
  const [lightbox, setLightbox] = useState(null)

  const [filterDir, setFilterDir]     = useState('')
  const [filterRooms, setFilterRooms] = useState([])
  const [range, setRange]             = useState({ from: '', to: '' })

  const load = useCallback((off = 0) => {
    setLoading(true)
    const params = { limit: PAGE, offset: off }
    if (filterDir) params.direction = filterDir
    if (filterRooms.length) params.room = filterRooms.join(',')
    if (range.from) params.date_from = range.from
    if (range.to)   params.date_to = range.to
    getGateSessions(params)
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setOffset(off) })
      .finally(() => setLoading(false))
  }, [filterDir, filterRooms, range])

  useEffect(() => { load(0) }, [filterDir, filterRooms, range])

  function closeDrawer(refresh) {
    setDrawer(null)
    if (refresh) { load(offset); bumpRefresh() }
  }

  function openSnap(ev, e) {
    e.stopPropagation()
    if (!ev.snap_event_id) return
    setLightbox({ items: [{ src: snapUrl(ev.snap_event_id), caption: `${ev.recognized_name || ev.gate_user_name || 'Chưa nhận diện'} · ${ev.room_label}` }], index: 0 })
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <EnrollOverview onRefresh={() => load(offset)} />

      {/* Bộ lọc giống Gate Log để map với nhau — áp dụng ngay, không cần nút Lọc */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 11, padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: 3 }}>
          {[['', 'Tất cả'], ['incoming', 'Vào'], ['outgoing', 'Ra']].map(([val, label]) => (
            <span key={val} onClick={() => setFilterDir(val)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: filterDir === val ? 'var(--bg3)' : 'transparent', color: filterDir === val ? 'var(--thi)' : 'var(--tlo)', fontWeight: filterDir === val ? 500 : 400 }}>
              {val && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: val === 'incoming' ? 'var(--in)' : 'var(--out)', marginRight: 6 }} />}
              {label}
            </span>
          ))}
        </div>
        <RoomCheckboxFilter value={filterRooms} onChange={setFilterRooms} />
        <DateRangeFilter value={range} onChange={setRange} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txl)' }}>Khớp 1-1 với Gate Log</span>
      </div>

      {loading && !items.length ? (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
      ) : (
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: SES_COLS, gap: 10, padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.8px', color: 'var(--txl)', textTransform: 'uppercase', borderBottom: '1px solid var(--bg2)' }}>
            <div>Ảnh</div><div>Thời gian</div><div>Phòng</div><div>Trạng thái</div><div>Chiều</div><div>Người / Nhận diện</div><div>Chất lượng</div><div />
          </div>
          {items.map(r => {
            const [sk, sl] = STATUS[r.effective_status] ?? ['dim', r.effective_status]
            const isIn = r.direction === 'incoming'
            const hasRecog = r.recognized_person_id != null
            const simPct = r.recognition_sim != null ? Math.round(r.recognition_sim * 100) : null
            const multi = r.person_count > 1
            const who = hasRecog
              ? r.recognized_name || `#${r.recognized_person_id}`
              : multi
              ? `${r.persons_enrolled ?? 0} / ${r.person_count} người`
              : r.enroll_session_id ? 'Chưa nhận diện' : (r.gate_user_name || 'Chưa xử lý')
            return (
              <div key={r.door_id} onClick={() => setDrawer(r.door_id)} style={{ display: 'grid', gridTemplateColumns: SES_COLS, gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--bg1)', cursor: 'pointer' }}>
                <div onClick={e => openSnap(r, e)} title="Xem ảnh" style={{ cursor: r.snap_event_id ? 'zoom-in' : 'default', width: 'fit-content' }}>
                  <Avatar gender={r.recognized_gender} size={36} src={snapUrl(r.snap_event_id)} />
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tmd)' }}>{fmtTime(r.event_time_vn)} · {fmtShortDate(r.event_time_vn)}</div>
                <div><Badge kind="teal">{r.room_label}</Badge></div>
                <div><Badge kind={sk}>{sl}</Badge></div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: isIn ? 'var(--in)' : 'var(--out)' }}>{isIn ? '↓ Vào' : '↑ Ra'}</div>
                <div style={{ minWidth: 0 }}>
                  {hasRecog ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <Avatar gender={r.recognized_gender} size={24} src={snapUrl(r.snap_event_id)} />
                      <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
                      {simPct != null && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--in)' }}>{simPct}%</span>}
                    </span>
                  ) : <Badge kind={multi ? 'green' : 'dim'}>{who}</Badge>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SimBar value={r.overall_quality ?? 0} width={54} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tlo)', minWidth: 26 }}>{r.overall_quality > 0 ? r.overall_quality.toFixed(2) : '—'}</span>
                </div>
                <Link
                  to={`/gate-log?focus=${r.door_id}`}
                  onClick={e => e.stopPropagation()}
                  title="Xem ở Gate Log"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--ln)', color: 'var(--tlo)' }}
                >
                  <Icon name="gate" size={12} />
                </Link>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: '1px solid var(--bg2)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)' }}>{total ? offset + 1 : 0}–{Math.min(offset + PAGE, total)} / {total} phiên</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <span onClick={() => offset > 0 && load(offset - PAGE)} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln)', color: offset > 0 ? 'var(--tmd)' : 'var(--txl)', cursor: offset > 0 ? 'pointer' : 'default' }}>← Trước</span>
              <span onClick={() => offset + PAGE < total && load(offset + PAGE)} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--ln2)', color: offset + PAGE < total ? 'var(--tmd)' : 'var(--txl)', cursor: offset + PAGE < total ? 'pointer' : 'default' }}>Sau →</span>
            </div>
          </div>
        </Card>
      )}

      {drawer != null && <GateSessionDrawer doorId={drawer} onClose={() => closeDrawer(false)} onChanged={() => closeDrawer(true)} />}
      {lightbox && <Lightbox items={lightbox.items} index={lightbox.index} onIndex={i => setLightbox(lb => ({ ...lb, index: i }))} onClose={() => setLightbox(null)} />}
    </div>
  )
}
