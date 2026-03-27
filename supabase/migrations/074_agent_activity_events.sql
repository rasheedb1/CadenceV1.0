-- =====================================================
-- 074: Agent activity events (real-time progress reporting)
-- Agents emit events as they work: tool calls, progress, etc.
-- Mission Control subscribes via Supabase Realtime
-- =====================================================

CREATE TABLE IF NOT EXISTS public.agent_activity_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'tool_call', 'tool_result', 'thinking', 'progress', 'agent_chat'
  tool_name text,
  content text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON public.agent_activity_events (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_org ON public.agent_activity_events (org_id, created_at DESC);

ALTER TABLE public.agent_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_activity_events"
  ON public.agent_activity_events FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_activity_events;

-- Auto-cleanup: keep last 200 events per agent
CREATE OR REPLACE FUNCTION public.trim_agent_activity_events()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.agent_activity_events
  WHERE id IN (
    SELECT id FROM public.agent_activity_events
    WHERE agent_id = NEW.agent_id
    ORDER BY created_at DESC OFFSET 200
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_trim_agent_activity
  AFTER INSERT ON public.agent_activity_events
  FOR EACH ROW EXECUTE FUNCTION public.trim_agent_activity_events();
