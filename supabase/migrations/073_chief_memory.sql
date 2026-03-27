-- =====================================================
-- 073: Chief long-term memory
-- Persistent facts, decisions, and context that Chief
-- always loads at the start of each WhatsApp session
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chief_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  importance text NOT NULL DEFAULT 'normal'
    CHECK (importance IN ('critical', 'high', 'normal', 'low')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chief_memory_org
  ON public.chief_memory (org_id, importance, created_at DESC);

ALTER TABLE public.chief_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chief_memory"
  ON public.chief_memory FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view chief_memory"
  ON public.chief_memory FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = chief_memory.org_id
      AND organization_members.user_id = auth.uid()
  ));
