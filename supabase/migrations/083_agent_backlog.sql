-- ============================================
-- Migration 083: Agent Backlog for Chief
-- A queue of items agents need from the human.
-- Deduplicates automatically — same topic won't pile up.
-- Chief can review via WhatsApp with ver_backlog.
-- ============================================

CREATE TABLE IF NOT EXISTS agent_backlog (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL,
    agent_id uuid NOT NULL REFERENCES agents(id),
    category text NOT NULL DEFAULT 'request',  -- request, blocker, decision, approval, feedback
    title text NOT NULL,                        -- short summary (shown in list)
    details text,                               -- full context
    task_id uuid,                               -- related task (if any)
    project_id uuid,                            -- related project (if any)
    status text NOT NULL DEFAULT 'open',        -- open, acknowledged, resolved, dismissed
    resolution text,                            -- what was done about it
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_backlog_open
    ON agent_backlog(org_id, status, created_at DESC)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_agent_backlog_agent
    ON agent_backlog(agent_id, status);

-- Dedup function: don't create duplicate backlog items with similar titles from same agent
CREATE OR REPLACE FUNCTION dedup_agent_backlog()
RETURNS trigger AS $$
BEGIN
    -- If same agent has an open item with >60% word overlap in title, skip
    IF EXISTS (
        SELECT 1 FROM agent_backlog
        WHERE agent_id = NEW.agent_id
        AND status = 'open'
        AND similarity(lower(title), lower(NEW.title)) > 0.6
    ) THEN
        RETURN NULL;  -- skip insert
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable pg_trgm for similarity() function
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TRIGGER trg_dedup_agent_backlog
    BEFORE INSERT ON agent_backlog
    FOR EACH ROW
    EXECUTE FUNCTION dedup_agent_backlog();
