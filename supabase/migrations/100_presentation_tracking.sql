-- BC viewer tracking + per-slide dwell-time analytics
-- Two tables:
--   presentation_views      → one row per visit (with viewer email, IP, geolocation)
--   presentation_slide_views → many rows per visit, one per slide-dwell event
-- Tracked from public /bc/<slug> endpoint via track-presentation-view edge function (service-role).

-- ── presentation_views ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.presentation_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),                    -- doubles as "session_id" for slide tracking
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,                                               -- denormalized for fast lookup + audit if presentation deleted
  viewer_email text NOT NULL,
  viewer_ip text,
  viewer_user_agent text,
  viewer_country text,
  viewer_region text,
  viewer_city text,
  notification_status text NOT NULL DEFAULT 'pending'               -- pending | sent | skipped_no_gmail | failed
    CHECK (notification_status IN ('pending', 'sent', 'skipped_no_gmail', 'failed')),
  notification_error text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presentation_views_by_presentation
  ON public.presentation_views(presentation_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_presentation_views_by_org
  ON public.presentation_views(org_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_presentation_views_by_email
  ON public.presentation_views(presentation_id, viewer_email);

-- ── presentation_slide_views ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.presentation_slide_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id uuid NOT NULL REFERENCES public.presentation_views(id) ON DELETE CASCADE,
  slide_index integer NOT NULL,
  dwell_ms integer NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (view_id, slide_index)                                     -- one row per (session × slide); upsert sums dwell_ms
);

CREATE INDEX IF NOT EXISTS idx_presentation_slide_views_by_view
  ON public.presentation_slide_views(view_id, slide_index);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Org members can SELECT views/slides for their org's presentations.
-- INSERT/UPDATE happens via service-role (edge function) — no anon policy.

ALTER TABLE public.presentation_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presentation_slide_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members select presentation_views" ON public.presentation_views;
CREATE POLICY "org members select presentation_views"
  ON public.presentation_views FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members select presentation_slide_views" ON public.presentation_slide_views;
CREATE POLICY "org members select presentation_slide_views"
  ON public.presentation_slide_views FOR SELECT
  USING (
    view_id IN (
      SELECT id FROM public.presentation_views
      WHERE org_id IN (
        SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );

COMMENT ON TABLE public.presentation_views IS 'One row per visit to /bc/<slug>. Logged after viewer enters email in the gate modal. id doubles as session_id for slide-tracking events.';
COMMENT ON TABLE public.presentation_slide_views IS 'Per-slide dwell time. Upserted (view_id, slide_index) — dwell_ms accumulates if same slide is visited multiple times in the same session.';
COMMENT ON COLUMN public.presentation_views.notification_status IS 'pending=initial; sent=Gmail OK; skipped_no_gmail=AE has no Gmail integration; failed=Gmail API error (see notification_error).';
