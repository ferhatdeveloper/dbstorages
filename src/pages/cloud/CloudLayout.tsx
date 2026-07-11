import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Server,
  HardDrive,
  Camera,
  Shield,
  Key,
  Network,
  Activity,
  ListTodo,
  CloudCog,
} from 'lucide-react'

const tabs = [
  { to: '/app/cloud/providers', label: 'Providers', icon: CloudCog },
  { to: '/app/cloud/servers', label: 'Servers', icon: Server },
  { to: '/app/cloud/volumes', label: 'Volumes', icon: HardDrive },
  { to: '/app/cloud/snapshots', label: 'Snapshots', icon: Camera },
  { to: '/app/cloud/firewalls', label: 'Firewalls', icon: Shield },
  { to: '/app/cloud/ssh-keys', label: 'SSH Keys', icon: Key },
  { to: '/app/cloud/networks', label: 'Networks', icon: Network },
  { to: '/app/cloud/activity', label: 'Activity', icon: Activity },
  { to: '/app/cloud/jobs', label: 'Provisioning Jobs', icon: ListTodo },
]

const CloudLayout: React.FC = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Cloud Infrastructure
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Provider-bağımsız sunucu, volume, firewall ve ağ yönetimi. DB
          planlarından ayrı ek hizmet.
        </p>
        <nav className="mt-4 flex flex-wrap gap-1">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-slate-800 dark:text-lime-400'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <Outlet />
      </div>
    </div>
  )
}

export default CloudLayout
