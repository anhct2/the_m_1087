import React, { useState, useEffect, memo } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon } from './UI'
import s from './AppShell.module.css'

const NAV = [
  { to: '/dashboard', icon: 'dashboard', label: 'Tổng quan' },
  { to: '/gate-log',  icon: 'gate',      label: 'Gate Log' },
]

/* ── Clock: memo + tách hẳn ra để setInterval không bubble re-render lên AppShell ── */
const Clock = memo(function Clock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  const time = t.toLocaleTimeString('vi-VN', {
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:'Asia/Ho_Chi_Minh'
  })
  const date = t.toLocaleDateString('vi-VN', {
    weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', timeZone:'Asia/Ho_Chi_Minh'
  }).toUpperCase()
  return (
    <div className={s.clock}>
      <div className={s.clockTime}>{time}</div>
      <div className={s.clockDate}>{date}</div>
    </div>
  )
})

/* ── Sidebar: memo vì không đổi khi clock tick ── */
const Sidebar = memo(function Sidebar({ username, onLogout }) {
  return (
    <aside className={s.sidebar}>
      <div className={s.brand}>
        <div className={s.brandMark}><span className={s.brandDot} /></div>
        <div>
          <div className={s.brandName}>87 TCS</div>
          <div className={s.brandSub}>Monitor</div>
        </div>
      </div>
      <nav className={s.nav}>
        {NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => `${s.navItem} ${isActive ? s.navActive : ''}`}>
            <Icon name={icon} size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className={s.sideBottom}>
        <div className={s.userRow}>
          <div className={s.userAvatar}><Icon name="user" size={13} /></div>
          <div className={s.userName}>{username}</div>
        </div>
        <button className={s.logoutBtn} onClick={onLogout} title="Đăng xuất">
          <Icon name="logout" size={14} />
        </button>
      </div>
    </aside>
  )
})

/* ── AppShell: stable — chỉ re-render khi auth thay đổi ── */
export default function AppShell() {
  const { user, logout } = useAuth()
  return (
    <div className={s.shell}>
      <Sidebar username={user?.username} onLogout={logout} />
      <div className={s.main}>
        <header className={s.topbar}>
          <span className={s.liveTag}><span className={s.liveDot} />LIVE</span>
          <Clock />
        </header>
        <div className={s.content}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
