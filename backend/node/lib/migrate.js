/**
 * Ensure meta (control-plane) schema exists when DATABASE_URL is set.
 * Safe to run repeatedly (IF NOT EXISTS). Complements docker/postgres/init.sql.
 */

const META_DDL = `
CREATE TABLE IF NOT EXISTS platform_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT REFERENCES platform_users(id),
  tenant_id TEXT REFERENCES tenants(id),
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  env TEXT NOT NULL DEFAULT 'dev',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  region TEXT NOT NULL DEFAULT 'local',
  status TEXT NOT NULL DEFAULT 'pending',
  host TEXT,
  port INT,
  database_name TEXT,
  username TEXT,
  password TEXT,
  connection_string TEXT,
  jwt_secret TEXT,
  rest_url TEXT,
  stripe_session_id TEXT,
  payment_provider TEXT,
  payment_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE instances ADD COLUMN IF NOT EXISTS jwt_secret TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS rest_url TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS anon_key TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS service_role_key TEXT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instances_project ON instances(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_instances_payment_ref ON instances(payment_ref);
CREATE INDEX IF NOT EXISTS idx_instances_stripe_session ON instances(stripe_session_id);

-- Cloud Infrastructure (provider-agnostic; Hetzner is one driver)
CREATE TABLE IF NOT EXISTS cloud_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  api_key_enc TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_servers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  provider_id TEXT NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  server_type TEXT,
  image TEXT,
  location TEXT,
  ipv4 TEXT,
  ipv6 TEXT,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_data TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_volumes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  provider_id TEXT NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
  server_id TEXT REFERENCES cloud_servers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  external_id TEXT,
  size_gb INT NOT NULL DEFAULT 10,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_firewalls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  provider_id TEXT NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  external_id TEXT,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  provider_id TEXT NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
  server_id TEXT REFERENCES cloud_servers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_ssh_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  provider_id TEXT NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fingerprint TEXT,
  public_key TEXT NOT NULL,
  external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_networks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  provider_id TEXT NOT NULL REFERENCES cloud_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  external_id TEXT,
  ip_range TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_operations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  provider_id TEXT REFERENCES cloud_providers(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cloud_providers_tenant ON cloud_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_servers_tenant ON cloud_servers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_servers_provider ON cloud_servers(provider_id);
CREATE INDEX IF NOT EXISTS idx_cloud_volumes_tenant ON cloud_volumes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_firewalls_tenant ON cloud_firewalls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_snapshots_tenant ON cloud_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_ssh_keys_tenant ON cloud_ssh_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_networks_tenant ON cloud_networks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_operations_tenant ON cloud_operations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloud_operations_status ON cloud_operations(status);

-- VPS retail vs provider cost (EUR); does not affect DB Pro/Scale/Max packages
ALTER TABLE cloud_servers ADD COLUMN IF NOT EXISTS cost_provider NUMERIC(12,4);
ALTER TABLE cloud_servers ADD COLUMN IF NOT EXISTS price_retail NUMERIC(12,4);
ALTER TABLE cloud_servers ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
`;

async function ensureMetaSchema(pool) {
  await pool.query(META_DDL);
  console.log('[migrate] meta schema ensured');
}

module.exports = { ensureMetaSchema, META_DDL };
