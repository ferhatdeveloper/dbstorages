import React from 'react'
import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const SUPERVISOR_ROLES = new Set(['supervisor', 'admin'])

const tabs = [
  { to: '/supervisor', end: true, label: 'Özet' },
  { to: '/supervisor/users', label: 'Kullanıcılar' },
  { to: '/supervisor/tenants', label: 'Tenant’lar' },
  { to: '/supervisor/payments', label: 'Ödemeler' },
  { to: '/supervisor/servers', label: 'Cloud sunucular' },
]

const SupervisorLayout: React.FC = () => {
  const { user } = useAuth()
  if (!SUPERVISOR_ROLES.has(String(user?.role || ''))) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800/90 bg-[#0e141b] px-3 py-2">
        <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-red-400">
          Supervisor
        </span>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `rounded px-2.5 py-1.5 text-[12.5px] ${
                isActive
                  ? 'bg-red-600/15 text-red-400'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <Outlet />
      </div>
    </div>
  )
}

export default SupervisorLayout
