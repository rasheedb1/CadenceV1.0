-- =====================================================
-- Migration 066: Persona Groups
-- Standalone buyer persona groups, independent of ICP profiles.
-- Supports personal (owner-only) and organization (all members) scope.
-- =====================================================

-- 1. Create persona_groups table
CREATE TABLE public.persona_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'organization')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_persona_groups_org_id ON public.persona_groups(org_id);
CREATE INDEX idx_persona_groups_owner_id ON public.persona_groups(owner_id);

-- Updated_at trigger
CREATE TRIGGER persona_groups_updated_at
  BEFORE UPDATE ON public.persona_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.persona_groups ENABLE ROW LEVEL SECURITY;

-- All org members can view persona groups (both personal and org scope)
-- Personal groups are visible only to the owner; org groups to all members
CREATE POLICY "View persona groups"
  ON public.persona_groups FOR SELECT
  USING (
    user_is_org_member(org_id) AND (
      scope = 'organization'
      OR auth.uid() = owner_id
    )
  );

CREATE POLICY "Insert persona groups"
  ON public.persona_groups FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND user_is_org_member(org_id));

CREATE POLICY "Update own persona groups"
  ON public.persona_groups FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Delete own persona groups"
  ON public.persona_groups FOR DELETE
  USING (auth.uid() = owner_id);

-- 2. Add persona_group_id to buyer_personas (nullable, backward compatible)
ALTER TABLE public.buyer_personas
  ADD COLUMN IF NOT EXISTS persona_group_id UUID REFERENCES public.persona_groups(id) ON DELETE CASCADE;

CREATE INDEX idx_buyer_personas_group_id ON public.buyer_personas(persona_group_id);
