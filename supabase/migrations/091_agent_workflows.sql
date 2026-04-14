-- Migration 091: Extend workflow system for agent workflows
-- Adds agent-specific node types, scheduled triggers, and org-level workflows

-- 1. Add org_id to workflows (agent workflows are org-scoped, not user-scoped)
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS org_id UUID;

-- 2. Add workflow_type to distinguish lead workflows from agent workflows
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS workflow_type TEXT NOT NULL DEFAULT 'lead'
  CHECK (workflow_type IN ('lead', 'agent'));

-- 3. Extend trigger_type for scheduled workflows
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_trigger_type_check;
ALTER TABLE workflows ADD CONSTRAINT workflows_trigger_type_check
  CHECK (trigger_type IN ('manual', 'new_lead_added', 'scheduled', 'on_demand', 'webhook'));

-- 4. Add trigger_config for cron/schedule configuration
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}';
COMMENT ON COLUMN workflows.trigger_config IS 'For scheduled: {cron, timezone, active_days}. For webhook: {url, secret}.';

-- 5. Make lead_id nullable in workflow_runs (agent workflows may not have leads)
ALTER TABLE workflow_runs ALTER COLUMN lead_id DROP NOT NULL;

-- 6. Add org_id to workflow_runs
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS org_id UUID;

-- 7. Add waiting_task_id to track which agent task the run is waiting for
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS waiting_task_id UUID;

-- 8. Add workflow_run_id to agent_tasks_v2 (bidirectional link)
ALTER TABLE agent_tasks_v2 ADD COLUMN IF NOT EXISTS workflow_run_id UUID;
ALTER TABLE agent_tasks_v2 ADD COLUMN IF NOT EXISTS workflow_node_id TEXT;

-- 9. Indexes for agent workflow queries
CREATE INDEX IF NOT EXISTS idx_workflows_org_type ON workflows(org_id, workflow_type) WHERE workflow_type = 'agent';
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON workflows(trigger_type, status) WHERE trigger_type = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_workflow_runs_waiting_task ON workflow_runs(waiting_task_id) WHERE waiting_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_workflow_run ON agent_tasks_v2(workflow_run_id) WHERE workflow_run_id IS NOT NULL;

-- 10. RLS policy for service role access (agent workflows are managed by backend)
CREATE POLICY "Service role full access workflows" ON workflows
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access workflow_runs" ON workflow_runs
  FOR ALL USING (true) WITH CHECK (true);

-- 11. Trigger: when agent_tasks_v2 completes → advance the workflow run
CREATE OR REPLACE FUNCTION advance_workflow_on_task_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when status changes to done or failed
  IF NEW.status IN ('done', 'failed') AND OLD.status NOT IN ('done', 'failed') AND NEW.workflow_run_id IS NOT NULL THEN
    UPDATE workflow_runs
    SET status = 'running',
        waiting_for_event = NULL,
        waiting_task_id = NULL,
        context_json = jsonb_set(
          jsonb_set(
            COALESCE(context_json, '{}'::jsonb),
            '{last_task_result}',
            COALESCE(to_jsonb(NEW.result), '{}'::jsonb)
          ),
          '{last_task_status}',
          to_jsonb(NEW.status::text)
        ),
        updated_at = NOW()
    WHERE id = NEW.workflow_run_id
      AND status = 'waiting';

    -- Log the event
    INSERT INTO workflow_event_log (workflow_run_id, workflow_id, node_id, node_type, action, status, details, owner_id, lead_id)
    SELECT wr.id, wr.workflow_id,
           COALESCE(NEW.workflow_node_id, 'unknown'), 'action_agent_skill',
           'task_completed', NEW.status,
           jsonb_build_object('task_id', NEW.id, 'turns', (NEW.result->>'turns')::int, 'cost_usd', NEW.cost_usd),
           wr.owner_id, COALESCE(wr.lead_id, '00000000-0000-0000-0000-000000000000')
    FROM workflow_runs wr WHERE wr.id = NEW.workflow_run_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS trg_advance_workflow ON agent_tasks_v2;
CREATE TRIGGER trg_advance_workflow
AFTER UPDATE OF status ON agent_tasks_v2
FOR EACH ROW EXECUTE FUNCTION advance_workflow_on_task_complete();
