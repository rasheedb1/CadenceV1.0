-- ============================================
-- Migration 085: Cost analytics views
-- Aggregations for the dashboard and daily report
-- ============================================

-- View 1: Cost by task_type (which task types are most expensive?)
CREATE OR REPLACE VIEW cost_by_task_type AS
SELECT
    org_id,
    task_type,
    count(*) AS task_count,
    count(*) FILTER (WHERE status = 'done') AS done_count,
    count(*) FILTER (WHERE status = 'failed') AS failed_count,
    round(avg(cost_usd) FILTER (WHERE cost_usd > 0)::numeric, 4) AS avg_cost_per_task,
    round(sum(cost_usd) FILTER (WHERE cost_usd > 0)::numeric, 2) AS total_cost,
    sum(tokens_used) FILTER (WHERE tokens_used > 0) AS total_tokens,
    round(avg(tokens_used) FILTER (WHERE tokens_used > 0)::numeric, 0) AS avg_tokens_per_task
FROM agent_tasks_v2
WHERE created_at > now() - interval '30 days'
GROUP BY org_id, task_type
ORDER BY total_cost DESC NULLS LAST;

-- View 2: Cost by agent (richer than agent_budgets)
CREATE OR REPLACE VIEW cost_by_agent_today AS
SELECT
    a.org_id,
    a.id AS agent_id,
    a.name AS agent_name,
    a.model,
    a.role,
    COALESCE(b.cost_usd_today, 0) AS cost_today,
    COALESCE(b.tokens_used_today, 0) AS tokens_today,
    COALESCE(b.cost_usd, 0) AS cost_total,
    COALESCE(b.tokens_used, 0) AS tokens_total,
    COALESCE(b.max_cost_usd_today, 5) AS daily_cap,
    CASE
        WHEN COALESCE(b.max_cost_usd_today, 5) > 0
        THEN round((COALESCE(b.cost_usd_today, 0) / COALESCE(b.max_cost_usd_today, 5)) * 100)
        ELSE 0
    END AS cap_pct_used,
    -- Tasks today
    (SELECT count(*) FROM agent_tasks_v2 t
     WHERE t.assigned_agent_id = a.id
     AND t.completed_at > date_trunc('day', now())) AS tasks_done_today
FROM agents a
LEFT JOIN agent_budgets b ON b.agent_id = a.id
WHERE a.status = 'active'
ORDER BY cost_today DESC;

-- View 3: Daily cost trend (last 7 days, for charts)
CREATE OR REPLACE VIEW cost_daily_trend AS
SELECT
    date_trunc('day', completed_at) AS day,
    org_id,
    count(*) AS tasks_completed,
    round(sum(cost_usd)::numeric, 2) AS total_cost,
    round(avg(cost_usd) FILTER (WHERE cost_usd > 0)::numeric, 4) AS avg_cost,
    sum(tokens_used) AS total_tokens
FROM agent_tasks_v2
WHERE completed_at > now() - interval '7 days'
  AND status = 'done'
GROUP BY date_trunc('day', completed_at), org_id
ORDER BY day DESC;

-- View 4: Top expensive tasks (last 24h) — for daily report
CREATE OR REPLACE VIEW expensive_tasks_24h AS
SELECT
    t.id,
    t.org_id,
    t.title,
    t.task_type,
    t.cost_usd,
    t.tokens_used,
    t.completed_at,
    a.name AS agent_name
FROM agent_tasks_v2 t
LEFT JOIN agents a ON a.id = t.assigned_agent_id
WHERE t.completed_at > now() - interval '24 hours'
  AND t.cost_usd > 0
ORDER BY t.cost_usd DESC
LIMIT 10;

-- Grant select to authenticated users (RLS still applies via underlying tables)
GRANT SELECT ON cost_by_task_type TO authenticated, anon;
GRANT SELECT ON cost_by_agent_today TO authenticated, anon;
GRANT SELECT ON cost_daily_trend TO authenticated, anon;
GRANT SELECT ON expensive_tasks_24h TO authenticated, anon;
