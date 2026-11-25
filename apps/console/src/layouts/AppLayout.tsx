import React, { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ProjectSwitcher from '../components/ProjectSwitcher'
import { GraphCoreLogo, PrefsBar, useLocale } from '@graphcore/shared'
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
  labelKey: string
  icon: React.ReactNode
  match?: string
}

type NavSection = {
  id: string
  labelKey: string
  items: NavItem[]
}

const studioSections: NavSection[] = [
  {
    id: 'project',
    labelKey: 'console.section.studio',
    items: [
      { to: '/dashboard', icon: <BarChart className="h-4 w-4" />, labelKey: 'console.nav.dashboard' },
      { to: '/tables', icon: <Table className="h-4 w-4" />, labelKey: 'console.nav.tables' },
      { to: '/sql', icon: <Code className="h-4 w-4" />, labelKey: 'console.nav.sql' },
      { to: '/schema', icon: <Layers className="h-4 w-4" />, labelKey: 'console.nav.schema' },
      { to: '/database', icon: <Database className="h-4 w-4" />, labelKey: 'console.nav.database' },
      { to: '/connections', icon: <Database className="h-4 w-4" />, labelKey: 'console.nav.connections' },
      { to: '/migration', icon: <GitBranch className="h-4 w-4" />, labelKey: 'console.nav.migration' },
    ],
  },
  {
    id: 'platform',
    labelKey: 'console.section.platform',
    items: [
      { to: '/auth', icon: <Users className="h-4 w-4" />, labelKey: 'console.nav.auth' },
      { to: '/storage', icon: <Cloud className="h-4 w-4" />, labelKey: 'console.nav.storage' },
      { to: '/functions', icon: <Zap className="h-4 w-4" />, labelKey: 'console.nav.functions' },
      { to: '/realtime', icon: <Activity className="h-4 w-4" />, labelKey: 'console.nav.realtime' },
    ],
  },
  {
    id: 'tools',
    labelKey: 'console.section.tools',
    items: [
      { to: '/ai', icon: <Brain className="h-4 w-4" />, labelKey: 'console.nav.ai' },
      { to: '/advisors', icon: <AlertCircle className="h-4 w-4" />, labelKey: 'console.nav.advisors' },
      { to: '/reports/usage', icon: <BarChart3 className="h-4 w-4" />, labelKey: 'console.nav.reports', match: '/reports' },
      { to: '/logs', icon: <FileTextIcon className="h-4 w-4" />, labelKey: 'console.nav.logs' },
      { to: '/api-docs', icon: <BookOpen className="h-4 w-4" />, labelKey: 'console.nav.apiDocs' },
      { to: '/integrations', icon: <Folder className="h-4 w-4" />, labelKey: 'console.nav.integrations' },
      { to: '/billing', icon: <Receipt className="h-4 w-4" />, labelKey: 'console.nav.billing' },
      { to: '/settings', icon: <Settings className="h-4 w-4" />, labelKey: 'console.nav.settings' },
    ],
  },
]

const navIdle =
  'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
const navActiveStudio =
  'bg-slate-100 text-red-600 dark:bg-slate-800 dark:text-red-400'
const navActiveCloud =
  'bg-red-600/10 text-red-600 dark:bg-red-600/15 dark:text-red-400'

const AppLayout = () => {
  const location = useLocation()
  const { logout, user } = useAuth()
  const { t } = useLocale()
  const isCloud = location.pathname.startsWith('/cloud')
  const [studioOpen, setStudioOpen] = useState(!isCloud)

  const handleLogout = () => {
    logout()
    window.location.assign(webPath('/login'))
  }

  const isSupervisor = location.pathname.startsWith('/supervisor')
  const isSupervisorUser = ['supervisor', 'admin'].includes(String(user?.role || ''))

  const activeLabel = useMemo(() => {
    if (isSupervisor) return t('console.supervisor')
    if (isCloud) return t('console.cloudInfra')
    for (const s of studioSections) {
      for (const item of s.items) {
        const prefix = item.match || item.to
        if (location.pathname === item.to || location.pathname.startsWith(prefix + '/')) {
          return t(item.labelKey)
        }
        if (location.pathname.startsWith(item.to) && item.to !== '/') return t(item.labelKey)
      }
    }
    return t('console.brand')
  }, [location.pathname, isCloud, isSupervisor, t])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800 dark:bg-[#0b0f14] dark:text-slate-200">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800/90 dark:bg-[#0e141b]">
        <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800/90">
          <div className="min-w-0">
            <GraphCoreLogo variant="compact" className="gc-logo-console" />
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-slate-500">
              {t('console.brand')}
            </div>
          </div>
          <div className="mt-2.5">
            <ProjectSwitcher />
          </div>
        </div>

        <nav className="console-scroll flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          <NavLink
            to="/cloud/servers"
            className={({ isActive }) =>
              `mb-1 flex items-center gap-2 rounded px-2.5 py-2 text-[13px] font-medium ${
                isActive || isCloud ? navActiveCloud : navIdle
              }`
            }
          >
            <Server className="h-4 w-4 shrink-0" />
            {t('console.cloudInfra')}
          </NavLink>

          {isSupervisorUser && (
            <NavLink
              to="/supervisor"
              className={({ isActive }) =>
                `mb-1 flex items-center gap-2 rounded px-2.5 py-2 text-[13px] font-medium ${
                  isActive || isSupervisor ? navActiveCloud : navIdle
                }`
              }
            >
              <Shield className="h-4 w-4 shrink-0" />
              {t('console.supervisor')}
            </NavLink>
          )}

          <button
            type="button"
            onClick={() => setStudioOpen((v) => !v)}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13px] font-medium ${navIdle}`}
          >
            <Database className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{t('console.dbStudio')}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-500 transition ${studioOpen ? 'rotate-0' : '-rotate-90'}`}
            />
          </button>

          {studioOpen &&
            studioSections.map((section) => (
              <div key={section.id} className="mb-2">
                <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {t(section.labelKey)}
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
                            ? navActiveStudio
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                        }`
                      }}
                    >
                      {item.icon}
                      <span>{t(item.labelKey)}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
        </nav>

        <div className="space-y-1 border-t border-slate-200 p-2 dark:border-slate-800/90">
          <a
            href={webPath('/database')}
            className="flex items-center gap-2 rounded px-2.5 py-1.5 text-[12px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('console.marketingDb')}
          </a>
          <div className="truncate px-2.5 text-[11px] text-slate-500">{user?.email}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[12.5px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
          >
            <Lock className="h-3.5 w-3.5" />
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800/90 dark:bg-[#0e141b]">
          <div className="min-w-0 truncate text-[13px] font-medium text-slate-800 dark:text-slate-200">
            {activeLabel}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <PrefsBar />
            <span className="hidden text-[11px] text-slate-400 sm:inline">
              {t('console.cloudConsole')}
            </span>
          </div>
        </header>
        <main className="console-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 dark:bg-[#0b0f14]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppLayout
