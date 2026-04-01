-- ============================================
-- Migration 082: Agent SDK Migration Support
-- Enhances agent_messages for richer inter-agent conversation
-- Adds project_context view for shared agent awareness
-- ============================================

-- 1. Enhance agent_messages for richer inter-agent conversation
ALTER TABLE agent_messages
    ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'info',
    ADD COLUMN IF NOT EXISTS thread_id uuid,
    ADD COLUMN IF NOT EXISTS read_by uuid[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS context_artifact_id uuid,
    ADD COLUMN IF NOT EXISTS project_id uuid;

COMMENT ON COLUMN agent_messages.message_type IS 'question, answer, proposal, decision, blocker, info, review_feedback';
COMMENT ON COLUMN agent_messages.thread_id IS 'Groups related messages into conversation threads';
COMMENT ON COLUMN agent_messages.read_by IS 'Array of agent UUIDs that have read this message';

CREATE INDEX IF NOT EXISTS idx_agent_messages_unread
    ON agent_messages(to_agent_id, created_at DESC)
    WHERE to_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_broadcast
    ON agent_messages(org_id, created_at DESC)
    WHERE to_agent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_thread
    ON agent_messages(thread_id, created_at ASC)
    WHERE thread_id IS NOT NULL;

-- 2. RPC to mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_read(p_agent_id uuid, p_message_ids uuid[])
RETURNS void AS $$
BEGIN
    UPDATE agent_messages
    SET read_by = array_append(read_by, p_agent_id)
    WHERE id = ANY(p_message_ids)
    AND NOT (p_agent_id = ANY(read_by));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Project context view for shared agent awareness
CREATE OR REPLACE VIEW project_context AS
SELECT
    p.id as project_id,
    p.org_id,
    p.name as project_name,
    p.status as project_status,
    -- Team status: who is doing what right now
    (
        SELECT jsonb_agg(jsonb_build_object(
            'id', a.id,
            'name', a.name,
            'role', a.role,
            'availability', a.availability,
            'current_task', (
                SELECT jsonb_build_object(
                    'id', t.id, 'title', t.title,
                    'status', t.status, 'task_type', t.task_type
                )
                FROM agent_tasks_v2 t
                WHERE t.assigned_agent_id = a.id
                AND t.status IN ('claimed', 'in_progress', 'review')
                ORDER BY t.assigned_at DESC
                LIMIT 1
            )
        ) ORDER BY a.tier DESC, a.name)
        FROM agents a
        WHERE a.org_id = p.org_id AND a.status = 'active'
    ) as team_status,
    -- Recent artifacts (last 10 for this project)
    (
        SELECT jsonb_agg(sub.artifact ORDER BY sub.created_at DESC)
        FROM (
            SELECT jsonb_build_object(
                'id', ar.id,
                'type', ar.artifact_type,
                'filename', ar.filename,
                'summary', ar.content_summary,
                'agent', ag.name,
                'version', ar.version,
                'created_at', ar.created_at
            ) as artifact, ar.created_at
            FROM agent_artifacts ar
            JOIN agents ag ON ar.created_by = ag.id
            WHERE ar.project_id = p.id
            ORDER BY ar.created_at DESC
            LIMIT 10
        ) sub
    ) as recent_artifacts,
    -- Active blockers
    (
        SELECT jsonb_agg(jsonb_build_object(
            'task_id', t.id,
            'task_title', t.title,
            'agent', a.name,
            'status', t.status,
            'error', t.error
        ))
        FROM agent_tasks_v2 t
        LEFT JOIN agents a ON t.assigned_agent_id = a.id
        WHERE t.project_id = p.id AND t.status IN ('failed')
    ) as blockers,
    -- Recent decisions (from agent_messages with type='decision')
    (
        SELECT jsonb_agg(sub.decision ORDER BY sub.created_at DESC)
        FROM (
            SELECT jsonb_build_object(
                'from', ag.name,
                'decision', am.content,
                'at', am.created_at
            ) as decision, am.created_at
            FROM agent_messages am
            JOIN agents ag ON am.from_agent_id = ag.id
            WHERE am.project_id = p.id
            AND am.message_type = 'decision'
            AND am.created_at > now() - interval '7 days'
            ORDER BY am.created_at DESC
            LIMIT 10
        ) sub
    ) as recent_decisions,
    -- Task summary counts
    (
        SELECT jsonb_build_object(
            'backlog', count(*) FILTER (WHERE status = 'backlog'),
            'ready', count(*) FILTER (WHERE status = 'ready'),
            'in_progress', count(*) FILTER (WHERE status IN ('claimed', 'in_progress')),
            'review', count(*) FILTER (WHERE status = 'review'),
            'done', count(*) FILTER (WHERE status = 'done'),
            'failed', count(*) FILTER (WHERE status = 'failed')
        )
        FROM agent_tasks_v2 WHERE project_id = p.id
    ) as task_counts
FROM agent_projects p
WHERE p.status IN ('active', 'in_progress');
