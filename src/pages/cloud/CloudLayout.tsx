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
  Globe,
  Share2,
  Scale,
  Layers,
  FileKey,
  AtSign,
  TableProperties,
} from 'lucide-react'

type Tab = { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

const groups: { id: string; label: string; tabs: Tab[] }[] = [
  {
    id: 'compute',
    label: 'Compute',
    tabs: [
      { to: '/app/cloud/providers', label: 'Providers', icon: CloudCog },
      { to: '/app/cloud/servers', label: 'Servers', icon: Server },
      { to: '/app/cloud/placement-groups', label: 'Placement', icon: Layers },
    ],
  },
  {
    id: 'storage',
    label: 'Storage',
    tabs: [
      { to: '/app/cloud/volumes', label: 'Volumes', icon: HardDrive },
      { to: '/app/cloud/snapshots', label: 'Snapshots', icon: Camera },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    tabs: [
      { to: '/app/cloud/networks', label: 'Networks', icon: Network },
      { to: '/app/cloud/primary-ips', label: 'Primary IPs', icon: Globe },
      { to: '/app/cloud/floating-ips', label: 'Floating IPs', icon: Share2 },
      { to: '/app/cloud/load-balancers', label: 'Load Balancers', icon: Scale },
      { to: '/app/cloud/dns', label: 'DNS / PTR', icon: AtSign },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    tabs: [
      { to: '/app/cloud/firewalls', label: 'Firewalls', icon: Shield },
      { to: '/app/cloud/certificates', label: 'Certificates', icon: FileKey },
    ],
  },
  {
    id: 'access',
    label: 'Access',
    tabs: [{ to: '/app/cloud/ssh-keys', label: 'SSH Keys', icon: Key }],
  },
  {
    id: 'ops',
    label: 'Ops',
    tabs: [
      { to: '/app/cloud/activity', label: 'Activity', icon: Activity },
      { to: '/app/cloud/jobs', label: 'Jobs', icon: ListTodo },
      { to: '/app/cloud/parity', label: 'Parity', icon: TableProperties },
    ],
  },
]

const CloudLayout: React.FC = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50/80 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1
                className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-xl"
                style={{ fontFamily: 'Syne, sans-serif' }}
              >
                Cloud Infrastructure
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                Hetzner Console parity — perakende fiyat ×1.20 EUR. DB planlarından ayrı.
              </p>
            </div>
          </div>

          <nav className="mt-3 flex flex-col gap-2.5" aria-label="Cloud alt menü">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex flex-wrap items-center gap-x-1 gap-y-1.5"
              >
                <span className="mr-1 w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 sm:w-20">
                  {group.label}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {group.tabs.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition sm:text-xs ${
                          isActive
                            ? 'bg-teal-700 text-white shadow-sm dark:bg-lime-500 dark:text-slate-900'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`
                      }
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default CloudLayout
