-- WhatsApp session mapping: links a WhatsApp number to a Chief user/org
-- Used by the OpenClaw Gateway to remember who is who across conversations

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_number text NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One session per WhatsApp number per org
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_number_org_idx
  ON public.whatsapp_sessions (whatsapp_number, org_id);

-- RLS
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Service role (gateway) can do everything
CREATE POLICY "Service role full access on whatsapp_sessions"
  ON public.whatsapp_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Org members can view their org's sessions
CREATE POLICY "Org members can view whatsapp_sessions"
  ON public.whatsapp_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = whatsapp_sessions.org_id
        AND organization_members.user_id = auth.uid()
    )
  );
