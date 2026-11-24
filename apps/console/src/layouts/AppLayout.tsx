import React, { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ProjectSwitcher from '../components/ProjectSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import { CurrencyToggle, GraphCoreLogo } from '@graphcore/shared'
import { webPath } from '../lib/urls'
import {
  Database,
  Table,
  Code,
  Users,
  Cloud,
  Zap,
  BarChart3,
  Settings,
  Lock,
  Layers,
  BookOpen,
  AlertCircle,
  FileText as FileTextIcon,
  Activity,
  Folder,
  Brain,
  BarChart,
  GitBranch,
  Receipt,
  Server,
  ChevronDown,
  ExternalLink,
  Shield,
} from 'lucide-react'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
  match?: string
}

type NavSection = {
  id: string
  label: string
  items: NavItem[]
}

const studioSections: NavSection[] = [
  {
    id: 'project',
    label: 'Studio',
    items: [
      { to: '/dashboard', icon: <BarChart className="h-4 w-4" />, label: 'Dashboard' },
      { to: '/tables', icon: <Table className="h-4 w-4" />, label: 'Table Editor' },
      { to: '/sql', icon: <Code className="h-4 w-4" />, label: 'SQL Editor' },
      { to: '/schema', icon: <Layers className="h-4 w-4" />, label: 'Schema' },
      { to: '/database', icon: <Database className="h-4 w-4" />, label: 'Database' },
      { to: '/connections', icon: <Database className="h-4 w-4" />, label: 'Connections' },
      { to: '/migration', icon: <GitBranch className="h-4 w-4" />, label: 'Migration' },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    items: [
      { to: '/auth', icon: <Users className="h-4 w-4" />, label: 'Authentication' },
      { to: '/storage', icon: <Cloud className="h-4 w-4" />, label: 'Storage' },
      { to: '/functions', icon: <Zap className="h-4 w-4" />, label: 'Edge Functions' },
      { to: '/realtime', icon: <Activity className="h-4 w-4" />, label: 'Realtime' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { to: '/ai', icon: <Brain className="h-4 w-4" />, label: 'AI Assistant' },
      { to: '/advisors', icon: <AlertCircle className="h-4 w-4" />, label: 'Advisors' },
      { to: '/reports/usage', icon: <BarChart3 className="h-4 w-4" />, label: 'Reports', match: '/reports' },
      { to: '/logs', icon: <FileTextIcon className="h-4 w-4" />, label: 'Logs' },
      { to: '/api-docs', icon: <BookOpen className="h-4 w-4" />, label: 'API Docs' },
      { to: '/integrations', icon: <Folder className="h-4 w-4" />, label: 'Integrations' },
      { to: '/billing', icon: <Receipt className="h-4 w-4" />, label: 'Billing' },
      { to: '/settings', icon: <Settings className="h-4 w-4" />, label: 'Settings' },
    ],
  },
]

const AppLayout = () => {
  const location = useLocation()
  const { logout, user } = useAuth()
  const isCloud = location.pathname.startsWith('/cloud')
  const [studioOpen, setStudioOpen] = useState(!isCloud)

  const handleLogout = () => {
    logout()
    window.location.assign(webPath('/login'))
  }

  const isSupervisor = location.pathname.startsWith('/supervisor')
  const isSupervisorUser = ['supervisor', 'admin'].includes(String(user?.role || ''))

  const activeLabel = useMemo(() => {
    if (isSupervisor) return 'Supervisor'
    if (isCloud) return 'Cloud Infrastructure'
    for (const s of studioSections) {
      for (const item of s.items) {
        const prefix = item.match || item.to
        if (location.pathname === item.to || location.pathname.startsWith(prefix + '/')) {
          return item.label
        }
        if (location.pathname.startsWith(item.to) && item.to !== '/') return item.label
      }
    }
    return 'Console'
  }, [location.pathname, isCloud, isSupervisor])

  return (
    <div className="flex h-screen bg-[#0b0f14] text-slate-200">
      {/* Hetzner-like dense left rail */}
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-slate-800/90 bg-[#0e141b]">
        <div className="border-b border-slate-800/90 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <GraphCoreLogo variant="compact" invert className="gc-logo-console" />
              <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">
                Console
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <CurrencyToggle />
              <ThemeToggle variant="icon" />
            </div>
          </div>
          <div className="mt-2">
            <ProjectSwitcher />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <NavLink
            to="/cloud/servers"
            className={({ isActive }) =>
              `mb-1 flex items-center gap-2 rounded px-2.5 py-2 text-[13px] font-medium ${
                isActive || isCloud
                  ? 'bg-red-600/15 text-red-400'
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`
            }
          >
            <Server className="h-4 w-4 shrink-0" />
            Cloud Infrastructure
          </NavLink>

          {isSupervisorUser && (
            <NavLink
              to="/supervisor"
              className={({ isActive }) =>
                `mb-1 flex items-center gap-2 rounded px-2.5 py-2 text-[13px] font-medium ${
                  isActive || isSupervisor
                    ? 'bg-red-600/15 text-red-400'
                    : 'text-slate-300 hover:bg-slate-800/70'
                }`
              }
            >
              <Shield className="h-4 w-4 shrink-0" />
              Supervisor
            </NavLink>
          )}

          <button
            type="button"
            onClick={() => setStudioOpen((v) => !v)}
            className="mb-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13px] font-medium text-slate-300 hover:bg-slate-800/70"
          >
            <Database className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">DB Studio</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-500 transition ${studioOpen ? 'rotate-0' : '-rotate-90'}`}
            />
          </button>

          {studioOpen &&
            studioSections.map((section) => (
              <div key={section.id} className="mb-2">
                <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => {
                        const match = item.match
                          ? location.pathname.startsWith(item.match)
                          : isActive || location.pathname.startsWith(item.to)
                        return `flex items-center gap-2 rounded px-2.5 py-1.5 text-[12.5px] ${
                          match && !isCloud
                            ? 'bg-slate-800 text-red-400'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`
                      }}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
        </nav>

        <div className="space-y-1 border-t border-slate-800/90 p-2">
          <a
            href={webPath('/database')}
            className="flex items-center gap-2 rounded px-2.5 py-1.5 text-[12px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Marketing / Database
          </a>
          <div className="truncate px-2.5 text-[11px] text-slate-500">{user?.email}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[12.5px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          >
            <Lock className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center border-b border-slate-800/90 bg-[#0e141b] px-4">
          <div className="text-[13px] font-medium text-slate-200">{activeLabel}</div>
          <div className="ml-auto text-[11px] text-slate-500">Cloud console</div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden bg-[#0b0f14]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppLayout
