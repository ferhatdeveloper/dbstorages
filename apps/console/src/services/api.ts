// Dev'de Vite proxy: /api → :4000, /api/v1 → :8080
const GO_API_BASE = import.meta.env.VITE_GO_API_BASE || '/api/v1';
const NODE_API_BASE = import.meta.env.VITE_NODE_API_BASE || '/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string | { code?: string; message?: string };
  message?: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount: number;
  locked: boolean;
  created_at: string;
  updated_at: string;
  kind?: 'table' | 'view' | 'other';
  schema?: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default_value?: string;
  is_primary: boolean;
  is_foreign_key: boolean;
  referenced_table?: string;
  referenced_column?: string;
}

export interface TableData {
  columns: ColumnInfo[];
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
}

const INSTANCE_STORAGE_KEY = 'dbstorages-instance';

let activeInstanceId: string | null =
  typeof localStorage !== 'undefined'
    ? localStorage.getItem(INSTANCE_STORAGE_KEY)
    : null;

export function getActiveInstanceId(): string | null {
  return activeInstanceId || localStorage.getItem(INSTANCE_STORAGE_KEY);
}

export function setActiveInstanceId(id: string | null) {
  const prev =
    activeInstanceId ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem(INSTANCE_STORAGE_KEY)
      : null);
  if (prev === id) {
    activeInstanceId = id;
    return;
  }
  activeInstanceId = id;
  try {
    if (id) localStorage.setItem(INSTANCE_STORAGE_KEY, id);
    else localStorage.removeItem(INSTANCE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('dbstorages:instance', { detail: { id } })
    );
  }
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const instanceId = getActiveInstanceId();
  if (instanceId) headers['x-graphcore-instance'] = instanceId;
  return headers;
}

function withInstanceQuery(url: string): string {
  const instanceId = getActiveInstanceId();
  if (!instanceId) return url;
  if (!url.includes('/api/db') && !url.includes('/api/sql') && !url.includes('/api/schema')) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  if (url.includes('instanceId=')) return url;
  return `${url}${sep}instanceId=${encodeURIComponent(instanceId)}`;
}

function normalizeError(payload: any, status: number): string {
  if (!payload) return `API Error: ${status}`;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return payload.error.message;
  if (payload.message) return payload.message;
  return `API Error: ${status}`;
}

class ApiService {
  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const finalUrl = withInstanceQuery(url);
    const response = await fetch(finalUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...options.headers,
      },
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(normalizeError(payload, response.status));
    }

    return payload as T;
  }

  /** Prefer Node /api/db (real multi-tenant). Do not fall back to Go when an instance is selected. */
  async getTables(instanceId?: string | null): Promise<ApiResponse<TableInfo[]>> {
    const id = instanceId || getActiveInstanceId();
    if (id) setActiveInstanceId(id);
    try {
      return await this.request(`${NODE_API_BASE}/db/tables`);
    } catch (err) {
      // Go /api/v1/tables is single-DB and ignores instance — only use without instance
      if (id) throw err;
      const go = await this.request<any>(`${GO_API_BASE}/tables`);
      return {
        success: go.success !== false,
        data: go.data || go.tables || [],
        error: go.error,
      };
    }
  }

  async getTableData(
    tableName: string,
    page = 1,
    pageSize = 50,
    _filters?: Record<string, any>,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    instanceId?: string | null
  ): Promise<ApiResponse<TableData>> {
    const id = instanceId || getActiveInstanceId();
    if (id) setActiveInstanceId(id);
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (sortBy) qs.set('sortBy', sortBy);
    if (sortOrder) qs.set('sortOrder', sortOrder);

    try {
      return await this.request(
        `${NODE_API_BASE}/db/tables/${encodeURIComponent(tableName)}?${qs}`
      );
    } catch (err) {
      if (id) throw err;
      const go = await this.request<any>(
        `${GO_API_BASE}/tables/${encodeURIComponent(tableName)}?${qs}`
      );
      return {
        success: go.success !== false,
        data: go.data,
        error: go.error,
      };
    }
  }

  async insertRow(req: { tableName: string; data: Record<string, any> }) {
    try {
      return await this.request(
        `${NODE_API_BASE}/db/tables/${encodeURIComponent(req.tableName)}/rows`,
        { method: 'POST', body: JSON.stringify({ data: req.data }) }
      );
    } catch {
      return this.request(`${GO_API_BASE}/tables/${encodeURIComponent(req.tableName)}`, {
        method: 'POST',
        body: JSON.stringify({ data: req.data }),
      });
    }
  }

  async updateRow(req: {
    tableName: string;
    rowId: string;
    data: Record<string, any>;
  }) {
    try {
      return await this.request(
        `${NODE_API_BASE}/db/tables/${encodeURIComponent(req.tableName)}/rows/${encodeURIComponent(req.rowId)}`,
        { method: 'PUT', body: JSON.stringify({ data: req.data }) }
      );
    } catch {
      return this.request(
        `${GO_API_BASE}/tables/${encodeURIComponent(req.tableName)}/${encodeURIComponent(req.rowId)}`,
        { method: 'PUT', body: JSON.stringify({ data: req.data }) }
      );
    }
  }

  async deleteRow(req: { tableName: string; rowId: string }) {
    try {
      return await this.request(
        `${NODE_API_BASE}/db/tables/${encodeURIComponent(req.tableName)}/rows/${encodeURIComponent(req.rowId)}`,
        { method: 'DELETE' }
      );
    } catch {
      return this.request(
        `${GO_API_BASE}/tables/${encodeURIComponent(req.tableName)}/${encodeURIComponent(req.rowId)}`,
        { method: 'DELETE' }
      );
    }
  }

  async deleteRows(tableName: string, ids: Array<string | number>) {
    return this.request(
      `${NODE_API_BASE}/db/tables/${encodeURIComponent(tableName)}/rows/delete`,
      { method: 'POST', body: JSON.stringify({ ids }) }
    );
  }

  async addColumn(_req: any): Promise<ApiResponse<any>> {
    return {
      success: false,
      error: 'Sütun ekleme: SQL Editor ile ALTER TABLE kullanın',
    };
  }

  async dropColumn(_table: string, _col: string): Promise<ApiResponse<any>> {
    return {
      success: false,
      error: 'Sütun silme: SQL Editor ile ALTER TABLE kullanın',
    };
  }

  async exportTableData(
    tableName: string,
    _format?: string,
    _filters?: any
  ): Promise<ApiResponse<{ content: string; filename: string }>> {
    const res = await this.getTableData(tableName, 1, 1000);
    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'export failed' };
    }
    const content = JSON.stringify(res.data.rows, null, 2);
    return {
      success: true,
      data: { content, filename: `${tableName}.json` },
    };
  }

  async importTableData(
    _table: string,
    _file: File
  ): Promise<ApiResponse<{ importedRows: number }>> {
    return {
      success: false,
      error: 'İçe aktarma henüz bağlanmadı — SQL Editor veya COPY kullanın',
    };
  }

  async searchTable(tableName: string, query: string) {
    const qs = new URLSearchParams({ search: query, page: '1', pageSize: '50' });
    return this.request<ApiResponse<TableData>>(
      `${NODE_API_BASE}/db/tables/${encodeURIComponent(tableName)}?${qs}`
    );
  }

  async executeSQL(query: string) {
    const instanceId = getActiveInstanceId();
    return this.request<ApiResponse<any>>(`${NODE_API_BASE}/sql/execute`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        ...(instanceId ? { instanceId } : {}),
      }),
    });
  }

  async getSchema(instanceId?: string | null) {
    const id = instanceId || getActiveInstanceId();
    if (id) setActiveInstanceId(id);
    return this.request<
      ApiResponse<{
        tables: TableInfo[];
        views?: TableInfo[];
        schemas?: Array<{
          name: string;
          tables: TableInfo[];
          views: TableInfo[];
        }>;
      }>
    >(`${NODE_API_BASE}/db/schema`);
  }

  /** DDL-only: create missing tables/columns from RetailEX PostgREST OpenAPI */
  async syncSchemaFromRetailEx(
    instanceId?: string | null,
    tenantCode?: string
  ) {
    const id = instanceId || getActiveInstanceId();
    if (id) setActiveInstanceId(id);
    return this.request<
      ApiResponse<{
        tenantCode: string;
        tablesInSource: number;
        created: number;
        altered: number;
        skippedColumns: number;
        errors: Array<{ table: string; message: string }>;
      }>
    >(`${NODE_API_BASE}/db/schema/sync-retailex`, {
      method: 'POST',
      body: JSON.stringify({
        ...(id ? { instanceId: id } : {}),
        ...(tenantCode ? { tenantCode } : {}),
      }),
    });
  }

  async getFiles() {
    return this.request<{ files: any[]; message?: string }>(`${GO_API_BASE}/files`);
  }

  async storageStatus() {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/storage/status`
    );
  }

  async listStorageObjects(instanceId: string, prefix = '') {
    const qs = prefix
      ? `?prefix=${encodeURIComponent(prefix.replace(/^\/+/, ''))}`
      : '';
    return this.request<{
      success: boolean;
      data: { files: any[]; bucket: string; backend: string; prefix: string };
    }>(
      `${NODE_API_BASE}/storage/${encodeURIComponent(instanceId)}/objects${qs}`
    );
  }

  async uploadFile(file: File, instanceId?: string, prefix = '') {
    if (!instanceId) {
      return { success: false, error: 'instanceId gerekli' };
    }
    const form = new FormData();
    form.append('file', file);
    if (prefix) form.append('prefix', prefix.replace(/^\/+/, ''));
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${NODE_API_BASE}/storage/${encodeURIComponent(instanceId)}/upload`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(normalizeError(payload, response.status));
    }
    return payload;
  }

  async downloadFile(fileId: string, instanceId?: string) {
    if (!instanceId) {
      return { success: false, error: 'instanceId gerekli' };
    }
    const token = localStorage.getItem('token');
    const url = `${NODE_API_BASE}/storage/${encodeURIComponent(instanceId)}/download?key=${encodeURIComponent(fileId)}`;
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(normalizeError(payload, response.status));
    }
    const blob = await response.blob();
    return { success: true, blob, filename: fileId.split('/').pop() || 'download' };
  }

  async deleteFile(fileId: string, instanceId?: string) {
    if (!instanceId) {
      return { success: false, error: 'instanceId gerekli' };
    }
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/storage/${encodeURIComponent(instanceId)}/objects?key=${encodeURIComponent(fileId)}`,
      { method: 'DELETE' }
    );
  }

  async createStorageFolder(instanceId: string, name: string, prefix = '') {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/storage/${encodeURIComponent(instanceId)}/folders`,
      {
        method: 'POST',
        body: JSON.stringify({ name, prefix: prefix.replace(/^\/+/, '') }),
      }
    );
  }

  async getMigrations() {
    return this.request<{ migrations: any[]; message?: string }>(
      `${GO_API_BASE}/migrations`
    );
  }

  async createMigration(_data: any) {
    return { success: false, error: 'Use applyMigration(instanceId, { name, sql })' };
  }

  async rollbackMigration(_id: string) {
    return { success: false, error: 'Rollback henüz desteklenmiyor' };
  }
  async getCurrentUser() {
    return this.request<{ success?: boolean; user: any }>(
      `${NODE_API_BASE}/auth/me`
    );
  }

  async login(credentials: { email: string; password: string }) {
    return this.request<{
      success: boolean;
      token: string;
      user: any;
      error?: any;
    }>(`${NODE_API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(data: {
    email: string;
    password: string;
    name?: string;
    firstName?: string;
    lastName?: string;
  }) {
    return this.request<{
      success: boolean;
      token: string;
      user: any;
      error?: any;
    }>(`${NODE_API_BASE}/auth/register`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout() {
    return this.request(`${NODE_API_BASE}/auth/logout`, { method: 'POST' });
  }

  async getDashboardStats() {
    return this.request<any>(`${NODE_API_BASE}/dashboard/stats`);
  }

  async getDashboardWidgets() {
    return this.request<{ widgets: any[] }>(`${NODE_API_BASE}/dashboard/widgets`);
  }

  async getConnections() {
    return this.request<{ connections: any[] }>(`${NODE_API_BASE}/connections`);
  }

  async createConnection(data: any) {
    return this.request(`${NODE_API_BASE}/connections`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteConnection(connectionId: string) {
    return this.request(`${NODE_API_BASE}/connections/${connectionId}`, {
      method: 'DELETE',
    });
  }

  async generateSQL(prompt: string) {
    return this.request<{ sql: string; explanation: string }>(
      `${NODE_API_BASE}/ai/sql`,
      { method: 'POST', body: JSON.stringify({ prompt }) }
    );
  }

  async explainSQL(sql: string) {
    return this.request<{ explanation: string; suggestions: string[] }>(
      `${NODE_API_BASE}/ai/explain`,
      { method: 'POST', body: JSON.stringify({ sql }) }
    );
  }

  async getAISnippets() {
    return this.request<{ snippets: any[] }>(`${NODE_API_BASE}/ai/snippets`);
  }

  async getIntegrations() {
    return this.request<{ integrations: any[]; message?: string }>(
      `${NODE_API_BASE}/integrations`
    );
  }

  async createIntegration(data: any) {
    return this.request(`${NODE_API_BASE}/integrations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getWebSocketConnection() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base =
      import.meta.env.VITE_WS_BASE || `${proto}//${window.location.host}`;
    return new WebSocket(`${base}/api/v1/realtime`);
  }

  /** Socket.IO URL for realtime (proxied via Vite in dev). */
  getSocketIoUrl() {
    return import.meta.env.VITE_SOCKET_URL || window.location.origin;
  }

  async getTenants() {
    return this.request<{ tenants: any[] }>(`${NODE_API_BASE}/tenants`);
  }

  async getProjects(tenantId?: string) {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return this.request<{ projects: any[] }>(`${NODE_API_BASE}/projects${q}`);
  }

  async getInstances(projectId?: string) {
    const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return this.request<{ instances: any[] }>(`${NODE_API_BASE}/instances${q}`);
  }

  async getInstance(id: string) {
    return this.request<{ instance: any }>(
      `${NODE_API_BASE}/instances/${encodeURIComponent(id)}`
    );
  }

  async getMemberships() {
    return this.request<{ success: boolean; memberships: any[] }>(
      `${NODE_API_BASE}/me/memberships`
    );
  }

  /** PostgREST-compatible data API for a provisioned instance */
  restUrl(instanceId: string, table?: string) {
    const base = `${NODE_API_BASE}/rest/${encodeURIComponent(instanceId)}`;
    return table ? `${base}/${encodeURIComponent(table)}` : base;
  }

  async restGet(instanceId: string, table: string, query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query).toString();
    return this.request<any[]>(
      `${this.restUrl(instanceId, table)}${qs ? `?${qs}` : ''}`
    );
  }

  async projectAuthSignup(
    instanceId: string,
    body: { email: string; password: string; data?: Record<string, unknown> }
  ) {
    return this.request<any>(
      `${NODE_API_BASE}/project-auth/${encodeURIComponent(instanceId)}/signup`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async projectAuthLogin(
    instanceId: string,
    body: { email: string; password: string }
  ) {
    return this.request<any>(
      `${NODE_API_BASE}/project-auth/${encodeURIComponent(instanceId)}/login`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async getPackages() {
    return this.request<{
      success: boolean;
      data: any[];
      addons?: any[];
      providers: any[];
      vpsCatalog?: any;
    }>(`${NODE_API_BASE}/packages`);
  }

  async checkout(body: {
    planId?: string;
    provider?: string;
    projectId?: string;
    projectName?: string;
    addons?: string[];
    domains?: { name: string; years?: number }[];
    interval?: 'month' | 'year';
  }) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/billing/checkout`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async billingSuccess(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/billing/success?${qs}`
    );
  }

  async billingHistory() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/billing/history`
    );
  }

  async supervisorOverview() {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/overview`
    );
  }

  async supervisorUsers(params: { q?: string; page?: number; pageSize?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/users${q ? `?${q}` : ''}`
    );
  }

  async supervisorPatchUser(id: string, body: { role?: string; disabled?: boolean }) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/users/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    );
  }

  async supervisorTenants(params: { q?: string; page?: number; pageSize?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/tenants${q ? `?${q}` : ''}`
    );
  }

  async supervisorTenant(id: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/tenants/${encodeURIComponent(id)}`
    );
  }

  async supervisorPayments(params: {
    provider?: string;
    status?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.provider) qs.set('provider', params.provider);
    if (params.status) qs.set('status', params.status);
    if (params.tenantId) qs.set('tenantId', params.tenantId);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/payments${q ? `?${q}` : ''}`
    );
  }

  async supervisorReplayProvision(id: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/payments/${encodeURIComponent(id)}/replay-provision`,
      { method: 'POST', body: '{}' }
    );
  }

  async supervisorServers(params: { q?: string; page?: number; pageSize?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/supervisor/cloud/servers${q ? `?${q}` : ''}`
    );
  }

  async listFunctions(instanceId: string) {
    return this.request<{ success: boolean; data: { functions: any[] } }>(
      `${NODE_API_BASE}/functions/${encodeURIComponent(instanceId)}`
    );
  }

  async getFunction(instanceId: string, name: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/functions/${encodeURIComponent(instanceId)}/${encodeURIComponent(name)}`
    );
  }

  async deployFunction(instanceId: string, name: string, source: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/functions/${encodeURIComponent(instanceId)}/${encodeURIComponent(name)}`,
      { method: 'PUT', body: JSON.stringify({ source }) }
    );
  }

  async deleteFunction(instanceId: string, name: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/functions/${encodeURIComponent(instanceId)}/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );
  }

  async invokeFunction(
    instanceId: string,
    name: string,
    body: { body?: unknown; method?: string; query?: Record<string, string> }
  ) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/functions/${encodeURIComponent(instanceId)}/${encodeURIComponent(name)}/invoke`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async listMigrations(instanceId: string) {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/migrations/${encodeURIComponent(instanceId)}`
    );
  }

  async applyMigration(
    instanceId: string,
    body: { name: string; sql: string; id?: string }
  ) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/migrations/${encodeURIComponent(instanceId)}/apply`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async pauseInstance(id: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/instances/${encodeURIComponent(id)}/pause`,
      { method: 'POST' }
    );
  }

  async resumeInstance(id: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/instances/${encodeURIComponent(id)}/resume`,
      { method: 'POST' }
    );
  }

  async resizeInstance(id: string, planId: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/instances/${encodeURIComponent(id)}/resize`,
      { method: 'POST', body: JSON.stringify({ planId }) }
    );
  }

  async deleteInstance(id: string, hard = false) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/instances/${encodeURIComponent(id)}${hard ? '?hard=1' : ''}`,
      { method: 'DELETE' }
    );
  }

  async storageSign(instanceId: string, key: string, expiresIn = 900) {
    return this.request<{ success: boolean; data: { url: string } }>(
      `${NODE_API_BASE}/storage/${encodeURIComponent(instanceId)}/sign`,
      { method: 'POST', body: JSON.stringify({ key, expiresIn }) }
    );
  }

  async storageQuota(instanceId: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/storage/${encodeURIComponent(instanceId)}/quota`
    );
  }

  // --- Cloud Infrastructure ---
  async cloudSlugs() {
    return this.request<{ success: boolean; data: string[] }>(
      `${NODE_API_BASE}/cloud/slugs`
    );
  }

  async cloudListProviders() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/providers`
    );
  }

  async cloudCreateProvider(body: {
    name: string;
    slug: string;
    apiKey?: string;
    projectId?: string;
    config?: object;
  }) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/providers`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudListServers(projectId?: string) {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/servers${qs}`
    );
  }

  async cloudGetServer(id: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/servers/${encodeURIComponent(id)}`
    );
  }

  async cloudCreateServer(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any; operationId?: string }>(
      `${NODE_API_BASE}/cloud/servers`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudDeleteServer(id: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/servers/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudRebootServer(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/servers/${encodeURIComponent(id)}/reboot`,
      { method: 'POST', body: '{}' }
    );
  }

  async cloudPowerOnServer(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/servers/${encodeURIComponent(id)}/power-on`,
      { method: 'POST', body: '{}' }
    );
  }

  async cloudPowerOffServer(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/servers/${encodeURIComponent(id)}/power-off`,
      { method: 'POST', body: '{}' }
    );
  }

  async cloudServerAction(id: string, action: string, body: Record<string, unknown> = {}) {
    return this.request<{ success: boolean; operationId?: string; data?: any; operation?: any }>(
      `${NODE_API_BASE}/cloud/servers/${encodeURIComponent(id)}/actions/${encodeURIComponent(action)}`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudDeleteVolume(id: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/volumes/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudResizeVolume(id: string, sizeGb: number) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/volumes/${encodeURIComponent(id)}/resize`,
      { method: 'POST', body: JSON.stringify({ sizeGb }) }
    );
  }

  async cloudDeleteFirewall(id: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/firewalls/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudSetFirewallRules(id: string, rules: any[]) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/firewalls/${encodeURIComponent(id)}/rules`,
      { method: 'PUT', body: JSON.stringify({ rules }) }
    );
  }

  async cloudApplyFirewall(id: string, serverIds: string[]) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/firewalls/${encodeURIComponent(id)}/apply`,
      { method: 'POST', body: JSON.stringify({ serverIds }) }
    );
  }

  async cloudDeleteSnapshot(id: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/snapshots/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudDeleteSshKey(id: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/ssh-keys/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudDeleteNetwork(id: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/networks/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudNetworkAction(id: string, action: string, body: Record<string, unknown> = {}) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/networks/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudListPrimaryIps() {
    return this.request<{ success: boolean; data: any[] }>(`${NODE_API_BASE}/cloud/primary-ips`);
  }
  async cloudCreatePrimaryIp(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(`${NODE_API_BASE}/cloud/primary-ips`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  async cloudDeletePrimaryIp(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/primary-ips/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }
  async cloudAssignPrimaryIp(id: string, serverId: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/primary-ips/${encodeURIComponent(id)}/assign`,
      { method: 'POST', body: JSON.stringify({ serverId }) }
    );
  }

  async cloudListFloatingIps() {
    return this.request<{ success: boolean; data: any[] }>(`${NODE_API_BASE}/cloud/floating-ips`);
  }
  async cloudCreateFloatingIp(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(`${NODE_API_BASE}/cloud/floating-ips`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  async cloudDeleteFloatingIp(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/floating-ips/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }
  async cloudAssignFloatingIp(id: string, serverId: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/floating-ips/${encodeURIComponent(id)}/assign`,
      { method: 'POST', body: JSON.stringify({ serverId }) }
    );
  }

  async cloudSetReverseDns(body: { providerId: string; ip: string; ptr: string }) {
    return this.request<{ success: boolean }>(`${NODE_API_BASE}/cloud/dns/reverse`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async cloudListLoadBalancers() {
    return this.request<{ success: boolean; data: any[] }>(`${NODE_API_BASE}/cloud/load-balancers`);
  }
  async cloudCreateLoadBalancer(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(`${NODE_API_BASE}/cloud/load-balancers`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  async cloudDeleteLoadBalancer(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/load-balancers/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudListPlacementGroups() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/placement-groups`
    );
  }
  async cloudCreatePlacementGroup(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/placement-groups`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }
  async cloudDeletePlacementGroup(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/placement-groups/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudListCertificates() {
    return this.request<{ success: boolean; data: any[] }>(`${NODE_API_BASE}/cloud/certificates`);
  }
  async cloudCreateCertificate(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(`${NODE_API_BASE}/cloud/certificates`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  async cloudDeleteCertificate(id: string) {
    return this.request<{ success: boolean }>(
      `${NODE_API_BASE}/cloud/certificates/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async cloudParity() {
    return this.request<{ success: boolean; data: any[] }>(`${NODE_API_BASE}/cloud/parity`);
  }

  async cloudListVolumes() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/volumes`
    );
  }

  async cloudCreateVolume(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/volumes`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudAttachVolume(id: string, serverId: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/volumes/${encodeURIComponent(id)}/attach`,
      { method: 'POST', body: JSON.stringify({ serverId }) }
    );
  }

  async cloudDetachVolume(id: string) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/volumes/${encodeURIComponent(id)}/detach`,
      { method: 'POST', body: '{}' }
    );
  }

  async cloudListSnapshots() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/snapshots`
    );
  }

  async cloudCreateSnapshot(body: { serverId: string; name?: string }) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/snapshots`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudRestoreSnapshot(
    id: string,
    body: {
      name: string;
      serverType: string;
      location: string;
      sshKeys?: string[];
      userData?: string;
    }
  ) {
    return this.request<{ success: boolean; operationId?: string }>(
      `${NODE_API_BASE}/cloud/snapshots/${encodeURIComponent(id)}/restore`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudListFirewalls() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/firewalls`
    );
  }

  async cloudCreateFirewall(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/firewalls`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudListSshKeys() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/ssh-keys`
    );
  }

  async cloudCreateSshKey(body: {
    providerId: string;
    name: string;
    publicKey: string;
  }) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/ssh-keys`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudListNetworks() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/networks`
    );
  }

  async cloudCreateNetwork(body: Record<string, unknown>) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/networks`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudListOperations() {
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/operations`
    );
  }

  async cloudGetOperation(id: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/operations/${encodeURIComponent(id)}`
    );
  }

  async cloudCatalog(
    kind: 'images' | 'regions' | 'server-types' | 'ssh-keys',
    providerId: string
  ) {
    const qs = `?providerId=${encodeURIComponent(providerId)}`;
    return this.request<{ success: boolean; data: any[] }>(
      `${NODE_API_BASE}/cloud/${kind}${qs}`
    );
  }

  async cloudPublicCatalog() {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/public-catalog`
    );
  }

  async cloudQuote(serverType: string) {
    const qs = `?serverType=${encodeURIComponent(serverType)}`;
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/quote${qs}`
    );
  }

  // --- WireGuard VPN add-on ---
  async cloudVpnStatus() {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/vpn/status`
    );
  }

  async cloudVpnEnable(body: { name?: string } = {}) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/vpn/enable`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudVpnCreatePeer(body: {
    name: string;
    serverId?: string;
    allowedIps?: string;
  }) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/vpn/peers`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  async cloudVpnPeerConfig(peerId: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/vpn/peers/${encodeURIComponent(peerId)}/config`
    );
  }

  async cloudVpnRevokePeer(peerId: string) {
    return this.request<{ success: boolean; data: any }>(
      `${NODE_API_BASE}/cloud/vpn/peers/${encodeURIComponent(peerId)}`,
      { method: 'DELETE' }
    );
  }
}

export const apiService = new ApiService();
export const api = apiService;
export default apiService;
