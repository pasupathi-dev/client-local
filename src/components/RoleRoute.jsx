// src/components/RoleRoute.jsx
// Wraps a route that should only be reachable by certain roles.
// If the logged-in user's role isn't allowed, we send them to *their* home,
// not to /login (they're already authed — it's just the wrong section).
//
// Usage:
//   <RoleRoute allow="user">     <Shell><MapHomePage /></Shell></RoleRoute>
//   <RoleRoute allow="partner">  <Shell><PartnerDashboardPage /></Shell></RoleRoute>
//   <RoleRoute allow={['user','partner']}> <Shell><ChatPage /></Shell></RoleRoute>

import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectProfile } from '@/features/profile/profileSlice'

const HOME_BY_ROLE = { user: '/', partner: '/partner' }

export default function RoleRoute({ allow, children }) {
  const profile = useSelector(selectProfile)
  const role    = profile?.role

  // Profile not loaded yet — let ProtectedRoute / App-level gates handle it.
  if (!role) return <Navigate to="/login" replace />

  const allowed = Array.isArray(allow) ? allow : [allow]
  if (!allowed.includes(role)) {
    return <Navigate to={HOME_BY_ROLE[role] || '/'} replace />
  }

  return children
}
