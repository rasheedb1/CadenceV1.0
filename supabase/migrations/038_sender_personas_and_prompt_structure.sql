-- 038: Sender Personas + Structured Prompt Fields + Quality Notes
-- Part of the AI Message Generator redesign (5-layer architecture)

-- 1. Create sender_personas table (one per user per org)
CREATE TABLE IF NOT EXISTS public.sender_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  value_proposition TEXT NOT NULL DEFAULT '',
  credibility TEXT DEFAULT '',
  communication_style TEXT NOT NULL DEFAULT 'expert_consultant'
    CHECK (communication_style IN ('founder_to_founder', 'expert_consultant', 'peer_casual', 'executive_brief')),
  signature TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

ALTER TABLE public.sender_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sender_personas_org_member_access"
  ON public.sender_personas
  FOR ALL
  USING (
    org_id IN (SELECT public.user_org_ids())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT public.user_org_ids())
  );

-- Service role full access
CREATE POLICY "sender_personas_service_role"
  ON public.sender_personas
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Add structured fields to ai_prompts for the new architecture
ALTER TABLE public.ai_prompts
  ADD COLUMN IF NOT EXISTS objective TEXT DEFAULT NULL
    CHECK (objective IS NULL OR objective IN ('first_touch', 'follow_up', 're_engage', 'break_up', 'referral')),
  ADD COLUMN IF NOT EXISTS structure TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS writing_principles JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS anti_patterns JSONB DEFAULT '[]'::jsonb;

-- 3. Add quality_note to example_messages (what makes this message good)
ALTER TABLE public.example_messages
  ADD COLUMN IF NOT EXISTS quality_note TEXT DEFAULT NULL;
