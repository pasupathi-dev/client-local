// src/components/ProtectedRoute.jsx
// Wraps any route that requires authentication.
// If not logged in → redirect to /login.

import { Navigate } from 'react-router-dom'
import { useAuth }  from '@/hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}
