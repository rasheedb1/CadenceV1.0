-- Persistent conversation history for Chief WhatsApp bot
-- Survives redeploys so users don't lose conversation context

CREATE TABLE IF NOT EXISTS public.chief_conversation_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_number text NOT NULL,
  org_id uuid,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content jsonb NOT NULL, -- full message content (text or tool_use blocks)
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup by whatsapp number (most recent first)
CREATE INDEX idx_chief_conv_history_wa ON public.chief_conversation_history (whatsapp_number, created_at DESC);

-- Auto-cleanup: keep only last 100 messages per number
-- (runs as a trigger after each insert)
CREATE OR REPLACE FUNCTION trim_chief_conversation_history()
RETURNS trigger AS $$
BEGIN
  DELETE FROM public.chief_conversation_history
  WHERE id IN (
    SELECT id FROM public.chief_conversation_history
    WHERE whatsapp_number = NEW.whatsapp_number
    ORDER BY created_at DESC
    OFFSET 100
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trim_chief_conv_history
  AFTER INSERT ON public.chief_conversation_history
  FOR EACH ROW EXECUTE FUNCTION trim_chief_conversation_history();

-- RLS: service role only (bot backend)
ALTER TABLE public.chief_conversation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.chief_conversation_history
  FOR ALL USING (true) WITH CHECK (true);
