-- =====================================================
-- 088: Agent Integrations (shared OAuth token store)
-- Single source of truth for integrations used by the agents.
-- Accessible from BOTH WhatsApp/Chief and the dashboard.
-- =====================================================

CREATE TABLE IF NOT EXISTS agent_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  provider TEXT NOT NULL,                  -- 'google' | 'microsoft' | ...
  email TEXT,                              -- which account (for display)
  access_token TEXT NOT NULL,
  refresh_token TEXT,                      -- must be stored for offline access
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  connected_via TEXT,                      -- 'whatsapp' | 'dashboard'
  connected_by_user_id UUID,               -- which user initiated
  metadata JSONB DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','error')),
  error_message TEXT,
  UNIQUE(org_id, provider)                 -- one connection per org per provider
);

CREATE INDEX IF NOT EXISTS idx_agent_integrations_org
  ON agent_integrations (org_id, status);

CREATE INDEX IF NOT EXISTS idx_agent_integrations_expires
  ON agent_integrations (token_expires_at)
  WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_integrations TO authenticated, anon, service_role;
