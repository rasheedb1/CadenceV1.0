-- ============================================================================
-- Migration 050: Strict owner-only DELETE policies across all user data tables
-- ============================================================================
-- Problem: Migration 040 created DELETE policies that allowed ANY manager to
-- delete records owned by OTHER users in the same org. This caused cross-user
-- data loss (e.g. Magdalena's cadences were deleted by another user).
--
-- Rule: A user's data belongs exclusively to them.
-- No other user — regardless of role — should be able to delete it.
-- Org admins/managers manage membership and settings, NOT each other's data.
--
-- Fix: Replace "Owner or manager can delete" with "Owner only can delete"
-- across every user data table.
-- ============================================================================

-- cadences
DROP POLICY IF EXISTS "Owner or manager can delete cadences" ON public.cadences;
CREATE POLICY "Owner only can delete cadences" ON public.cadences
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- cadence_steps
DROP POLICY IF EXISTS "Owner or manager can delete cadence_steps" ON public.cadence_steps;
CREATE POLICY "Owner only can delete cadence_steps" ON public.cadence_steps
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- cadence_leads
DROP POLICY IF EXISTS "Owner or manager can delete cadence_leads" ON public.cadence_leads;
CREATE POLICY "Owner only can delete cadence_leads" ON public.cadence_leads
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- lead_step_instances
DROP POLICY IF EXISTS "Owner or manager can delete lead_step_instances" ON public.lead_step_instances;
CREATE POLICY "Owner only can delete lead_step_instances" ON public.lead_step_instances
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- leads
DROP POLICY IF EXISTS "Owner or manager can delete leads" ON public.leads;
CREATE POLICY "Owner only can delete leads" ON public.leads
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- templates
DROP POLICY IF EXISTS "Owner or manager can delete templates" ON public.templates;
CREATE POLICY "Owner only can delete templates" ON public.templates
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- schedules
DROP POLICY IF EXISTS "Owner or manager can delete schedules" ON public.schedules;
CREATE POLICY "Owner only can delete schedules" ON public.schedules
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- ai_prompts
DROP POLICY IF EXISTS "Owner or manager can delete ai_prompts" ON public.ai_prompts;
CREATE POLICY "Owner only can delete ai_prompts" ON public.ai_prompts
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- example_sections
DROP POLICY IF EXISTS "Owner or manager can delete example_sections" ON public.example_sections;
CREATE POLICY "Owner only can delete example_sections" ON public.example_sections
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- example_messages
DROP POLICY IF EXISTS "Owner or manager can delete example_messages" ON public.example_messages;
CREATE POLICY "Owner only can delete example_messages" ON public.example_messages
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- workflows
DROP POLICY IF EXISTS "Owner or manager can delete workflows" ON public.workflows;
CREATE POLICY "Owner only can delete workflows" ON public.workflows
  FOR DELETE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

-- ============================================================================
-- Also lock down UPDATE policies to be strictly owner-only (belt-and-suspenders)
-- Migration 040 already wrote these correctly but let's be explicit.
-- ============================================================================

-- Verify / recreate UPDATE policies (no-op if already correct, safe to run)
DROP POLICY IF EXISTS "Users can update own cadences" ON public.cadences;
CREATE POLICY "Users can update own cadences" ON public.cadences
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own cadence_steps" ON public.cadence_steps;
CREATE POLICY "Users can update own cadence_steps" ON public.cadence_steps
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own cadence_leads" ON public.cadence_leads;
CREATE POLICY "Users can update own cadence_leads" ON public.cadence_leads
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own lead_step_instances" ON public.lead_step_instances;
CREATE POLICY "Users can update own lead_step_instances" ON public.lead_step_instances
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
CREATE POLICY "Users can update own leads" ON public.leads
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own templates" ON public.templates;
CREATE POLICY "Users can update own templates" ON public.templates
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own schedules" ON public.schedules;
CREATE POLICY "Users can update own schedules" ON public.schedules
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own ai_prompts" ON public.ai_prompts;
CREATE POLICY "Users can update own ai_prompts" ON public.ai_prompts
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own example_sections" ON public.example_sections;
CREATE POLICY "Users can update own example_sections" ON public.example_sections
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own example_messages" ON public.example_messages;
CREATE POLICY "Users can update own example_messages" ON public.example_messages
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "Users can update own workflows" ON public.workflows;
CREATE POLICY "Users can update own workflows" ON public.workflows
  FOR UPDATE USING (
    public.user_is_org_member(org_id) AND auth.uid() = owner_id
  );
