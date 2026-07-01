import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatTile, Card, CardHead, Spinner } from '../components/UI'
import { getStats, getStatsTrend } from '../api/client'
import { fmtShortDate, fmtTime } from '../utils'
const DOW_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
function ddmmToDow(ddmm) {
  if (!ddmm) return ''
  const [dd, mm] = ddmm.split('/').map(Number)
  return DOW_VN[new Date(new Date().getFullYear(), mm - 1, dd).getDay()]
}

const IN = 'oklch(0.78 0.15 152)', OUT = 'oklch(0.74 0.12 248)'

function smooth(pts) {
  if (!pts.length) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`
  }
  return d
}

function AreaChart({ days, inc, out }) {
  const W = 660, H = 210, pl = 30, pr = 12, pt = 16, pb = 26
  const max = Math.max(1, ...inc, ...out)
  const iw = W - pl - pr, ih = H - pt - pb
  const xs = i => pl + (iw * i) / Math.max(1, days.length - 1)
  const ys = v => pt + ih - (v / max) * ih
  const incPts = inc.map((v, i) => [xs(i), ys(v)])
  const outPts = out.map((v, i) => [xs(i), ys(v)])
  const incLine = smooth(incPts), outLine = smooth(outPts)
  const incArea = `${incLine} L ${xs(days.length - 1)} ${pt + ih} L ${pl} ${pt + ih} Z`
  const outArea = `${outLine} L ${xs(days.length - 1)} ${pt + ih} L ${pl} ${pt + ih} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="230" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={IN} stopOpacity="0.34" /><stop offset="100%" stopColor={IN} stopOpacity="0" /></linearGradient>
        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={OUT} stopOpacity="0.22" /><stop offset="100%" stopColor={OUT} stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3].map(g => {
        const y = pt + (ih * g) / 3
        return <g key={g}>
          <line x1={pl} y1={y} x2={W - pr} y2={y} stroke="oklch(0.3 0.008 255 / 0.6)" strokeDasharray="3 3" />
          <text x={pl - 6} y={y + 3} textAnchor="end" fontSize="9" fontFamily="IBM Plex Mono" fill="oklch(0.48 0.009 255)">{Math.round(max - (max * g) / 3)}</text>
        </g>
      })}
      <path d={outArea} fill="url(#gOut)" />
      <path d={incArea} fill="url(#gIn)" />
      <path d={outLine} fill="none" stroke={OUT} strokeWidth="2" />
      <path d={incLine} fill="none" stroke={IN} strokeWidth="2" />
      {incPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={IN} />)}
      {days.map((dn, i) => <text key={i} x={xs(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fontFamily="IBM Plex Mono" fill="oklch(0.5 0.009 255)">{dn}</text>)}
    </svg>
  )
}

function HourChart({ hoursInc, hoursOut }) {
  const W = 420, H = 210, pl = 26, pr = 8, pt = 14, pb = 26, hrs = 24
  const max = Math.max(1, ...hoursInc, ...hoursOut)
  const iw = W - pl - pr, ih = H - pt - pb, bw = iw / hrs
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="230" preserveAspectRatio="xMidYMid meet">
      {[0, 1, 2].map(g => {
        const y = pt + (ih * g) / 2
        return <g key={g}>
          <line x1={pl} y1={y} x2={W - pr} y2={y} stroke="oklch(0.3 0.008 255 / 0.6)" strokeDasharray="3 3" />
          <text x={pl - 5} y={y + 3} textAnchor="end" fontSize="9" fontFamily="IBM Plex Mono" fill="oklch(0.48 0.009 255)">{Math.round(max - (max * g) / 2)}</text>
        </g>
      })}
      {Array.from({ length: hrs }).map((_, h) => {
        const x = pl + h * bw
        const hi = (hoursInc[h] / max) * ih, ho = (hoursOut[h] / max) * ih, w = bw * 0.32
        return <g key={h}>
          <rect x={x + bw * 0.16} y={pt + ih - hi} width={w} height={hi} rx="1.5" fill="oklch(0.78 0.15 152 / 0.85)" />
          <rect x={x + bw * 0.52} y={pt + ih - ho} width={w} height={ho} rx="1.5" fill="oklch(0.74 0.12 248 / 0.7)" />
          {h % 4 === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="9" fontFamily="IBM Plex Mono" fill="oklch(0.5 0.009 255)">{h}h</text>}
        </g>
      })}
    </svg>
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tmd)' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: IN }} />Vào</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tmd)' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: OUT }} />Ra</span>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(new Date())

  function load() {
    setLoading(true)
    Promise.all([getStats(), getStatsTrend(7)])
      .then(([s, t]) => { setStats(s.data); setTrend(t.data); setUpdatedAt(new Date()) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const cell = { display: 'grid', gridTemplateColumns: '44px 1.3fr 90px 90px 90px 1.2fr', gap: 10, padding: '12px 18px', alignItems: 'center', borderBottom: '1px solid var(--bg1)' }

  if (loading && !stats) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>

  const inc = stats?.incoming ?? 0
  const out = stats?.outgoing ?? 0
  const total = stats?.total_sessions ?? 0
  const clipPct = total ? Math.round(((stats?.with_clip ?? 0) / total) * 100) : 0

  const statTiles = [
    { label: 'Lượt vào hôm nay', value: String(inc),                    valueColor: 'var(--in)',  sub: '' },
    { label: 'Lượt ra hôm nay',  value: String(out),                    valueColor: 'var(--out)', sub: '' },
    { label: 'Có clip',          value: String(stats?.with_clip ?? 0),   sub: `${clipPct}% sự kiện có clip` },
    { label: 'Người đã biết',    value: String(stats?.known_users ?? 0), sub: 'đã nhận diện' },
    { label: 'Tổng sự kiện',     value: String(total),                   sub: 'trong 24 giờ' },
  ]

  const daily = trend?.daily ?? []
  const trendDays = daily.map(d => ddmmToDow(d.date))
  const trendInc  = daily.map(d => d.incoming)
  const trendOut  = daily.map(d => d.outgoing)

  // Build hourly 24-slot arrays
  const hoursInc = Array(24).fill(0)
  const hoursOut = Array(24).fill(0)
  ;(trend?.hourly ?? []).forEach(h => {
    const idx = parseInt(h.hour, 10)
    if (idx >= 0 && idx < 24) { hoursInc[idx] = h.incoming; hoursOut[idx] = h.outgoing }
  })

  const topRooms = (trend?.top_rooms ?? []).map((r, i) => ({
    rank: i + 1,
    room: r.room,
    incoming: r.incoming,
    outgoing: r.outgoing,
    total: r.total,
    last_event: r.last_event,
  }))
  const maxRoomTotal = Math.max(1, ...topRooms.map(r => r.total))

  const updStr = updatedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>Tổng quan</h1>
          <div style={{ fontSize: 12.5, color: 'var(--tlo)', marginTop: 4 }}>24 giờ gần nhất · tự động cập nhật mỗi 60 giây</div>
        </div>
        <div
          onClick={load}
          style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)', background: 'var(--bg1)', border: '1px solid var(--ln)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}
        >
          {loading ? 'Đang tải…' : `Cập nhật · ${updStr}`}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 18 }}>
        {statTiles.map((s, i) => <StatTile key={i} {...s} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Card>
          <CardHead title="7 ngày gần nhất" sub="Lượt vào / ra mỗi ngày" right={<Legend />} />
          <div style={{ padding: '10px 18px' }}>
            {trendDays.length ? <AreaChart days={trendDays} inc={trendInc} out={trendOut} /> : <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txl)', fontSize: 12 }}>Không có dữ liệu</div>}
          </div>
        </Card>
        <Card>
          <CardHead title="Hôm nay theo giờ" sub="Phân bố lượt ra vào 24h" />
          <div style={{ padding: '10px 18px' }}><HourChart hoursInc={hoursInc} hoursOut={hoursOut} /></div>
        </Card>
      </div>

      <Card>
        <CardHead title="Phòng ra vào nhiều nhất" sub="7 ngày gần nhất · nhấp để xem Gate Log của phòng" />
        {topRooms.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--tlo)' }}>Không có dữ liệu</div>
        ) : (
          <>
            <div style={{ ...cell, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px', color: 'var(--txl)', textTransform: 'uppercase', padding: '10px 18px' }}>
              <div>#</div><div>Phòng</div>
              <div style={{ textAlign: 'right' }}>Vào</div><div style={{ textAlign: 'right' }}>Ra</div><div style={{ textAlign: 'right' }}>Tổng</div>
              <div>Gần nhất</div>
            </div>
            {topRooms.map(r => (
              <div key={r.rank} style={{ ...cell, cursor: 'pointer' }} onClick={() => navigate(`/gate-log?room=${encodeURIComponent(r.room)}`)}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--txl)' }}>{r.rank}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--te)' }}>{r.room}</span>
                  <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden', maxWidth: 120 }}>
                    <span style={{ display: 'block', height: '100%', borderRadius: 3, width: `${(r.total / maxRoomTotal) * 100}%`, background: IN }} />
                  </span>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: IN }}>{r.incoming}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: OUT }}>{r.outgoing}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{r.total}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txl)' }}>{r.last_event ? `${fmtShortDate(r.last_event)} ${fmtTime(r.last_event)}` : '—'}</div>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  )
}
