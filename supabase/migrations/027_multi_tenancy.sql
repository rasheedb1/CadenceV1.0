-- ============================================================================
-- Migration 027: Multi-Tenancy — Organizations, Members, Invitations
-- ============================================================================
-- This migration adds organization support to Laiky AI.
-- It creates new tables, adds org_id to all data tables, backfills existing
-- data, and creates org-based RLS policies alongside existing ones.
-- ============================================================================

-- Enable pgcrypto for gen_random_bytes (used by invitation tokens)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- PART 1: New Tables
-- ============================================================================

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization members table
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
  permissions JSONB DEFAULT '{}',
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON public.organization_members(org_id, role);

CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Organization invitations table
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON public.organization_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON public.organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON public.organization_invitations(org_id, status);

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 2: RLS Helper Functions
-- ============================================================================

-- Check if current user is a member of the given org
CREATE OR REPLACE FUNCTION public.user_is_org_member(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = check_org_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user has a minimum role level in the given org
-- Role hierarchy: admin=4, manager=3, member=2, viewer=1
CREATE OR REPLACE FUNCTION public.user_has_org_role(check_org_id UUID, min_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  role_level INT;
  min_level INT;
BEGIN
  SELECT role INTO user_role
  FROM public.organization_members
  WHERE org_id = check_org_id AND user_id = auth.uid();

  IF user_role IS NULL THEN RETURN FALSE; END IF;

  role_level := CASE user_role
    WHEN 'admin' THEN 4
    WHEN 'manager' THEN 3
    WHEN 'member' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;

  min_level := CASE min_role
    WHEN 'admin' THEN 4
    WHEN 'manager' THEN 3
    WHEN 'member' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;

  RETURN role_level >= min_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- PART 3: RLS Policies for New Tables
-- ============================================================================

-- Organizations: members can view, creators can insert, admins can update/delete
CREATE POLICY "Members can view own org" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can create orgs" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update own org" ON public.organizations
  FOR UPDATE USING (
    id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete own org" ON public.organizations
  FOR DELETE USING (
    id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role can manage all organizations" ON public.organizations
  FOR ALL USING (auth.role() = 'service_role');

-- Organization members
CREATE POLICY "Members can view org members" ON public.organization_members
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid())
  );

CREATE POLICY "Admins and managers can add members" ON public.organization_members
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'manager')
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Admins can update members" ON public.organization_members
  FOR UPDATE USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

CREATE POLICY "Admins can remove members or self-remove" ON public.organization_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

CREATE POLICY "Service role can manage all org members" ON public.organization_members
  FOR ALL USING (auth.role() = 'service_role');

-- Organization invitations
CREATE POLICY "Members can view org invitations" ON public.organization_invitations
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid())
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Admins and managers can create invitations" ON public.organization_invitations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins managers or invitees can update invitations" ON public.organization_invitations
  FOR UPDATE USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'manager')
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Service role can manage all invitations" ON public.organization_invitations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 4: Add current_org_id to profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 5: Add org_id column to ALL data tables (nullable initially for backfill)
-- ============================================================================

-- Group 1: Core cadence tables
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.cadences ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.cadence_steps ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.cadence_leads ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lead_step_instances ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 2: Email tables
ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 3: LinkedIn tables
ALTER TABLE public.linkedin_conversations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.linkedin_messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 4: Activity & stats
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_message_stats ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 5: AI system
ALTER TABLE public.ai_prompts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.example_sections ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.example_messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 6: Workflows
ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_event_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 7: Account mapping
ALTER TABLE public.account_maps ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.account_map_companies ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.buyer_personas ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 8: Registry
ALTER TABLE public.company_registry ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 9: ICP
ALTER TABLE public.icp_templates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.icp_discovery_feedback ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Group 10: Outreach strategies (from migration 026)
ALTER TABLE public.outreach_strategies ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- PART 6: Data Migration — Auto-create orgs for existing users
-- ============================================================================

-- Create a personal org for each existing user
INSERT INTO public.organizations (id, name, slug, created_by)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)) || '''s Team',
  LOWER(REGEXP_REPLACE(
    COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)),
    '[^a-zA-Z0-9]+', '-', 'g'
  )) || '-' || LEFT(gen_random_uuid()::text, 8),
  p.user_id
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id;

-- Add each user as admin of their own org
INSERT INTO public.organization_members (org_id, user_id, role)
SELECT o.id, o.created_by, 'admin'
FROM public.organizations o;

-- Set current_org_id for each user
UPDATE public.profiles p
SET current_org_id = o.id
FROM public.organizations o
WHERE o.created_by = p.user_id;

-- ============================================================================
-- PART 7: Backfill org_id on ALL existing data rows
-- ============================================================================

-- Core cadence tables (use owner_id to find their org)
UPDATE public.leads l SET org_id = o.id
FROM public.organizations o WHERE o.created_by = l.owner_id AND l.org_id IS NULL;

UPDATE public.cadences c SET org_id = o.id
FROM public.organizations o WHERE o.created_by = c.owner_id AND c.org_id IS NULL;

UPDATE public.cadence_steps cs SET org_id = o.id
FROM public.organizations o WHERE o.created_by = cs.owner_id AND cs.org_id IS NULL;

UPDATE public.cadence_leads cl SET org_id = o.id
FROM public.organizations o WHERE o.created_by = cl.owner_id AND cl.org_id IS NULL;

UPDATE public.lead_step_instances lsi SET org_id = o.id
FROM public.organizations o WHERE o.created_by = lsi.owner_id AND lsi.org_id IS NULL;

UPDATE public.schedules s SET org_id = o.id
FROM public.organizations o WHERE o.created_by = s.owner_id AND s.org_id IS NULL;

UPDATE public.templates t SET org_id = o.id
FROM public.organizations o WHERE o.created_by = t.owner_id AND t.org_id IS NULL;

-- Email tables (use owner_user_id)
UPDATE public.email_messages em SET org_id = o.id
FROM public.organizations o WHERE o.created_by = em.owner_user_id AND em.org_id IS NULL;

UPDATE public.email_events ee SET org_id = o.id
FROM public.organizations o WHERE o.created_by = ee.owner_user_id AND ee.org_id IS NULL;

-- LinkedIn tables
UPDATE public.linkedin_conversations lc SET org_id = o.id
FROM public.organizations o WHERE o.created_by = lc.owner_id AND lc.org_id IS NULL;

UPDATE public.linkedin_messages lm SET org_id = o.id
FROM public.organizations o WHERE o.created_by = lm.owner_id AND lm.org_id IS NULL;

-- Activity & stats
UPDATE public.activity_log al SET org_id = o.id
FROM public.organizations o WHERE o.created_by = al.owner_id AND al.org_id IS NULL;

UPDATE public.weekly_message_stats wms SET org_id = o.id
FROM public.organizations o WHERE o.created_by = wms.owner_id AND wms.org_id IS NULL;

UPDATE public.notifications n SET org_id = o.id
FROM public.organizations o WHERE o.created_by = n.owner_id AND n.org_id IS NULL;

-- AI system
UPDATE public.ai_prompts ap SET org_id = o.id
FROM public.organizations o WHERE o.created_by = ap.owner_id AND ap.org_id IS NULL;

UPDATE public.example_sections es SET org_id = o.id
FROM public.organizations o WHERE o.created_by = es.owner_id AND es.org_id IS NULL;

UPDATE public.example_messages em SET org_id = o.id
FROM public.organizations o WHERE o.created_by = em.owner_id AND em.org_id IS NULL;

-- Workflows
UPDATE public.workflows w SET org_id = o.id
FROM public.organizations o WHERE o.created_by = w.owner_id AND w.org_id IS NULL;

UPDATE public.workflow_runs wr SET org_id = o.id
FROM public.organizations o WHERE o.created_by = wr.owner_id AND wr.org_id IS NULL;

UPDATE public.workflow_event_log wel SET org_id = o.id
FROM public.organizations o WHERE o.created_by = wel.owner_id AND wel.org_id IS NULL;

-- Account mapping
UPDATE public.account_maps am SET org_id = o.id
FROM public.organizations o WHERE o.created_by = am.owner_id AND am.org_id IS NULL;

UPDATE public.account_map_companies amc SET org_id = o.id
FROM public.organizations o WHERE o.created_by = amc.owner_id AND amc.org_id IS NULL;

UPDATE public.buyer_personas bp SET org_id = o.id
FROM public.organizations o WHERE o.created_by = bp.owner_id AND bp.org_id IS NULL;

UPDATE public.prospects p SET org_id = o.id
FROM public.organizations o WHERE o.created_by = p.owner_id AND p.org_id IS NULL;

-- Registry
UPDATE public.company_registry cr SET org_id = o.id
FROM public.organizations o WHERE o.created_by = cr.owner_id AND cr.org_id IS NULL;

-- ICP
UPDATE public.icp_templates it SET org_id = o.id
FROM public.organizations o WHERE o.created_by = it.owner_id AND it.org_id IS NULL;

UPDATE public.icp_discovery_feedback idf SET org_id = o.id
FROM public.organizations o WHERE o.created_by = idf.owner_id AND idf.org_id IS NULL;

-- Outreach strategies
UPDATE public.outreach_strategies os SET org_id = o.id
FROM public.organizations o WHERE o.created_by = os.owner_id AND os.org_id IS NULL;

-- ============================================================================
-- PART 8: Make org_id NOT NULL after backfill
-- ============================================================================

ALTER TABLE public.leads ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.cadences ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.cadence_steps ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.cadence_leads ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.lead_step_instances ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.schedules ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.templates ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.email_messages ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.email_events ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.linkedin_conversations ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.linkedin_messages ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.activity_log ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.weekly_message_stats ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.ai_prompts ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.example_sections ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.example_messages ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.workflows ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.workflow_runs ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.workflow_event_log ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.account_maps ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.account_map_companies ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.buyer_personas ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.prospects ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.company_registry ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.icp_templates ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.icp_discovery_feedback ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.outreach_strategies ALTER COLUMN org_id SET NOT NULL;

-- ============================================================================
-- PART 9: Add org_id indexes for all tables
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_org_id ON public.leads(org_id);
CREATE INDEX IF NOT EXISTS idx_cadences_org_id ON public.cadences(org_id);
CREATE INDEX IF NOT EXISTS idx_cadence_steps_org_id ON public.cadence_steps(org_id);
CREATE INDEX IF NOT EXISTS idx_cadence_leads_org_id ON public.cadence_leads(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_step_instances_org_id ON public.lead_step_instances(org_id);
CREATE INDEX IF NOT EXISTS idx_schedules_org_id ON public.schedules(org_id);
CREATE INDEX IF NOT EXISTS idx_templates_org_id ON public.templates(org_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_org_id ON public.email_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_email_events_org_id ON public.email_events(org_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_conversations_org_id ON public.linkedin_conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_messages_org_id ON public.linkedin_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_org_id ON public.activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_weekly_message_stats_org_id ON public.weekly_message_stats(org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON public.notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_org_id ON public.ai_prompts(org_id);
CREATE INDEX IF NOT EXISTS idx_example_sections_org_id ON public.example_sections(org_id);
CREATE INDEX IF NOT EXISTS idx_example_messages_org_id ON public.example_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_workflows_org_id ON public.workflows(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_org_id ON public.workflow_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_event_log_org_id ON public.workflow_event_log(org_id);
CREATE INDEX IF NOT EXISTS idx_account_maps_org_id ON public.account_maps(org_id);
CREATE INDEX IF NOT EXISTS idx_account_map_companies_org_id ON public.account_map_companies(org_id);
CREATE INDEX IF NOT EXISTS idx_buyer_personas_org_id ON public.buyer_personas(org_id);
CREATE INDEX IF NOT EXISTS idx_prospects_org_id ON public.prospects(org_id);
CREATE INDEX IF NOT EXISTS idx_company_registry_org_id ON public.company_registry(org_id);
CREATE INDEX IF NOT EXISTS idx_icp_templates_org_id ON public.icp_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_icp_discovery_feedback_org_id ON public.icp_discovery_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_outreach_strategies_org_id ON public.outreach_strategies(org_id);

-- ============================================================================
-- PART 10: Update unique constraints that need org scope
-- ============================================================================

-- company_registry: change from UNIQUE(owner_id, company_name) to UNIQUE(org_id, company_name)
DROP INDEX IF EXISTS public.idx_company_registry_owner_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_registry_org_name
  ON public.company_registry(org_id, company_name);

-- linkedin_conversations: change from UNIQUE(owner_id, lead_id) to UNIQUE(org_id, owner_id, lead_id)
-- Keep owner_id in unique because each user has their own LinkedIn conversation thread
ALTER TABLE public.linkedin_conversations DROP CONSTRAINT IF EXISTS linkedin_conversations_owner_id_lead_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_conversations_org_owner_lead
  ON public.linkedin_conversations(org_id, owner_id, lead_id);

-- icp_discovery_feedback: change from UNIQUE(account_map_id, company_name, owner_id) to include org
ALTER TABLE public.icp_discovery_feedback DROP CONSTRAINT IF EXISTS icp_discovery_feedback_account_map_id_company_name_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_icp_discovery_feedback_map_company_org
  ON public.icp_discovery_feedback(account_map_id, company_name, org_id);

-- outreach_strategies: change from UNIQUE(account_map_id, company_id, owner_id) to include org
ALTER TABLE public.outreach_strategies DROP CONSTRAINT IF EXISTS outreach_strategies_account_map_id_company_id_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_strategies_map_company_org
  ON public.outreach_strategies(account_map_id, company_id, org_id);

-- ============================================================================
-- PART 11: Update upsert_company_registry_prospected RPC to use org_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_company_registry_prospected(
  p_org_id UUID,
  p_owner_id UUID,
  p_company_name TEXT,
  p_company_name_display TEXT,
  p_prospected_at TIMESTAMPTZ DEFAULT NOW(),
  p_prospected_via TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  existing_type TEXT;
BEGIN
  -- Check if company already exists for this org
  SELECT registry_type INTO existing_type
  FROM public.company_registry
  WHERE org_id = p_org_id AND company_name = p_company_name;

  IF existing_type IS NOT NULL THEN
    -- If already an exclusion type, don't overwrite
    IF existing_type IN ('customer', 'competitor', 'dnc') THEN
      RETURN;
    END IF;
    -- Update existing prospected/discovered entry
    UPDATE public.company_registry
    SET
      prospected_at = COALESCE(p_prospected_at, prospected_at),
      prospected_via = COALESCE(p_prospected_via, prospected_via),
      registry_type = 'prospected',
      source = 'auto_prospected',
      updated_at = NOW()
    WHERE org_id = p_org_id AND company_name = p_company_name;
  ELSE
    -- Insert new
    INSERT INTO public.company_registry (
      org_id, owner_id, company_name, company_name_display,
      registry_type, source, prospected_at, prospected_via
    ) VALUES (
      p_org_id, p_owner_id, p_company_name, p_company_name_display,
      'prospected', 'auto_prospected', p_prospected_at, p_prospected_via
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 12: Org-based RLS policies (alongside existing owner_id policies)
-- ============================================================================

-- Helper macro: For each data table, add org-based SELECT/INSERT/UPDATE/DELETE
-- These coexist with the old owner_id policies (Supabase OR's multiple policies)

-- leads
CREATE POLICY "Org members can view leads" ON public.leads
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create leads" ON public.leads
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update leads" ON public.leads
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete leads" ON public.leads
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- cadences
CREATE POLICY "Org members can view cadences" ON public.cadences
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create cadences" ON public.cadences
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update cadences" ON public.cadences
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete cadences" ON public.cadences
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- cadence_steps
CREATE POLICY "Org members can view cadence_steps" ON public.cadence_steps
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create cadence_steps" ON public.cadence_steps
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update cadence_steps" ON public.cadence_steps
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete cadence_steps" ON public.cadence_steps
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- cadence_leads
CREATE POLICY "Org members can view cadence_leads" ON public.cadence_leads
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create cadence_leads" ON public.cadence_leads
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update cadence_leads" ON public.cadence_leads
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete cadence_leads" ON public.cadence_leads
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- lead_step_instances
CREATE POLICY "Org members can view lead_step_instances" ON public.lead_step_instances
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create lead_step_instances" ON public.lead_step_instances
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update lead_step_instances" ON public.lead_step_instances
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete lead_step_instances" ON public.lead_step_instances
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- schedules
CREATE POLICY "Org members can view schedules" ON public.schedules
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create schedules" ON public.schedules
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update schedules" ON public.schedules
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete schedules" ON public.schedules
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- templates
CREATE POLICY "Org members can view templates" ON public.templates
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create templates" ON public.templates
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update templates" ON public.templates
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete templates" ON public.templates
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- email_messages
CREATE POLICY "Org members can view email_messages" ON public.email_messages
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create email_messages" ON public.email_messages
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update email_messages" ON public.email_messages
  FOR UPDATE USING (public.user_is_org_member(org_id));

-- email_events
CREATE POLICY "Org members can view email_events" ON public.email_events
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create email_events" ON public.email_events
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));

-- linkedin_conversations
CREATE POLICY "Org members can view linkedin_conversations" ON public.linkedin_conversations
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create linkedin_conversations" ON public.linkedin_conversations
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update linkedin_conversations" ON public.linkedin_conversations
  FOR UPDATE USING (public.user_is_org_member(org_id));

-- linkedin_messages
CREATE POLICY "Org members can view linkedin_messages" ON public.linkedin_messages
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create linkedin_messages" ON public.linkedin_messages
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update linkedin_messages" ON public.linkedin_messages
  FOR UPDATE USING (public.user_is_org_member(org_id));

-- activity_log
CREATE POLICY "Org members can view activity_log" ON public.activity_log
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create activity_log" ON public.activity_log
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));

-- weekly_message_stats
CREATE POLICY "Org members can view weekly_message_stats" ON public.weekly_message_stats
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create weekly_message_stats" ON public.weekly_message_stats
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update weekly_message_stats" ON public.weekly_message_stats
  FOR UPDATE USING (public.user_is_org_member(org_id));

-- notifications
CREATE POLICY "Org members can view notifications" ON public.notifications
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update notifications" ON public.notifications
  FOR UPDATE USING (public.user_is_org_member(org_id));

-- ai_prompts
CREATE POLICY "Org members can view ai_prompts" ON public.ai_prompts
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create ai_prompts" ON public.ai_prompts
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update ai_prompts" ON public.ai_prompts
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete ai_prompts" ON public.ai_prompts
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- example_sections
CREATE POLICY "Org members can view example_sections" ON public.example_sections
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create example_sections" ON public.example_sections
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update example_sections" ON public.example_sections
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete example_sections" ON public.example_sections
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- example_messages
CREATE POLICY "Org members can view example_messages" ON public.example_messages
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create example_messages" ON public.example_messages
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update example_messages" ON public.example_messages
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete example_messages" ON public.example_messages
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- workflows
CREATE POLICY "Org members can view workflows" ON public.workflows
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create workflows" ON public.workflows
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update workflows" ON public.workflows
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete workflows" ON public.workflows
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- workflow_runs
CREATE POLICY "Org members can view workflow_runs" ON public.workflow_runs
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create workflow_runs" ON public.workflow_runs
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update workflow_runs" ON public.workflow_runs
  FOR UPDATE USING (public.user_is_org_member(org_id));

-- workflow_event_log
CREATE POLICY "Org members can view workflow_event_log" ON public.workflow_event_log
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create workflow_event_log" ON public.workflow_event_log
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));

-- account_maps
CREATE POLICY "Org members can view account_maps" ON public.account_maps
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create account_maps" ON public.account_maps
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update account_maps" ON public.account_maps
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete account_maps" ON public.account_maps
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- account_map_companies
CREATE POLICY "Org members can view account_map_companies" ON public.account_map_companies
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create account_map_companies" ON public.account_map_companies
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update account_map_companies" ON public.account_map_companies
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete account_map_companies" ON public.account_map_companies
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- buyer_personas
CREATE POLICY "Org members can view buyer_personas" ON public.buyer_personas
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create buyer_personas" ON public.buyer_personas
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update buyer_personas" ON public.buyer_personas
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete buyer_personas" ON public.buyer_personas
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- prospects
CREATE POLICY "Org members can view prospects" ON public.prospects
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create prospects" ON public.prospects
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update prospects" ON public.prospects
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete prospects" ON public.prospects
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- company_registry
CREATE POLICY "Org members can view company_registry" ON public.company_registry
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create company_registry" ON public.company_registry
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update company_registry" ON public.company_registry
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete company_registry" ON public.company_registry
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- icp_templates
CREATE POLICY "Org members can view icp_templates" ON public.icp_templates
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create icp_templates" ON public.icp_templates
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update icp_templates" ON public.icp_templates
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete icp_templates" ON public.icp_templates
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));

-- icp_discovery_feedback
CREATE POLICY "Org members can view icp_discovery_feedback" ON public.icp_discovery_feedback
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create icp_discovery_feedback" ON public.icp_discovery_feedback
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update icp_discovery_feedback" ON public.icp_discovery_feedback
  FOR UPDATE USING (public.user_is_org_member(org_id));

-- outreach_strategies
CREATE POLICY "Org members can view outreach_strategies" ON public.outreach_strategies
  FOR SELECT USING (public.user_is_org_member(org_id));
CREATE POLICY "Org members can create outreach_strategies" ON public.outreach_strategies
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));
CREATE POLICY "Org members can update outreach_strategies" ON public.outreach_strategies
  FOR UPDATE USING (public.user_is_org_member(org_id));
CREATE POLICY "Org managers can delete outreach_strategies" ON public.outreach_strategies
  FOR DELETE USING (public.user_has_org_role(org_id, 'manager'));
