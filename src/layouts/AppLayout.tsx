import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ProjectSwitcher from '../components/ProjectSwitcher'
import ThemeToggle from '../components/ThemeToggle'
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
  ChevronRight,
  BookOpen,
  AlertCircle,
  FileText as FileTextIcon,
  Activity,
  Folder,
  Sliders,
  Brain,
  BarChart,
  GitBranch,
  Receipt,
  Server,
} from 'lucide-react'

const menu = [
  {
    category: 'Project',
    items: [
      { to: '/app/dashboard', icon: <BarChart className="h-5 w-5" />, label: 'Dashboard' },
      { to: '/app/tables', icon: <Table className="h-5 w-5" />, label: 'Table Editor' },
      { to: '/app/sql', icon: <Code className="h-5 w-5" />, label: 'SQL Editor' },
      { to: '/app/schema', icon: <Layers className="h-5 w-5" />, label: 'Schema' },
      { to: '/app/database', icon: <Database className="h-5 w-5" />, label: 'Database' },
      { to: '/app/connections', icon: <Database className="h-5 w-5" />, label: 'Connections' },
      { to: '/app/migration', icon: <GitBranch className="h-5 w-5" />, label: 'Migration' },
    ],
  },
  {
    category: 'Platform',
    items: [
      { to: '/app/auth', icon: <Users className="h-5 w-5" />, label: 'Authentication' },
      { to: '/app/storage', icon: <Cloud className="h-5 w-5" />, label: 'Storage' },
      { to: '/app/functions', icon: <Zap className="h-5 w-5" />, label: 'Edge Functions' },
      { to: '/app/realtime', icon: <Activity className="h-5 w-5" />, label: 'Realtime' },
    ],
  },
  {
    category: 'Cloud',
    items: [
      {
        to: '/app/cloud/servers',
        icon: <Server className="h-5 w-5" />,
        label: 'Cloud Infrastructure',
        submenu: [
          { to: '/app/cloud/providers', label: 'Providers' },
          { to: '/app/cloud/servers', label: 'Servers' },
          { to: '/app/cloud/volumes', label: 'Volumes' },
          { to: '/app/cloud/snapshots', label: 'Snapshots' },
          { to: '/app/cloud/firewalls', label: 'Firewalls' },
          { to: '/app/cloud/ssh-keys', label: 'SSH Keys' },
          { to: '/app/cloud/networks', label: 'Networks' },
          { to: '/app/cloud/primary-ips', label: 'Primary IPs' },
          { to: '/app/cloud/floating-ips', label: 'Floating IPs' },
          { to: '/app/cloud/load-balancers', label: 'Load Balancers' },
          { to: '/app/cloud/placement-groups', label: 'Placement Groups' },
          { to: '/app/cloud/certificates', label: 'Certificates' },
          { to: '/app/cloud/dns', label: 'DNS / PTR' },
          { to: '/app/cloud/activity', label: 'Activity Logs' },
          { to: '/app/cloud/jobs', label: 'Provisioning Jobs' },
          { to: '/app/cloud/parity', label: 'Parity Matrix' },
        ],
      },
    ],
  },
  {
    category: 'Billing',
    items: [
      { to: '/pricing', icon: <Sliders className="h-5 w-5" />, label: 'Paketler' },
      { to: '/app/billing', icon: <Receipt className="h-5 w-5" />, label: 'Ödeme geçmişi' },
    ],
  },
  {
    category: 'Tools',
    items: [
      { to: '/app/ai', icon: <Brain className="h-5 w-5" />, label: 'AI Assistant' },
      { to: '/app/advisors', icon: <AlertCircle className="h-5 w-5" />, label: 'Advisors' },
      { to: '/app/reports', icon: <BarChart3 className="h-5 w-5" />, label: 'Reports', submenu: [
        { to: '/app/reports/usage', label: 'Usage Report' },
        { to: '/app/reports/audit', label: 'Audit Log' },
      ] },
      { to: '/app/logs', icon: <FileTextIcon className="h-5 w-5" />, label: 'Logs' },
      { to: '/app/api-docs', icon: <BookOpen className="h-5 w-5" />, label: 'API Docs' },
      { to: '/app/integrations', icon: <Folder className="h-5 w-5" />, label: 'Integrations' },
    ],
  },
  {
    category: 'Settings',
    items: [
      { to: '/app/settings', icon: <Settings className="h-5 w-5" />, label: 'Project Settings' },
    ],
  },
]

const AppLayout = () => {
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null)
  const navigate = useNavigate()
  const { logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="h-screen flex bg-[#f8fafb] dark:bg-slate-950">
      <aside className="w-56 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col py-4 space-y-2">
        <div className="mb-2 flex flex-col items-center justify-center px-2">
          <NavLink to="/app/dashboard">
            <Database className="h-7 w-7 text-teal-700 dark:text-lime-400" />
          </NavLink>
          <span
            className="mt-2 text-xl font-extrabold tracking-tight text-teal-800 dark:text-slate-100 select-none"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            GraphCore
          </span>
          <div className="mt-2">
            <ThemeToggle variant="pill" />
          </div>
        </div>
        <ProjectSwitcher />
        <nav className="flex flex-col gap-2 flex-1 overflow-y-auto">
          {menu.map((section) => (
            <div key={section.category + section.items[0].to} className="mb-2">
              <div className="px-4 py-1 text-xs text-gray-400 uppercase tracking-wider select-none">
                {section.category}
              </div>
              {section.items.map((item) => (
                <div key={item.to} className="relative group">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2 rounded-lg transition text-sm font-medium ${
                        isActive
                          ? 'bg-gray-100 text-blue-600 dark:bg-slate-800 dark:text-lime-400'
                          : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`
                    }
                    onMouseEnter={() => setHoveredMenu(item.label)}
                    onMouseLeave={() => setHoveredMenu(null)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.submenu && (
                      <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
                    )}
                  </NavLink>
                  {item.submenu && hoveredMenu === item.label && (
                    <div className="absolute left-full top-0 mt-0 ml-1 bg-white dark:bg-slate-900 border dark:border-slate-700 rounded shadow-lg min-w-[180px] z-20 animate-fade-in">
                      {item.submenu.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          className={({ isActive }) =>
                            `block px-4 py-2 text-sm rounded transition ${
                              isActive
                                ? 'bg-gray-100 text-blue-600 dark:bg-slate-800 dark:text-lime-400'
                                : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`
                          }
                        >
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto mb-2 px-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400"
          >
            <Lock className="h-5 w-5" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f8fafb] dark:bg-slate-950 dark:text-slate-100">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
