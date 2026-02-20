-- ============================================================================
-- Migration 040: Per-User Data Isolation Within Organizations
-- ============================================================================
-- Changes RLS policies so each user only sees their own data (cadences, leads,
-- templates, etc.) within their organization. Managers/admins retain org-wide
-- visibility for admin dashboards.
-- ============================================================================

-- ============================================================================
-- PART 1: Drop existing org-only SELECT/UPDATE/DELETE policies
-- ============================================================================

-- cadences
DROP POLICY IF EXISTS "Org members can view cadences" ON public.cadences;
DROP POLICY IF EXISTS "Org members can update cadences" ON public.cadences;
DROP POLICY IF EXISTS "Org managers can delete cadences" ON public.cadences;

-- cadence_steps
DROP POLICY IF EXISTS "Org members can view cadence_steps" ON public.cadence_steps;
DROP POLICY IF EXISTS "Org members can update cadence_steps" ON public.cadence_steps;
DROP POLICY IF EXISTS "Org managers can delete cadence_steps" ON public.cadence_steps;

-- cadence_leads
DROP POLICY IF EXISTS "Org members can view cadence_leads" ON public.cadence_leads;
DROP POLICY IF EXISTS "Org members can update cadence_leads" ON public.cadence_leads;
DROP POLICY IF EXISTS "Org managers can delete cadence_leads" ON public.cadence_leads;

-- lead_step_instances
DROP POLICY IF EXISTS "Org members can view lead_step_instances" ON public.lead_step_instances;
DROP POLICY IF EXISTS "Org members can update lead_step_instances" ON public.lead_step_instances;
DROP POLICY IF EXISTS "Org managers can delete lead_step_instances" ON public.lead_step_instances;

-- leads
DROP POLICY IF EXISTS "Org members can view leads" ON public.leads;
DROP POLICY IF EXISTS "Org members can update leads" ON public.leads;
DROP POLICY IF EXISTS "Org managers can delete leads" ON public.leads;

-- templates
DROP POLICY IF EXISTS "Org members can view templates" ON public.templates;
DROP POLICY IF EXISTS "Org members can update templates" ON public.templates;
DROP POLICY IF EXISTS "Org managers can delete templates" ON public.templates;

-- schedules
DROP POLICY IF EXISTS "Org members can view schedules" ON public.schedules;
DROP POLICY IF EXISTS "Org members can update schedules" ON public.schedules;
DROP POLICY IF EXISTS "Org managers can delete schedules" ON public.schedules;

-- email_messages (uses owner_user_id)
DROP POLICY IF EXISTS "Org members can view email_messages" ON public.email_messages;
DROP POLICY IF EXISTS "Org members can update email_messages" ON public.email_messages;

-- activity_log
DROP POLICY IF EXISTS "Org members can view activity_log" ON public.activity_log;

-- ai_prompts
DROP POLICY IF EXISTS "Org members can view ai_prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Org members can update ai_prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Org managers can delete ai_prompts" ON public.ai_prompts;

-- example_sections
DROP POLICY IF EXISTS "Org members can view example_sections" ON public.example_sections;
DROP POLICY IF EXISTS "Org members can update example_sections" ON public.example_sections;
DROP POLICY IF EXISTS "Org managers can delete example_sections" ON public.example_sections;

-- example_messages
DROP POLICY IF EXISTS "Org members can view example_messages" ON public.example_messages;
DROP POLICY IF EXISTS "Org members can update example_messages" ON public.example_messages;
DROP POLICY IF EXISTS "Org managers can delete example_messages" ON public.example_messages;

-- workflows
DROP POLICY IF EXISTS "Org members can view workflows" ON public.workflows;
DROP POLICY IF EXISTS "Org members can update workflows" ON public.workflows;
DROP POLICY IF EXISTS "Org managers can delete workflows" ON public.workflows;

-- linkedin_conversations
DROP POLICY IF EXISTS "Org members can view linkedin_conversations" ON public.linkedin_conversations;
DROP POLICY IF EXISTS "Org members can update linkedin_conversations" ON public.linkedin_conversations;

-- linkedin_messages
DROP POLICY IF EXISTS "Org members can view linkedin_messages" ON public.linkedin_messages;

-- ============================================================================
-- PART 2: Create user-scoped SELECT policies (owner sees own + managers see all)
-- ============================================================================

-- cadences
CREATE POLICY "Users can view own cadences" ON public.cadences
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org cadences" ON public.cadences
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- cadence_steps
CREATE POLICY "Users can view own cadence_steps" ON public.cadence_steps
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org cadence_steps" ON public.cadence_steps
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- cadence_leads
CREATE POLICY "Users can view own cadence_leads" ON public.cadence_leads
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org cadence_leads" ON public.cadence_leads
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- lead_step_instances
CREATE POLICY "Users can view own lead_step_instances" ON public.lead_step_instances
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org lead_step_instances" ON public.lead_step_instances
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- leads
CREATE POLICY "Users can view own leads" ON public.leads
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org leads" ON public.leads
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- templates
CREATE POLICY "Users can view own templates" ON public.templates
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org templates" ON public.templates
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- schedules
CREATE POLICY "Users can view own schedules" ON public.schedules
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org schedules" ON public.schedules
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- email_messages (uses owner_user_id)
CREATE POLICY "Users can view own email_messages" ON public.email_messages
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_user_id);
CREATE POLICY "Managers can view all org email_messages" ON public.email_messages
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- activity_log (dual-tier: user sees own, managers see all)
CREATE POLICY "Users can view own activity_log" ON public.activity_log
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org activity_log" ON public.activity_log
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- ai_prompts
CREATE POLICY "Users can view own ai_prompts" ON public.ai_prompts
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org ai_prompts" ON public.ai_prompts
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- example_sections
CREATE POLICY "Users can view own example_sections" ON public.example_sections
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org example_sections" ON public.example_sections
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- example_messages
CREATE POLICY "Users can view own example_messages" ON public.example_messages
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org example_messages" ON public.example_messages
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- workflows
CREATE POLICY "Users can view own workflows" ON public.workflows
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org workflows" ON public.workflows
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- linkedin_conversations
CREATE POLICY "Users can view own linkedin_conversations" ON public.linkedin_conversations
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org linkedin_conversations" ON public.linkedin_conversations
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- linkedin_messages
CREATE POLICY "Users can view own linkedin_messages" ON public.linkedin_messages
  FOR SELECT USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);
CREATE POLICY "Managers can view all org linkedin_messages" ON public.linkedin_messages
  FOR SELECT USING (public.user_has_org_role(org_id, 'manager'));

-- ============================================================================
-- PART 3: Create user-scoped UPDATE policies
-- ============================================================================

-- cadences
CREATE POLICY "Users can update own cadences" ON public.cadences
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- cadence_steps
CREATE POLICY "Users can update own cadence_steps" ON public.cadence_steps
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- cadence_leads
CREATE POLICY "Users can update own cadence_leads" ON public.cadence_leads
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- lead_step_instances
CREATE POLICY "Users can update own lead_step_instances" ON public.lead_step_instances
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- leads
CREATE POLICY "Users can update own leads" ON public.leads
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- templates
CREATE POLICY "Users can update own templates" ON public.templates
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- schedules
CREATE POLICY "Users can update own schedules" ON public.schedules
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- email_messages (uses owner_user_id)
CREATE POLICY "Users can update own email_messages" ON public.email_messages
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_user_id);

-- ai_prompts
CREATE POLICY "Users can update own ai_prompts" ON public.ai_prompts
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- example_sections
CREATE POLICY "Users can update own example_sections" ON public.example_sections
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- example_messages
CREATE POLICY "Users can update own example_messages" ON public.example_messages
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- workflows
CREATE POLICY "Users can update own workflows" ON public.workflows
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- linkedin_conversations
CREATE POLICY "Users can update own linkedin_conversations" ON public.linkedin_conversations
  FOR UPDATE USING (public.user_is_org_member(org_id) AND auth.uid() = owner_id);

-- linkedin_messages (no UPDATE policy needed - messages are immutable)

-- ============================================================================
-- PART 4: Create user-scoped DELETE policies (owner or manager)
-- ============================================================================

-- cadences
CREATE POLICY "Owner or manager can delete cadences" ON public.cadences
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- cadence_steps
CREATE POLICY "Owner or manager can delete cadence_steps" ON public.cadence_steps
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- cadence_leads
CREATE POLICY "Owner or manager can delete cadence_leads" ON public.cadence_leads
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- lead_step_instances
CREATE POLICY "Owner or manager can delete lead_step_instances" ON public.lead_step_instances
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- leads
CREATE POLICY "Owner or manager can delete leads" ON public.leads
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- templates
CREATE POLICY "Owner or manager can delete templates" ON public.templates
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- schedules
CREATE POLICY "Owner or manager can delete schedules" ON public.schedules
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- ai_prompts
CREATE POLICY "Owner or manager can delete ai_prompts" ON public.ai_prompts
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- example_sections
CREATE POLICY "Owner or manager can delete example_sections" ON public.example_sections
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- example_messages
CREATE POLICY "Owner or manager can delete example_messages" ON public.example_messages
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- workflows
CREATE POLICY "Owner or manager can delete workflows" ON public.workflows
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

-- ============================================================================
-- PART 5: Composite indexes for query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_cadences_org_owner ON public.cadences(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_owner ON public.leads(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_templates_org_owner ON public.templates(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_cadence_steps_org_owner ON public.cadence_steps(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_cadence_leads_org_owner ON public.cadence_leads(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_lead_step_instances_org_owner ON public.lead_step_instances(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_schedules_org_owner ON public.schedules(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_org_owner ON public.email_messages(org_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_org_owner ON public.activity_log(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_org_owner ON public.ai_prompts(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_example_sections_org_owner ON public.example_sections(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_example_messages_org_owner ON public.example_messages(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_workflows_org_owner ON public.workflows(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_conversations_org_owner ON public.linkedin_conversations(org_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_messages_org_owner ON public.linkedin_messages(org_id, owner_id);
