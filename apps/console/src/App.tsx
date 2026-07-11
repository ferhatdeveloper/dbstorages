import React from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import SelectDatabasePage from './pages/SelectDatabasePage'
import TableEditorPage from './pages/TableEditorPage'
import SqlEditorPage from './pages/SqlEditorPage'
import AuthPage from './pages/AuthPage'
import StoragePage from './pages/StoragePage'
import EdgeFunctionsPage from './pages/EdgeFunctionsPage'
import SchemaPage from './pages/SchemaPage'
import SettingsPage from './pages/SettingsPage'
import { ReportsPage, UsageReport, AuditLog } from './pages/ReportsPage'
import AdvisorsPage from './pages/AdvisorsPage'
import LogsPage from './pages/LogsPage'
import ApiDocsPage from './pages/ApiDocsPage'
import IntegrationsPage from './pages/IntegrationsPage'
import RealtimePage from './pages/RealtimePage'
import ConnectionsPage from './pages/ConnectionsPage'
import AIPage from './pages/AIPage'
import DashboardPage from './pages/DashboardPage'
import MigrationPage from './pages/MigrationPage'
import BillingHistoryPage from './pages/BillingHistoryPage'
import CloudLayout from './pages/cloud/CloudLayout'
import CloudProvidersPage from './pages/cloud/CloudProvidersPage'
import CloudServersPage from './pages/cloud/CloudServersPage'
import CloudServerDetailPage from './pages/cloud/CloudServerDetailPage'
import CloudVpnPage from './pages/cloud/CloudVpnPage'
import {
  CloudVolumesPage,
  CloudSnapshotsPage,
  CloudFirewallsPage,
  CloudSshKeysPage,
  CloudNetworksPage,
  CloudActivityPage,
  CloudJobsPage,
} from './pages/cloud/CloudResourcePage'
import {
  CloudPrimaryIpsPage,
  CloudFloatingIpsPage,
  CloudLoadBalancersPage,
  CloudPlacementGroupsPage,
  CloudCertificatesPage,
  CloudDnsPage,
  CloudParityPage,
} from './pages/cloud/CloudExtraPages'
import ConsoleLoginBridge from './pages/ConsoleLoginBridge'

function AppLegacyRedirect() {
  const params = useParams()
  const rest = (params['*'] || 'dashboard').replace(/^\//, '')
  return <Navigate to={`/${rest}`} replace />
}

function App() {
  return (
    <Routes>
      {/* Optional local login bridge (dev / bookmark) */}
      <Route path="/login" element={<ConsoleLoginBridge />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="database" element={<SelectDatabasePage />} />
        <Route path="tables" element={<TableEditorPage />} />
        <Route path="sql" element={<SqlEditorPage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="functions" element={<EdgeFunctionsPage />} />
        <Route path="schema" element={<SchemaPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="reports" element={<ReportsPage />}>
          <Route index element={<Navigate to="/reports/usage" replace />} />
          <Route path="usage" element={<UsageReport />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
        <Route path="advisors" element={<AdvisorsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="api-docs" element={<ApiDocsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="realtime" element={<RealtimePage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="ai" element={<AIPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="migration" element={<MigrationPage />} />
        <Route path="billing" element={<BillingHistoryPage />} />
        <Route path="cloud" element={<CloudLayout />}>
          <Route index element={<Navigate to="/cloud/servers" replace />} />
          <Route path="providers" element={<CloudProvidersPage />} />
          <Route path="servers" element={<CloudServersPage />} />
          <Route path="servers/:id" element={<CloudServerDetailPage />} />
          <Route path="volumes" element={<CloudVolumesPage />} />
          <Route path="snapshots" element={<CloudSnapshotsPage />} />
          <Route path="firewalls" element={<CloudFirewallsPage />} />
          <Route path="ssh-keys" element={<CloudSshKeysPage />} />
          <Route path="networks" element={<CloudNetworksPage />} />
          <Route path="vpn" element={<CloudVpnPage />} />
          <Route path="primary-ips" element={<CloudPrimaryIpsPage />} />
          <Route path="floating-ips" element={<CloudFloatingIpsPage />} />
          <Route path="load-balancers" element={<CloudLoadBalancersPage />} />
          <Route path="placement-groups" element={<CloudPlacementGroupsPage />} />
          <Route path="certificates" element={<CloudCertificatesPage />} />
          <Route path="dns" element={<CloudDnsPage />} />
          <Route path="parity" element={<CloudParityPage />} />
          <Route path="activity" element={<CloudActivityPage />} />
          <Route path="jobs" element={<CloudJobsPage />} />
        </Route>
      </Route>

      {/* Back-compat: old /app/* URLs → console root */}
      <Route path="/app" element={<Navigate to="/dashboard" replace />} />
      <Route path="/app/*" element={<AppLegacyRedirect />} />
    </Routes>
  )
}

export default App
