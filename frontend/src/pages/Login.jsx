import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon, Spinner } from '../components/UI'
import s from './Login.module.css'

export default function Login() {
  const { login } = useAuth()
  const navigate   = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const submit = async e => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      await login(username.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Sai tên đăng nhập hoặc mật khẩu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.screen}>
      {/* background grain */}
      <div className={s.grain} />

      <div className={s.card}>
        {/* Logo */}
        <div className={s.logo}>
          <div className={s.logoMark}><span className={s.logoDot} /></div>
          <div>
            <div className={s.logoName}>87 TCS</div>
            <div className={s.logoSub}>Gate Monitor System</div>
          </div>
        </div>

        <h1 className={s.title}>Đăng nhập</h1>
        <p className={s.sub}>Quản lý ra vào · Camera · Hệ thống</p>

        <form className={s.form} onSubmit={submit}>
          <div className={s.field}>
            <label className={s.label}>Tên đăng nhập</label>
            <div className={s.inputWrap}>
              <Icon name="user" size={14} style={{ color: 'var(--tlo)', flexShrink: 0 }} />
              <input
                className={s.input}
                type="text"
                placeholder="admin"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>Mật khẩu</label>
            <div className={s.inputWrap}>
              <Icon name="eye" size={14} style={{ color: 'var(--tlo)', flexShrink: 0 }} />
              <input
                className={s.input}
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" className={s.eyeBtn} onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                <Icon name={showPw ? 'eyeOff' : 'eye'} size={13} />
              </button>
            </div>
          </div>

          {error && <div className={s.error}>{error}</div>}

          <button className={s.submit} type="submit" disabled={loading || !username || !password}>
            {loading ? <Spinner size={15} /> : 'Đăng nhập'}
          </button>
        </form>

        <div className={s.hint}>
          <span className={s.mono} style={{ color: 'var(--txl)', fontSize: 10.5 }}>
            87 TCS · {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </div>
  )
}
