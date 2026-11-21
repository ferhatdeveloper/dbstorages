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
  Lock,
} from 'lucide-react'

type Tab = { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

const groups: { id: string; label: string; tabs: Tab[] }[] = [
  {
    id: 'compute',
    label: 'Compute',
    tabs: [
      { to: '/cloud/providers', label: 'Providers', icon: CloudCog },
      { to: '/cloud/servers', label: 'Servers', icon: Server },
      { to: '/cloud/placement-groups', label: 'Placement Groups', icon: Layers },
    ],
  },
  {
    id: 'storage',
    label: 'Storage',
    tabs: [
      { to: '/cloud/volumes', label: 'Volumes', icon: HardDrive },
      { to: '/cloud/snapshots', label: 'Snapshots', icon: Camera },
    ],
  },
  {
    id: 'network',
    label: 'Networking',
    tabs: [
      { to: '/cloud/networks', label: 'Networks', icon: Network },
      { to: '/cloud/primary-ips', label: 'Primary IPs', icon: Globe },
      { to: '/cloud/floating-ips', label: 'Floating IPs', icon: Share2 },
      { to: '/cloud/load-balancers', label: 'Load Balancers', icon: Scale },
      { to: '/cloud/dns', label: 'DNS / PTR', icon: AtSign },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    tabs: [
      { to: '/cloud/vpn', label: 'VPN / WireGuard', icon: Lock },
      { to: '/cloud/firewalls', label: 'Firewalls', icon: Shield },
      { to: '/cloud/certificates', label: 'Certificates', icon: FileKey },
      { to: '/cloud/ssh-keys', label: 'SSH Keys', icon: Key },
    ],
  },
  {
    id: 'ops',
    label: 'Observability',
    tabs: [
      { to: '/cloud/activity', label: 'Activity', icon: Activity },
      { to: '/cloud/jobs', label: 'Jobs', icon: ListTodo },
      { to: '/cloud/parity', label: 'Parity', icon: TableProperties },
    ],
  },
]

const CloudLayout: React.FC = () => {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Nested resource sidebar — Hetzner Cloud style */}
      <aside className="w-[200px] shrink-0 overflow-y-auto border-r border-slate-800/80 bg-[#0c1218]">
        <div className="border-b border-slate-800/80 px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Resources
          </div>
          <div className="mt-0.5 text-[13px] font-semibold text-slate-100">Cloud</div>
        </div>
        <nav className="space-y-3 p-2" aria-label="Cloud resources">
          {groups.map((group) => (
            <div key={group.id}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.tabs.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded px-2 py-1.5 text-[12.5px] ${
                        isActive
                          ? 'bg-red-600/15 font-medium text-red-400'
                          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
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
      </aside>

      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-5">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default CloudLayout
