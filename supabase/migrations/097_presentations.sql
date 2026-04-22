-- Presentations feature (planet "Presentaciones")
-- Hosts shareable sales/BC decks served at chief.yuno.tools/bc/<slug>
-- NOTE: 'business_cases' already exists for a different feature (lead business-case generation).
-- This table is deliberately named 'presentations' and starts with kind='yuno_bc' (sales deck)
-- so future kinds (onboarding, case studies, etc.) can share the same table.

CREATE TABLE IF NOT EXISTS public.presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'yuno_bc'              -- extension point for other deck types
    CHECK (kind IN ('yuno_bc')),                    -- tightened check list; loosen when we add types
  client_name text NOT NULL,
  slug text NOT NULL UNIQUE,                        -- e.g., "rappi-a8f3c2"
  defaults jsonb NOT NULL,                          -- deck-specific data (BC_DEFAULTS for kind=yuno_bc)
  raw_research jsonb,                               -- Firecrawl output for audit
  parent_id uuid REFERENCES public.presentations(id) ON DELETE SET NULL,  -- chain regenerations
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_presentations_org_active
  ON public.presentations(org_id, archived, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_presentations_slug_lookup
  ON public.presentations(slug) WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_presentations_expires
  ON public.presentations(expires_at) WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_presentations_parent
  ON public.presentations(parent_id) WHERE parent_id IS NOT NULL;

-- Trigger: auto-set archived_at when row transitions to archived
CREATE OR REPLACE FUNCTION public.presentations_set_archived_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.archived = true AND OLD.archived = false THEN
    NEW.archived_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presentations_archived_at ON public.presentations;
CREATE TRIGGER trg_presentations_archived_at
  BEFORE UPDATE ON public.presentations
  FOR EACH ROW EXECUTE FUNCTION public.presentations_set_archived_at();

-- RLS
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

-- Org members see their org's presentations
DROP POLICY IF EXISTS "org members select presentations" ON public.presentations;
CREATE POLICY "org members select presentations"
  ON public.presentations FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Org members can insert presentations scoped to their org
DROP POLICY IF EXISTS "org members insert presentations" ON public.presentations;
CREATE POLICY "org members insert presentations"
  ON public.presentations FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Org members can update their org's presentations (archive, etc.)
DROP POLICY IF EXISTS "org members update presentations" ON public.presentations;
CREATE POLICY "org members update presentations"
  ON public.presentations FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Service role bypasses RLS (used by edge functions for public-by-slug render + create).

COMMENT ON TABLE public.presentations IS 'Shareable decks served at chief.yuno.tools/bc/<slug>. Auto-archived after expires_at. Regeneration creates a new row with parent_id set.';
COMMENT ON COLUMN public.presentations.kind IS 'Deck type. Currently only yuno_bc (Yuno sales business case). Extension point for future types.';
COMMENT ON COLUMN public.presentations.defaults IS 'Deck-specific input data. For kind=yuno_bc: the BC_DEFAULTS object injected into the template.';
COMMENT ON COLUMN public.presentations.raw_research IS 'Firecrawl audit trail: query results + extracted provider list.';
COMMENT ON COLUMN public.presentations.parent_id IS 'Previous presentation if this was created via regenerate.';
