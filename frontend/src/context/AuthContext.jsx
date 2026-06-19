import { createContext, useContext, useState, useCallback } from 'react'
import { login as apiLogin } from '../api/client'

const AuthCtx = createContext(null)

// Simple token-based auth.
// Token is a signed string from backend; stored in localStorage.
// TODO: upgrade to proper JWT with expiry check when backend supports it.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('tcs_user')
    return raw ? JSON.parse(raw) : null
  })

  const login = useCallback(async (username, password) => {
    const { data } = await apiLogin(username, password)
    // backend returns { token, user: { username, role } }
    localStorage.setItem('tcs_token', data.token)
    localStorage.setItem('tcs_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('tcs_token')
    localStorage.removeItem('tcs_user')
    setUser(null)
  }, [])

  return (
    <AuthCtx.Provider value={{ user, login, logout, isAuth: !!user }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
