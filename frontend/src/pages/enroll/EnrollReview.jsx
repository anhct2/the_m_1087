import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, Badge, Icon, Avatar, Loading, Pager, Empty, DirText } from '../../components/UI'
import { getEnrollReview } from '../../api/client'
import { fmtTime, fmtShortDate, snapUrl } from '../../utils'
import { GateSessionDrawer } from './GateSessionDetail'
import { SubHeader, StatusBadge, useEnrollBus } from './EnrollShell'

const REV_COLS = '44px 1.4fr 0.7fr 1.1fr 0.7fr 2fr 0.9fr'
const PAGE_REV = 20

export default function EnrollReview() {
  const { bumpRefresh } = useEnrollBus()
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [offset, setOffset] = useState(0)
  const [days, setDays]     = useState(7)
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(null)

  function load(off = 0, d = days) {
    setLoading(true)
    getEnrollReview({ limit: PAGE_REV, offset: off, days: d })
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setOffset(off) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(0) }, [])

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SubHeader title="Cần xử lý" sub="Phiên lỗi, chưa gắn được hồ sơ, hoặc phát hiện 3+ người trong 1 phiên cần xác nhận" right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[7, 14, 30].map(d => (
            <span key={d} onClick={() => { setDays(d); load(0, d) }}
              style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--ln)', background: days === d ? 'var(--inb)' : 'var(--bg1)', color: days === d ? 'oklch(0.85 0.11 152)' : 'var(--tlo)' }}>
              {d} ngày
            </span>
          ))}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{total} phiên</span>
        </div>
      } />
      {loading && !items.length ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty message="Không có phiên nào cần xử lý" />
      ) : (
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: REV_COLS, gap: 10, padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.8px', color: 'var(--txl)', textTransform: 'uppercase', borderBottom: '1px solid var(--bg2)' }}>
            <div>Ảnh</div><div>Thời gian</div><div>Phòng</div><div>Trạng thái</div><div>Chiều</div><div>Lý do</div><div>Thao tác</div>
          </div>
          {items.map(r => {
            const multi = (r.person_count ?? 0) >= 3
            const reason = multi
              ? `${r.person_count} người trong 1 phiên — xác nhận số người trong phòng`
              : r.error_msg
              ? r.error_msg.slice(0, 60)
              : r.recognized_person_id == null
              ? 'enrolled nhưng không có profile'
              : '—'
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: REV_COLS, gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--bg1)' }}>
                <Avatar gender={null} size={34} src={snapUrl(r.snap_event_id)} />
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tmd)' }}>{fmtTime(r.event_time_vn)} · {fmtShortDate(r.event_time_vn)}</div>
                <div><Badge kind="teal">{r.room_label}</Badge></div>
                <div><StatusBadge status={r.status} /></div>
                <div><DirText dir={r.direction} /></div>
                <div style={{ fontSize: 11, color: multi ? 'var(--am)' : 'var(--txl)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span onClick={() => setDrawer(r.door_id)} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--ln2)', color: 'var(--in)', cursor: 'pointer' }}>Xem / Gán</span>
                  {r.door_id && (
                    <Link to={`/gate-log?focus=${r.door_id}`} title="Xem ở Gate Log" style={{ display: 'flex', alignItems: 'center', fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--ln)', color: 'var(--tmd)' }}>
                      <Icon name="gate" size={11} />
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
          <Pager offset={offset} total={total} page={PAGE_REV} onPage={off => load(off)} />
        </Card>
      )}

      {drawer != null && (
        <GateSessionDrawer
          doorId={drawer}
          onClose={() => setDrawer(null)}
          onChanged={() => { setDrawer(null); load(offset); bumpRefresh?.() }}
        />
      )}
    </div>
  )
}
