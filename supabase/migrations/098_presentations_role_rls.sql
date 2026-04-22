-- Tighten presentations RLS: viewers cannot archive/update decks.
-- Original policy (migration 097) allowed any org member to update; that lets a viewer
-- role accidentally (or deliberately) archive a deck. We narrow the UPDATE policy to
-- admin/manager/member. SELECT stays open to all org members including viewers.
-- INSERT stays the same (create is gated by capability + edge-fn shared secret anyway).

DROP POLICY IF EXISTS "org members update presentations" ON public.presentations;

CREATE POLICY "org editors update presentations"
  ON public.presentations FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager', 'member')
    )
  );

COMMENT ON POLICY "org editors update presentations" ON public.presentations IS
  'Only admin/manager/member roles can archive or edit presentations. Viewers have read-only access via the SELECT policy.';
