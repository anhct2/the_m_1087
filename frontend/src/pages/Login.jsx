import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon } from '../components/UI'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch {
      setErr('Sai tên đăng nhập hoặc mật khẩu')
    } finally {
      setBusy(false)
    }
  }

  const field = { display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 9, padding: '0 12px', height: 44 }
  const input = { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--thi)', fontSize: 13.5, fontFamily: 'inherit' }

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', background: 'oklch(0.13 0.006 255)' }}>
      {/* Brand panel */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(155deg, oklch(0.19 0.02 255) 0%, oklch(0.145 0.008 255) 60%)', borderRight: '1px solid var(--ln2)', padding: 56, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(oklch(0.5 0.02 255 / 0.05) 1px, transparent 1px), linear-gradient(90deg, oklch(0.5 0.02 255 / 0.05) 1px, transparent 1px)', backgroundSize: '38px 38px', maskImage: 'radial-gradient(circle at 30% 30%, black, transparent 75%)' }} />
        <div style={{ position: 'absolute', top: -120, right: -120, width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, oklch(0.78 0.15 152 / 0.14), transparent 70%)', filter: 'blur(10px)' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--ln2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--in)', boxShadow: '0 0 12px oklch(0.78 0.15 152 / 0.8)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: '0.5px', fontSize: 15 }}>87 TCS</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tlo)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Gate Monitor</div>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 40, lineHeight: 1.12, fontWeight: 600, letterSpacing: '-0.5px', maxWidth: 440 }}>
            Kiểm soát ra vào<br /><span style={{ color: 'var(--in)' }}>theo thời gian thực.</span>
          </div>
          <p style={{ margin: '22px 0 0', color: 'var(--tmd)', fontSize: 14, lineHeight: 1.7, maxWidth: 400 }}>
            Giám sát camera, nhận diện khuôn mặt và lịch sử ra vào của toàn bộ tòa nhà 87 TCS trong một bảng điều khiển duy nhất.
          </p>
          <div style={{ display: 'flex', gap: 28, marginTop: 38 }}>
            {[['12', 'Phòng giám sát'], ['3', 'Camera / cổng'], ['24/7', 'Hoạt động']].map(([v, l], i) => (
              <div key={i} style={{ display: 'flex', gap: 28 }}>
                {i > 0 && <div style={{ width: 1, background: 'var(--ln2)' }} />}
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600, color: i === 2 ? 'var(--in)' : 'var(--thi)' }}>{v}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--tlo)', marginTop: 2 }}>{l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)', letterSpacing: '0.5px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--in)', animation: 'tcsPulse 2s infinite' }} />
          HỆ THỐNG ĐANG TRỰC TUYẾN · 87 TCS © 2025
        </div>
      </div>

      {/* Form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 340 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>Đăng nhập</h1>
          <p style={{ color: 'var(--tlo)', fontSize: 13, margin: '8px 0 32px' }}>Nhập thông tin để truy cập bảng điều khiển</p>

          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--tmd)', marginBottom: 7 }}>Tên đăng nhập</label>
          <div style={{ ...field, marginBottom: 18 }}>
            <Icon name="user" size={15} style={{ color: 'var(--tlo)' }} />
            <input value={username} onChange={e => setUsername(e.target.value)} style={input} />
          </div>

          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--tmd)', marginBottom: 7 }}>Mật khẩu</label>
          <div style={{ ...field, marginBottom: err ? 12 : 26 }}>
            <Icon name="lock" size={15} style={{ color: 'var(--tlo)' }} />
            <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{ ...input, letterSpacing: showPw ? 0 : '2px' }} />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--tlo)', cursor: 'pointer', display: 'flex' }}>
              <Icon name="eye" size={15} />
            </button>
          </div>

          {err && <div style={{ color: 'var(--alm)', fontSize: 12, marginBottom: 18 }}>{err}</div>}

          <button type="submit" disabled={busy} style={{ width: '100%', height: 46, border: 'none', borderRadius: 9, background: 'var(--in)', color: 'oklch(0.16 0.03 152)', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.2px', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 28, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--txl)', letterSpacing: '1px' }}>87 TCS · GATE MONITOR · v2.0</div>
        </form>
      </div>
    </div>
  )
}
