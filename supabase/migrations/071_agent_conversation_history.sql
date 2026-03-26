-- =====================================================
-- 071: Agent conversation history (persistent memory)
-- Each agent has its own conversation memory
-- =====================================================

CREATE TABLE IF NOT EXISTS public.agent_conversation_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  session_key text NOT NULL DEFAULT 'default',
  role text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_conv_history_agent_session
  ON public.agent_conversation_history (agent_id, session_key, created_at ASC);

ALTER TABLE public.agent_conversation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_conversation_history"
  ON public.agent_conversation_history FOR ALL USING (true) WITH CHECK (true);

-- Auto-cleanup: keep last 50 messages per agent+session
CREATE OR REPLACE FUNCTION public.trim_agent_conversation_history()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.agent_conversation_history
  WHERE id IN (
    SELECT id FROM public.agent_conversation_history
    WHERE agent_id = NEW.agent_id AND session_key = NEW.session_key
    ORDER BY created_at DESC
    OFFSET 50
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_trim_agent_conversation
  AFTER INSERT ON public.agent_conversation_history
  FOR EACH ROW EXECUTE FUNCTION public.trim_agent_conversation_history();
