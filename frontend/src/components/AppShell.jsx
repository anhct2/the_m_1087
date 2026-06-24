import React, { useState, useEffect, memo, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon } from './UI'
import s from './AppShell.module.css'

const NAV = [
  { to: '/dashboard', icon: 'dashboard', label: 'Tổng quan' },
  { to: '/gate-log',  icon: 'gate',      label: 'Gate Log' },
  { to: '/rooms',     icon: 'building',  label: 'Phòng' },
  { to: '/room-log',  icon: 'calendar',  label: 'Lịch phòng' },
  { to: '/enroll',    icon: 'users',     label: 'Enroll' },
]

const Clock = memo(function Clock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  const time = t.toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
  })
  const date = t.toLocaleDateString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  }).toUpperCase()
  return (
    <div className={s.clock}>
      <div className={s.clockTime}>{time}</div>
      <div className={s.clockDate}>{date}</div>
    </div>
  )
})

export default function AppShell() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('side-collapsed') === '1'
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleCollapse = useCallback(() => {
    setCollapsed(v => {
      localStorage.setItem('side-collapsed', !v ? '1' : '0')
      return !v
    })
  }, [])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <div className={s.shell}>
      {mobileOpen && <div className={s.mobileOverlay} onClick={closeMobile} />}

      <aside className={`${s.sidebar} ${collapsed ? s.collapsed : ''} ${mobileOpen ? s.mobileOpen : ''}`}>
        <div className={s.sideTopBar}>
          <button className={`${s.iconBtn} ${s.collapseBtn}`} onClick={toggleCollapse}
            title={collapsed ? 'Mở rộng' : 'Thu gọn'}>
            <Icon name={collapsed ? 'chevron' : 'chevLeft'} size={13} />
          </button>
        </div>

        <div className={s.brand}>
          <div className={s.brandMark}><span className={s.brandDot} /></div>
          <div className={s.brandText}>
            <div className={s.brandName}>87 TCS</div>
            <div className={s.brandSub}>Monitor</div>
          </div>
        </div>

        <nav className={s.nav}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} onClick={closeMobile}
              title={collapsed ? label : undefined}
              className={({ isActive }) => `${s.navItem} ${isActive ? s.navActive : ''}`}>
              <Icon name={icon} size={15} />
              <span className={s.navLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={s.sideBottom}>
          <div className={s.userRow}>
            <div className={s.userAvatar}><Icon name="user" size={13} /></div>
            <div className={s.userName}>{user?.username}</div>
          </div>
          <button className={s.iconBtn} onClick={logout} title="Đăng xuất">
            <Icon name="logout" size={14} />
          </button>
        </div>
      </aside>

      <div className={s.main}>
        <header className={s.topbar}>
          <button className={s.menuBtn} onClick={() => setMobileOpen(v => !v)}>
            <Icon name="menu" size={18} />
          </button>
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
