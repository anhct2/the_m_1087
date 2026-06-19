import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppShell from './components/AppShell'
import Login     from './pages/Login'
import Dashboard from './pages/Dashboard'
import GateLog   from './pages/GateLog'
import Rooms     from './pages/Rooms'
import './styles/tokens.css'

function RequireAuth({ children }) {
  const { isAuth } = useAuth()
  return isAuth ? children : <Navigate to="/login" replace />
}

function RedirectIfAuth({ children }) {
  const { isAuth } = useAuth()
  return isAuth ? <Navigate to="/dashboard" replace /> : children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            <RedirectIfAuth><Login /></RedirectIfAuth>
          } />
          <Route path="/" element={
            <RequireAuth><AppShell /></RequireAuth>
          }>
            <Route index            element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="gate-log"  element={<GateLog />} />
            <Route path="rooms"     element={<Rooms />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
