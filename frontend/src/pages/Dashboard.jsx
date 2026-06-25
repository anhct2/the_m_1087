import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { getStats, getStatsTrend } from '../api/client'
import { StatCard, Spinner, Empty } from '../components/UI'
import s from './Dashboard.module.css'

const C_IN  = 'oklch(0.78 0.15 152)'
const C_OUT = 'oklch(0.74 0.12 248)'

/* ── Custom tooltip ── */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={s.tip}>
      <div className={s.tipLabel}>{label}</div>
      {payload.map(p => (
        <div key={p.name} className={s.tipRow} style={{ color: p.color }}>
          <span className={s.tipDot} style={{ background: p.color }} />
          <span>{p.name === 'incoming' ? 'Vào' : 'Ra'}</span>
          <span className={s.tipVal}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Custom legend ── */
function ChartLegend({ payload }) {
  if (!payload?.length) return null
  return (
    <div className={s.legend}>
      {payload.map(p => (
        <span key={p.value} className={s.legendItem}>
          <span className={s.legendDot} style={{ background: p.color }} />
          {p.value === 'incoming' ? 'Vào' : 'Ra'}
        </span>
      ))}
    </div>
  )
}

const axTick = { fill: 'oklch(0.44 0.009 255)', fontSize: 10, fontFamily: 'var(--mono)' }
const axLine = false

/* ── Label chip ── */
function LabelChip({ label, count, max }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <span className={s.labelChip}>
      <span className={s.chipBar} style={{ width: `${pct}%` }} />
      <span className={s.chipLabel}>{label}</span>
      <span className={s.chipCount}>{count}</span>
    </span>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats]   = useState(null)
  const [trend, setTrend]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([getStats(), getStatsTrend(7)])
      .then(([s, t]) => { setStats(s.data); setTrend(t.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className={s.center}>
      <Spinner size={24} />
      <span style={{ color: 'var(--txl)', fontSize: 12.5 }}>Đang tải...</span>
    </div>
  )

  /* avg reference lines */
  const avgIn  = trend?.daily?.length
    ? Math.round(trend.daily.reduce((a, d) => a + d.incoming, 0) / trend.daily.length)
    : null

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <h1 className={s.pageTitle}>Tổng quan</h1>
        <span className={s.pageSub}>24 giờ gần nhất · tự động cập nhật</span>
      </div>

      {/* Stat row */}
      <div className={s.statRow}>
        <StatCard label="Lượt vào hôm nay"  value={stats?.incoming}      variant="in" />
        <StatCard label="Lượt ra hôm nay"   value={stats?.outgoing}      variant="out" />
        <StatCard label="Có clip"            value={stats?.with_clip} />
        <StatCard label="Người đã biết"      value={stats?.known_users} />
        <StatCard label="Tổng sự kiện"       value={stats?.total_sessions} />
      </div>

      {/* Charts */}
      <div className={s.charts}>

        {/* Area chart: 7-day */}
        <div className={s.chartCard}>
          <div className={s.chartHead}>
            <div>
              <div className={s.chartTitle}>7 ngày gần nhất</div>
              <div className={s.chartSub}>Lượt vào / ra mỗi ngày</div>
            </div>
            {avgIn != null && (
              <div className={s.avgBadge} style={{ color: C_IN }}>
                TB {avgIn} lượt/ngày
              </div>
            )}
          </div>
          <div className={s.chartBody}>
            {trend?.daily?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trend.daily} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C_IN}  stopOpacity={0.35}/>
                      <stop offset="95%" stopColor={C_IN}  stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C_OUT} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={C_OUT} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.30 0.008 255 / 0.5)" strokeDasharray="3 3" vertical={false}/>
                  {avgIn != null && (
                    <ReferenceLine y={avgIn} stroke={C_IN} strokeOpacity={0.35} strokeDasharray="5 3"
                      label={{ value: `TB ${avgIn}`, position: 'insideTopRight', fill: C_IN, fontSize: 9, fontFamily: 'var(--mono)' }}
                    />
                  )}
                  <XAxis dataKey="date" tick={axTick} axisLine={axLine} tickLine={axLine} />
                  <YAxis tick={axTick} axisLine={axLine} tickLine={axLine}
                    tickFormatter={v => Number.isInteger(v) ? v : ''} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: 'oklch(0.42 0.012 255)', strokeWidth: 1 }} />
                  <Legend content={<ChartLegend />} />
                  <Area type="monotone" dataKey="incoming" name="incoming"
                    stroke={C_IN}  strokeWidth={2} fill="url(#gIn)"
                    dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: C_IN }} />
                  <Area type="monotone" dataKey="outgoing" name="outgoing"
                    stroke={C_OUT} strokeWidth={2} fill="url(#gOut)"
                    dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: C_OUT }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Empty message="Chưa có dữ liệu trend" />}
          </div>
        </div>

        {/* Bar chart: hourly */}
        <div className={s.chartCard}>
          <div className={s.chartHead}>
            <div>
              <div className={s.chartTitle}>Hôm nay theo giờ</div>
              <div className={s.chartSub}>Phân bố lượt ra vào 24h</div>
            </div>
          </div>
          <div className={s.chartBody}>
            {trend?.hourly?.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trend.hourly} margin={{ top: 12, right: 12, left: -18, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke="oklch(0.30 0.008 255 / 0.5)" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="hour" tick={axTick} axisLine={axLine} tickLine={axLine} interval={3}
                    tickFormatter={h => `${h}h`} />
                  <YAxis tick={axTick} axisLine={axLine} tickLine={axLine}
                    tickFormatter={v => Number.isInteger(v) ? v : ''} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'oklch(0.28 0.008 255 / 0.4)' }} />
                  <Legend content={<ChartLegend />} />
                  <Bar dataKey="incoming" name="incoming"
                    fill="oklch(0.78 0.15 152 / 0.75)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="outgoing" name="outgoing"
                    fill="oklch(0.74 0.12 248 / 0.65)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty message="Chưa có dữ liệu hôm nay" />}
          </div>
        </div>
      </div>

      {/* Top users */}
      {trend?.top_users?.length > 0 && (
        <div className={s.tableCard}>
          <div className={s.chartHead}>
            <div>
              <div className={s.chartTitle}>Người dùng nhiều nhất</div>
              <div className={s.chartSub}>7 ngày gần nhất · kèm phân bố phòng</div>
            </div>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tên</th>
                  <th>Phòng hay dùng</th>
                  <th>Vào</th>
                  <th>Ra</th>
                  <th>Tổng</th>
                </tr>
              </thead>
              <tbody>
                {trend.top_users.map((u, i) => {
                  const maxCount = u.labels?.[0]?.count ?? 1
                  return (
                    <tr key={u.user_name} style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/gate-log?user_name=${encodeURIComponent(u.user_name)}`)}>
                      <td className={s.rank}>{i + 1}</td>
                      <td className={s.tdName}>{u.user_name}</td>
                      <td className={s.tdLabels}>
                        {u.labels?.length > 0
                          ? u.labels.map(l => (
                              <LabelChip key={l.label} label={l.label} count={l.count} max={maxCount} />
                            ))
                          : <span className={s.noLabel}>—</span>
                        }
                      </td>
                      <td className={s.tdIn}>{u.incoming}</td>
                      <td className={s.tdOut}>{u.outgoing}</td>
                      <td className={s.tdTotal}>{u.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
