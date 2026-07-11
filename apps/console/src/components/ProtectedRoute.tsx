import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { redirectToWebLogin } from '../lib/urls'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
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
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" />
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

  return <>{children}</>
}

export default ProtectedRoute
