import { useState, useEffect, memo } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon } from './UI'

const NAV = [
  { to: '/dashboard', icon: 'dashboard', label: 'Tổng quan' },
  { to: '/gate-log',  icon: 'gate',      label: 'Gate Log' },
  { to: '/rooms',     icon: 'building',  label: 'Phòng' },
  { to: '/room-log',  icon: 'calendar',  label: 'Lịch phòng' },
  { to: '/enroll',    icon: 'users',     label: 'Enroll' },
  { to: '/airbnb',    icon: 'calGrid',   label: 'Lịch Airbnb' },
]

export const ENROLL_SUBNAV = [
  { to: '/enroll/sessions',   label: 'Phiên nhận diện' },
  { to: '/enroll/review',     label: 'Cần xử lý' },
  { to: '/enroll/duplicates', label: 'Trùng lặp' },
  { to: '/enroll/profiles',   label: 'Hồ sơ' },
  { to: '/enroll/occupancy',  label: 'Lưu trú' },
  { to: '/enroll/jobs',       label: 'Tác vụ' },
]

const Clock = memo(function Clock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  const time = t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })
  const date = t.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).toUpperCase()
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, letterSpacing: '0.5px' }}>{time}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--txl)', letterSpacing: '0.8px' }}>{date}</div>
    </div>
  )
})

export default function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const inEnroll = location.pathname.startsWith('/enroll')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('tcs_sidebar_collapsed') === '1')

  function toggleSidebar() {
    setCollapsed(c => {
      localStorage.setItem('tcs_sidebar_collapsed', c ? '0' : '1')
      return !c
    })
  }

  const navItem = ({ isActive }) => ({
    position: 'relative', display: 'flex', alignItems: 'center', gap: 11,
    padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    textDecoration: 'none', transition: 'background .12s',
    color: isActive ? 'oklch(0.85 0.11 152)' : 'var(--tlo)',
    background: isActive ? 'var(--inb)' : 'transparent',
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: collapsed ? '1fr' : '216px 1fr', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      {!collapsed && (
      <aside style={{ background: 'oklch(0.165 0.006 255)', borderRight: '1px solid var(--ln)', display: 'flex', flexDirection: 'column', padding: '16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 8px 20px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--ln2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--in)', boxShadow: '0 0 10px oklch(0.78 0.15 152 / 0.7)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.3px' }}>87 TCS</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tlo)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Monitor</div>
          </div>
          <button onClick={toggleSidebar} title="Ẩn thanh điều hướng" style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Icon name="chevLeft" size={15} />
          </button>
        </div>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--txl)', letterSpacing: '1.5px', padding: '0 10px 8px' }}>ĐIỀU HƯỚNG</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ to, icon, label }) => (
            <div key={to}>
              <NavLink to={to} style={navItem}>
                {({ isActive }) => (
                  <>
                    {isActive && <span style={{ position: 'absolute', left: -12, top: 8, bottom: 8, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--in)' }} />}
                    <Icon name={icon} size={16} />
                    {label}
                  </>
                )}
              </NavLink>
              {to === '/enroll' && inEnroll && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, margin: '3px 0 4px 27px', borderLeft: '1px solid var(--ln)', paddingLeft: 10 }}>
                  {ENROLL_SUBNAV.map(s => (
                    <NavLink key={s.to} to={s.to} style={({ isActive }) => ({
                      fontSize: 12, padding: '6px 9px', borderRadius: 6, textDecoration: 'none',
                      color: isActive ? 'oklch(0.85 0.11 152)' : 'var(--tlo)',
                      background: isActive ? 'var(--inb)' : 'transparent', fontWeight: isActive ? 600 : 400,
                    })}>
                      {s.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--bg2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--ln2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--tmd)', textTransform: 'uppercase' }}>
            {(user?.username || 'AD').slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.username || 'admin'}</div>
            <div style={{ fontSize: 10, color: 'var(--txl)' }}>{user?.role || 'Quản trị viên'}</div>
          </div>
          <button onClick={logout} title="Đăng xuất" style={{ width: 30, height: 30, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="logout" size={15} />
          </button>
        </div>
      </aside>
      )}

      {/* Main */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg0)' }}>
        <header style={{ height: 54, flexShrink: 0, borderBottom: '1px solid var(--bg2)', display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px', background: 'oklch(0.155 0.006 255)' }}>
          {collapsed && (
            <button onClick={toggleSidebar} title="Hiện thanh điều hướng" style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--ln)', color: 'var(--tmd)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="menu" size={16} />
            </button>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '1px', color: 'var(--in)', background: 'var(--inb)', border: '1px solid var(--in3)', padding: '4px 9px', borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--in)', animation: 'tcsPulse 2s infinite' }} />LIVE
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--ln)', color: 'var(--tmd)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
              <Icon name="bell" size={16} />
              <span style={{ position: 'absolute', top: 7, right: 8, width: 6, height: 6, borderRadius: '50%', background: 'var(--alm)' }} />
            </button>
            <Clock />
          </div>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
