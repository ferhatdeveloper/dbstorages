import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { redirectToWebLogin } from '../lib/urls'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** When true, only supervisor/admin roles may pass. */
  requireSupervisor?: boolean
}

const SUPERVISOR_ROLES = new Set(['supervisor', 'admin'])

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireSupervisor = false,
}) => {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      redirectToWebLogin(location.pathname + location.search)
    }
  }, [loading, isAuthenticated, location.pathname, location.search])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <p className="text-sm text-slate-300">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">Giriş sayfasına yönlendiriliyor…</p>
      </div>
    )
  }

  if (requireSupervisor && !SUPERVISOR_ROLES.has(String(user?.role || ''))) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
