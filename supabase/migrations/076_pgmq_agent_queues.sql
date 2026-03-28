-- =====================================================
-- 076: pgmq Agent Queues
-- Enables PostgreSQL Message Queue for async inter-agent communication
-- =====================================================

-- Enable pgmq extension
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Helper: convert agent UUID to valid queue name
CREATE OR REPLACE FUNCTION public.agent_queue_name(agent_id uuid)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 'agent_' || replace(agent_id::text, '-', '_');
$$;

-- Helper: create queue for an agent (idempotent)
CREATE OR REPLACE FUNCTION public.create_agent_queue(agent_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  qname text := public.agent_queue_name(agent_id);
BEGIN
  -- pgmq.create is NOT idempotent — check first
  IF NOT EXISTS (
    SELECT 1 FROM pgmq.list_queues() WHERE queue_name = qname
  ) THEN
    PERFORM pgmq.create(qname);
    RAISE NOTICE 'Created queue: %', qname;
  END IF;
END;
$$;

-- Create Chief inbox queue
SELECT pgmq.create('agent_chief');

-- Create queues for all existing active/paused agents
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM agents WHERE status IN ('active', 'paused', 'deploying') LOOP
    PERFORM public.create_agent_queue(r.id);
  END LOOP;
END;
$$;

-- Trigger: auto-create queue when agent becomes active
CREATE OR REPLACE FUNCTION public.auto_create_agent_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('active', 'deploying') AND (OLD IS NULL OR OLD.status NOT IN ('active', 'deploying')) THEN
    PERFORM public.create_agent_queue(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_agent_queue ON agents;
CREATE TRIGGER trg_auto_create_agent_queue
  AFTER INSERT OR UPDATE OF status ON agents
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_agent_queue();

-- =====================================================
-- Public wrapper functions for REST API access
-- (Supabase REST can call public schema functions via /rest/v1/rpc/)
-- =====================================================

-- Send a message to a queue
CREATE OR REPLACE FUNCTION public.pgmq_send(queue_name text, msg jsonb)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT pgmq.send(queue_name, msg);
$$;

-- Read messages (non-blocking)
CREATE OR REPLACE FUNCTION public.pgmq_read(queue_name text, vt integer DEFAULT 30, qty integer DEFAULT 1)
RETURNS SETOF pgmq.message_record
LANGUAGE sql
AS $$
  SELECT * FROM pgmq.read(queue_name, vt, qty);
$$;

-- Read with polling (blocks up to max_poll_seconds)
CREATE OR REPLACE FUNCTION public.pgmq_poll(queue_name text, vt integer DEFAULT 30, qty integer DEFAULT 1, max_poll_seconds integer DEFAULT 5)
RETURNS SETOF pgmq.message_record
LANGUAGE sql
AS $$
  SELECT * FROM pgmq.read_with_poll(queue_name, vt, qty, max_poll_seconds);
$$;

-- Archive a message (moves to archive table, preserves audit trail)
CREATE OR REPLACE FUNCTION public.pgmq_archive(queue_name text, msg_id bigint)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pgmq.archive(queue_name, msg_id);
$$;

-- Delete a message
CREATE OR REPLACE FUNCTION public.pgmq_delete(queue_name text, msg_id bigint)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pgmq.delete(queue_name, msg_id);
$$;

-- Get queue metrics
CREATE OR REPLACE FUNCTION public.pgmq_metrics(queue_name text)
RETURNS TABLE(queue_name text, queue_length bigint, newest_msg_age_sec integer, oldest_msg_age_sec integer, total_messages bigint)
LANGUAGE sql
AS $$
  SELECT * FROM pgmq.metrics(pgmq_metrics.queue_name);
$$;
