-- GraphCore project Auth + RLS starter template (applied on provision).
-- Not full GoTrue/Supabase RLS — starter helpers for tenant end-users.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  encrypted_password TEXT NOT NULL,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  recovery_token TEXT,
  recovery_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_token TEXT;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_token ON auth.refresh_tokens(token);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- Example: enable RLS on a public table after you create it:
--   ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "own rows" ON public.profiles
--     FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
