-- Migration 092: Improve workflow context chaining
-- When a task completes, save result under the step name (from node label) in context_json

-- Add org_id to workflow_event_log (was missing for agent workflows)
ALTER TABLE workflow_event_log ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE workflow_event_log ADD COLUMN IF NOT EXISTS org_id UUID;

-- Update the trigger to save results with step name
CREATE OR REPLACE FUNCTION advance_workflow_on_task_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_graph jsonb;
  v_node_label text;
  v_step_name text;
  v_new_context jsonb;
BEGIN
  IF NEW.status IN ('done', 'failed') AND OLD.status NOT IN ('done', 'failed') AND NEW.workflow_run_id IS NOT NULL THEN
    -- Get the node label from the workflow graph to use as step name
    SELECT w.graph_json INTO v_graph
    FROM workflows w
    JOIN workflow_runs wr ON wr.workflow_id = w.id
    WHERE wr.id = NEW.workflow_run_id;

    -- Find the node label
    IF v_graph IS NOT NULL AND NEW.workflow_node_id IS NOT NULL THEN
      SELECT n->>'data'->>'label' INTO v_node_label
      FROM jsonb_array_elements(v_graph->'nodes') AS n
      WHERE n->>'id' = NEW.workflow_node_id;
    END IF;

    -- Build step name from label or fallback to node_id
    v_step_name := COALESCE(
      lower(regexp_replace(COALESCE(v_node_label, NEW.workflow_node_id, 'step'), '[^a-z0-9]+', '_', 'gi')),
      'step'
    );

    -- Update workflow_run context with result under step name
    UPDATE workflow_runs
    SET status = 'running',
        waiting_for_event = NULL,
        waiting_task_id = NULL,
        context_json = jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(context_json, '{}'::jsonb),
              '{last_task_result}',
              COALESCE(to_jsonb(NEW.result), '{}'::jsonb)
            ),
            '{last_task_status}',
            to_jsonb(NEW.status::text)
          ),
          ARRAY[v_step_name],
          COALESCE(to_jsonb(NEW.result), '{}'::jsonb)
        ),
        updated_at = NOW()
    WHERE id = NEW.workflow_run_id
      AND status = 'waiting';

    -- Log
    INSERT INTO workflow_event_log (workflow_run_id, workflow_id, node_id, node_type, action, status, details, owner_id, org_id)
    SELECT wr.id, wr.workflow_id,
           COALESCE(NEW.workflow_node_id, 'unknown'), 'action_agent_skill',
           'task_completed', NEW.status,
           jsonb_build_object('task_id', NEW.id, 'step_name', v_step_name, 'cost_usd', NEW.cost_usd),
           wr.owner_id, wr.org_id
    FROM workflow_runs wr WHERE wr.id = NEW.workflow_run_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
