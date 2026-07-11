-- Meta DB (control-plane) + demo tenant DB seed
-- Runs once on first postgres container start.

CREATE DATABASE graphcore_demo;
\connect graphcore_demo

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (email, name) VALUES
  ('ada@example.com', 'Ada Lovelace'),
  ('alan@example.com', 'Alan Turing')
ON CONFLICT DO NOTHING;

INSERT INTO products (name, price, stock) VALUES
  ('Starter Plan', 0, 100),
  ('Pro Plan', 29.00, 50),
  ('Scale Plan', 99.00, 20);

INSERT INTO orders (user_id, total, status) VALUES
  (1, 29.00, 'paid'),
  (2, 99.00, 'pending');

\connect graphcore_meta

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
