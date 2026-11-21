import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PricingPage from './pages/PricingPage';
import BillingSuccessPage from './pages/BillingSuccessPage';
import SelectDatabasePage from './pages/SelectDatabasePage';
import TableEditorPage from './pages/TableEditorPage';
import SqlEditorPage from './pages/SqlEditorPage';
import AuthPage from './pages/AuthPage';
import StoragePage from './pages/StoragePage';
import EdgeFunctionsPage from './pages/EdgeFunctionsPage';
import SchemaPage from './pages/SchemaPage';
import SettingsPage from './pages/SettingsPage';
import { ReportsPage, UsageReport, AuditLog } from './pages/ReportsPage';
import AdvisorsPage from './pages/AdvisorsPage';
import LogsPage from './pages/LogsPage';
import ApiDocsPage from './pages/ApiDocsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import RealtimePage from './pages/RealtimePage';
import ConnectionsPage from './pages/ConnectionsPage';
import AIPage from './pages/AIPage';
import DashboardPage from './pages/DashboardPage';
import MigrationPage from './pages/MigrationPage';
import BillingHistoryPage from './pages/BillingHistoryPage'
import CloudLayout from './pages/cloud/CloudLayout'
import CloudProvidersPage from './pages/cloud/CloudProvidersPage'
import CloudServersPage from './pages/cloud/CloudServersPage'
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

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/billing/success" element={<BillingSuccessPage />} />

      {/* Protected Studio */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="database" element={<SelectDatabasePage />} />
        <Route path="tables" element={<TableEditorPage />} />
        <Route path="sql" element={<SqlEditorPage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="functions" element={<EdgeFunctionsPage />} />
        <Route path="schema" element={<SchemaPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="reports" element={<ReportsPage />}>
          <Route index element={<Navigate to="/app/reports/usage" replace />} />
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
        <Route path="pricing" element={<PricingPage />} />
        <Route path="cloud" element={<CloudLayout />}>
          <Route index element={<Navigate to="/app/cloud/servers" replace />} />
          <Route path="providers" element={<CloudProvidersPage />} />
          <Route path="servers" element={<CloudServersPage />} />
          <Route path="volumes" element={<CloudVolumesPage />} />
          <Route path="snapshots" element={<CloudSnapshotsPage />} />
          <Route path="firewalls" element={<CloudFirewallsPage />} />
          <Route path="ssh-keys" element={<CloudSshKeysPage />} />
          <Route path="networks" element={<CloudNetworksPage />} />
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

      {/* Back-compat redirects into /app */}
      <Route path="/database" element={<Navigate to="/app/database" replace />} />
      <Route path="/tables" element={<Navigate to="/app/tables" replace />} />
      <Route path="/sql" element={<Navigate to="/app/sql" replace />} />
      <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/schema" element={<Navigate to="/app/schema" replace />} />
      <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
      <Route path="/auth" element={<Navigate to="/app/auth" replace />} />
      <Route path="/storage" element={<Navigate to="/app/storage" replace />} />
      <Route path="/functions" element={<Navigate to="/app/functions" replace />} />
      <Route path="/connections" element={<Navigate to="/app/connections" replace />} />
      <Route path="/migration" element={<Navigate to="/app/migration" replace />} />
      <Route path="/ai" element={<Navigate to="/app/ai" replace />} />
      <Route path="/advisors" element={<Navigate to="/app/advisors" replace />} />
      <Route path="/logs" element={<Navigate to="/app/logs" replace />} />
      <Route path="/api-docs" element={<Navigate to="/app/api-docs" replace />} />
      <Route path="/integrations" element={<Navigate to="/app/integrations" replace />} />
      <Route path="/realtime" element={<Navigate to="/app/realtime" replace />} />
      <Route path="/reports/*" element={<Navigate to="/app/reports/usage" replace />} />
      <Route path="/cloud/*" element={<Navigate to="/app/cloud/servers" replace />} />
    </Routes>
  );
}

export default App;
