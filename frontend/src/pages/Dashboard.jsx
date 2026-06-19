import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { getStats, getStatsTrend } from '../api/client'
import { StatCard, Spinner, Empty } from '../components/UI'
import s from './Dashboard.module.css'

/* ── Custom tooltip ── */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={s.tip}>
      <div className={s.tipLabel}>{label}</div>
      {payload.map(p => (
        <div key={p.name} className={s.tipRow} style={{ color: p.color }}>
          <span>{p.name === 'incoming' ? '↓ Vào' : '↑ Ra'}</span>
          <span className={s.tipVal}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [trend, setTrend]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([getStats(), getStatsTrend(7)])
      .then(([s, t]) => {
        setStats(s.data)
        setTrend(t.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className={s.center}>
      <Spinner size={24} />
      <span style={{ color: 'var(--txl)', fontSize: 12.5 }}>Đang tải...</span>
    </div>
  )

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
        {/* Area chart: 7-day trend */}
        <div className={s.chartCard}>
          <div className={s.chartHead}>
            <span className={s.chartTitle}>7 ngày gần nhất</span>
            <span className={s.chartSub}>Lượt vào / ra mỗi ngày</span>
          </div>
          <div className={s.chartBody}>
            {trend?.daily?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend.daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="oklch(0.78 0.15 152)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="oklch(0.78 0.15 152)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="oklch(0.74 0.12 248)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="oklch(0.74 0.12 248)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.33 0.01 255 / 0.4)" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="date" tick={{ fill: 'oklch(0.44 0.009 255)', fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'oklch(0.44 0.009 255)', fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: 'oklch(0.42 0.012 255)', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="incoming" stroke="oklch(0.78 0.15 152)" strokeWidth={1.8} fill="url(#gIn)" dot={false} />
                  <Area type="monotone" dataKey="outgoing" stroke="oklch(0.74 0.12 248)" strokeWidth={1.8} fill="url(#gOut)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Empty message="Chưa có dữ liệu trend" />}
          </div>
        </div>

        {/* Bar chart: hourly today */}
        <div className={s.chartCard}>
          <div className={s.chartHead}>
            <span className={s.chartTitle}>Hôm nay theo giờ</span>
            <span className={s.chartSub}>Phân bố lượt ra vào 24h</span>
          </div>
          <div className={s.chartBody}>
            {trend?.hourly?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend.hourly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke="oklch(0.33 0.01 255 / 0.4)" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="hour" tick={{ fill: 'oklch(0.44 0.009 255)', fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} interval={3} />
                  <YAxis tick={{ fill: 'oklch(0.44 0.009 255)', fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'oklch(0.28 0.008 255 / 0.5)' }} />
                  <Bar dataKey="incoming" fill="oklch(0.78 0.15 152 / 0.7)" radius={[3,3,0,0]} maxBarSize={12} />
                  <Bar dataKey="outgoing" fill="oklch(0.74 0.12 248 / 0.7)" radius={[3,3,0,0]} maxBarSize={12} />
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
            <span className={s.chartTitle}>Người dùng nhiều nhất</span>
            <span className={s.chartSub}>7 ngày gần nhất</span>
          </div>
          <table className={s.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Tên</th>
                <th>Phòng / Nhãn</th>
                <th>Lượt vào</th>
                <th>Lượt ra</th>
                <th>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {trend.top_users.map((u, i) => (
                <tr key={u.user_name}>
                  <td className={s.rank}>{i + 1}</td>
                  <td className={s.tdName}>{u.user_name}</td>
                  <td className={s.tdMono}>{u.label || '—'}</td>
                  <td className={s.tdIn}>{u.incoming}</td>
                  <td className={s.tdOut}>{u.outgoing}</td>
                  <td className={s.tdTotal}>{u.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
