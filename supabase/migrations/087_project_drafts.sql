-- =====================================================
-- 087: Project Drafts
-- Chief proposes a project plan, user approves/rejects.
-- The draft stores everything needed to later promote it
-- to a real agent_projects row via aprobar_proyecto.
-- =====================================================

CREATE TABLE IF NOT EXISTS project_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  created_by TEXT,                          -- whatsapp_number or user identifier
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL DEFAULT 'collaboration',
  proposed_agents JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of {name, role, reason}
  capabilities_needed JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of capability strings
  phases JSONB NOT NULL DEFAULT '[]'::jsonb,             -- same shape as crear_proyecto phases
  success_criteria TEXT,
  estimated_cost_usd NUMERIC(8,2),
  estimated_duration TEXT,
  reasoning TEXT,                           -- why these agents, why this plan
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  rejection_reason TEXT,
  approved_project_id UUID,                 -- set after promotion to agent_projects
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_project_drafts_org_status
  ON project_drafts (org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_drafts_pending
  ON project_drafts (org_id, created_at DESC)
  WHERE status = 'pending';

-- Auto-expire pending drafts older than expires_at (lazy check via view)
CREATE OR REPLACE VIEW active_project_drafts AS
SELECT *
FROM project_drafts
WHERE status = 'pending'
  AND expires_at > now();

GRANT SELECT, INSERT, UPDATE ON project_drafts TO authenticated, anon, service_role;
GRANT SELECT ON active_project_drafts TO authenticated, anon, service_role;
