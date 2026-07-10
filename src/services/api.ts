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

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
    const response = await fetch(url, {
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

  /** Prefer Node /api/db (real Postgres); fall back shape-compatible */
  async getTables(): Promise<ApiResponse<TableInfo[]>> {
    try {
      return await this.request(`${NODE_API_BASE}/db/tables`);
    } catch {
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
    sortOrder?: 'asc' | 'desc'
  ): Promise<ApiResponse<TableData>> {
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
    } catch {
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
    return this.request<ApiResponse<any>>(`${NODE_API_BASE}/sql/execute`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  async getSchema() {
    return this.request<ApiResponse<{ tables: TableInfo[] }>>(
      `${NODE_API_BASE}/db/schema`
    );
  }

  async getFiles() {
    return this.request<{ files: any[]; message?: string }>(`${GO_API_BASE}/files`);
  }

  async uploadFile(_file: File) {
    return { success: false, error: 'Storage henüz bağlanmadı' };
  }

  async downloadFile(_fileId: string) {
    return { success: false, error: 'Storage henüz bağlanmadı' };
  }

  async deleteFile(_fileId: string) {
    return { success: false, error: 'Storage henüz bağlanmadı' };
  }

  async getMigrations() {
    return this.request<{ migrations: any[]; message?: string }>(
      `${GO_API_BASE}/migrations`
    );
  }

  async createMigration(_data: any) {
    return { success: false, error: 'Migrations henüz bağlanmadı' };
  }

  async applyMigration(_id: string) {
    return { success: false, error: 'Migrations henüz bağlanmadı' };
  }

  async rollbackMigration(_id: string) {
    return { success: false, error: 'Migrations henüz bağlanmadı' };
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

  async getPackages() {
    return this.request<{
      success: boolean;
      data: any[];
      providers: any[];
    }>(`${NODE_API_BASE}/packages`);
  }

  async checkout(body: {
    planId: string;
    provider?: string;
    projectId?: string;
    projectName?: string;
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
}

export const apiService = new ApiService();
export const api = apiService;
export default apiService;
