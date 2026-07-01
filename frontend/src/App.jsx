import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppShell from './components/AppShell'
import Login             from './pages/Login'
import Dashboard         from './pages/Dashboard'
import GateLog           from './pages/GateLog'
import Rooms             from './pages/Rooms'
import RoomLog           from './pages/RoomLog'
import EnrollShell        from './pages/enroll/EnrollShell'
import EnrollSessions     from './pages/enroll/EnrollSessions'
import EnrollReview       from './pages/enroll/EnrollReview'
import EnrollDuplicates   from './pages/enroll/EnrollDuplicates'
import EnrollProfilesList from './pages/enroll/EnrollProfilesList'
import EnrollOccupancy    from './pages/enroll/EnrollOccupancy'
import EnrollJobs         from './pages/enroll/EnrollJobs'
import GateSessionPage    from './pages/enroll/GateSessionDetail'
import EnrollProfile     from './pages/EnrollProfile'
import EnrollMerge       from './pages/EnrollMerge'
import AirbnbCalendar    from './pages/AirbnbCalendar'
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
            <Route path="room-log"  element={<RoomLog />} />

            <Route path="enroll" element={<EnrollShell />}>
              <Route index               element={<Navigate to="/enroll/sessions" replace />} />
              <Route path="sessions"      element={<EnrollSessions />} />
              <Route path="sessions/gate/:doorId" element={<GateSessionPage />} />
              <Route path="review"        element={<EnrollReview />} />
              <Route path="duplicates"    element={<EnrollDuplicates />} />
              <Route path="profiles"      element={<EnrollProfilesList />} />
              <Route path="occupancy"     element={<EnrollOccupancy />} />
              <Route path="jobs"          element={<EnrollJobs />} />
            </Route>
            <Route path="enroll/profiles/:id"     element={<EnrollProfile />} />
            <Route path="enroll/merge/:clusterId" element={<EnrollMerge />} />

            <Route path="airbnb"                element={<AirbnbCalendar />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
