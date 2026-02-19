-- Migration 028: Remove old owner_id-based RLS policies
-- These are replaced by org-based policies from migration 027
-- Tables that KEEP their per-user policies: profiles, unipile_accounts

-- ============================================================
-- leads
-- ============================================================
DROP POLICY IF EXISTS "Users can view own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can create own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;

-- ============================================================
-- cadences
-- ============================================================
DROP POLICY IF EXISTS "Users can view own cadences" ON public.cadences;
DROP POLICY IF EXISTS "Users can create own cadences" ON public.cadences;
DROP POLICY IF EXISTS "Users can update own cadences" ON public.cadences;
DROP POLICY IF EXISTS "Users can delete own cadences" ON public.cadences;

-- ============================================================
-- cadence_steps
-- ============================================================
DROP POLICY IF EXISTS "Users can view own cadence steps" ON public.cadence_steps;
DROP POLICY IF EXISTS "Users can create own cadence steps" ON public.cadence_steps;
DROP POLICY IF EXISTS "Users can update own cadence steps" ON public.cadence_steps;
DROP POLICY IF EXISTS "Users can delete own cadence steps" ON public.cadence_steps;

-- ============================================================
-- cadence_leads
-- ============================================================
DROP POLICY IF EXISTS "Users can view own cadence leads" ON public.cadence_leads;
DROP POLICY IF EXISTS "Users can create own cadence leads" ON public.cadence_leads;
DROP POLICY IF EXISTS "Users can update own cadence leads" ON public.cadence_leads;
DROP POLICY IF EXISTS "Users can delete own cadence leads" ON public.cadence_leads;

-- ============================================================
-- lead_step_instances
-- ============================================================
DROP POLICY IF EXISTS "Users can view own lead step instances" ON public.lead_step_instances;
DROP POLICY IF EXISTS "Users can create own lead step instances" ON public.lead_step_instances;
DROP POLICY IF EXISTS "Users can update own lead step instances" ON public.lead_step_instances;
DROP POLICY IF EXISTS "Users can delete own lead step instances" ON public.lead_step_instances;

-- ============================================================
-- schedules
-- ============================================================
DROP POLICY IF EXISTS "Users can view own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can create own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can update own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can delete own schedules" ON public.schedules;

-- ============================================================
-- templates
-- ============================================================
DROP POLICY IF EXISTS "Users can view own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can create own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can update own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON public.templates;

-- ============================================================
-- email_messages
-- ============================================================
DROP POLICY IF EXISTS "Users can view own email messages" ON public.email_messages;
DROP POLICY IF EXISTS "Users can create own email messages" ON public.email_messages;
DROP POLICY IF EXISTS "Users can update own email messages" ON public.email_messages;

-- ============================================================
-- email_events
-- ============================================================
DROP POLICY IF EXISTS "Users can view own email events" ON public.email_events;
DROP POLICY IF EXISTS "Users can create own email events" ON public.email_events;

-- ============================================================
-- linkedin_conversations
-- ============================================================
DROP POLICY IF EXISTS "Users can view own linkedin conversations" ON public.linkedin_conversations;
DROP POLICY IF EXISTS "Users can create own linkedin conversations" ON public.linkedin_conversations;
DROP POLICY IF EXISTS "Users can update own linkedin conversations" ON public.linkedin_conversations;
DROP POLICY IF EXISTS "Users can delete own linkedin conversations" ON public.linkedin_conversations;

-- ============================================================
-- linkedin_messages
-- ============================================================
DROP POLICY IF EXISTS "Users can view own linkedin messages" ON public.linkedin_messages;
DROP POLICY IF EXISTS "Users can create own linkedin messages" ON public.linkedin_messages;
DROP POLICY IF EXISTS "Users can update own linkedin messages" ON public.linkedin_messages;

-- ============================================================
-- activity_log
-- ============================================================
DROP POLICY IF EXISTS "Users can view own activity log" ON public.activity_log;
DROP POLICY IF EXISTS "Users can create own activity log" ON public.activity_log;

-- ============================================================
-- weekly_message_stats
-- ============================================================
DROP POLICY IF EXISTS "Users can view own weekly stats" ON public.weekly_message_stats;
DROP POLICY IF EXISTS "Users can create own weekly stats" ON public.weekly_message_stats;
DROP POLICY IF EXISTS "Users can update own weekly stats" ON public.weekly_message_stats;

-- ============================================================
-- notifications
-- ============================================================
DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;

-- ============================================================
-- ai_prompts
-- ============================================================
DROP POLICY IF EXISTS "Users can view own ai_prompts" ON ai_prompts;
DROP POLICY IF EXISTS "Users can create own ai_prompts" ON ai_prompts;
DROP POLICY IF EXISTS "Users can update own ai_prompts" ON ai_prompts;
DROP POLICY IF EXISTS "Users can delete own ai_prompts" ON ai_prompts;

-- ============================================================
-- example_sections
-- ============================================================
DROP POLICY IF EXISTS "Users can view own example_sections" ON example_sections;
DROP POLICY IF EXISTS "Users can create own example_sections" ON example_sections;
DROP POLICY IF EXISTS "Users can update own example_sections" ON example_sections;
DROP POLICY IF EXISTS "Users can delete own example_sections" ON example_sections;

-- ============================================================
-- example_messages
-- ============================================================
DROP POLICY IF EXISTS "Users can view own example_messages" ON example_messages;
DROP POLICY IF EXISTS "Users can create own example_messages" ON example_messages;
DROP POLICY IF EXISTS "Users can update own example_messages" ON example_messages;
DROP POLICY IF EXISTS "Users can delete own example_messages" ON example_messages;

-- ============================================================
-- workflows
-- ============================================================
DROP POLICY IF EXISTS "Users can view own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can create own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can update own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete own workflows" ON public.workflows;

-- ============================================================
-- workflow_runs
-- ============================================================
DROP POLICY IF EXISTS "Users can view own workflow runs" ON public.workflow_runs;
DROP POLICY IF EXISTS "Users can create own workflow runs" ON public.workflow_runs;
DROP POLICY IF EXISTS "Users can update own workflow runs" ON public.workflow_runs;
DROP POLICY IF EXISTS "Users can delete own workflow runs" ON public.workflow_runs;

-- ============================================================
-- workflow_event_log
-- ============================================================
DROP POLICY IF EXISTS "Users can view own workflow event log" ON public.workflow_event_log;
DROP POLICY IF EXISTS "Users can create own workflow event log" ON public.workflow_event_log;

-- ============================================================
-- account_maps
-- ============================================================
DROP POLICY IF EXISTS "Users can view own account maps" ON public.account_maps;
DROP POLICY IF EXISTS "Users can create own account maps" ON public.account_maps;
DROP POLICY IF EXISTS "Users can update own account maps" ON public.account_maps;
DROP POLICY IF EXISTS "Users can delete own account maps" ON public.account_maps;

-- ============================================================
-- account_map_companies
-- ============================================================
DROP POLICY IF EXISTS "Users can view own account map companies" ON public.account_map_companies;
DROP POLICY IF EXISTS "Users can create own account map companies" ON public.account_map_companies;
DROP POLICY IF EXISTS "Users can update own account map companies" ON public.account_map_companies;
DROP POLICY IF EXISTS "Users can delete own account map companies" ON public.account_map_companies;

-- ============================================================
-- buyer_personas
-- ============================================================
DROP POLICY IF EXISTS "Users can view own buyer personas" ON public.buyer_personas;
DROP POLICY IF EXISTS "Users can create own buyer personas" ON public.buyer_personas;
DROP POLICY IF EXISTS "Users can update own buyer personas" ON public.buyer_personas;
DROP POLICY IF EXISTS "Users can delete own buyer personas" ON public.buyer_personas;

-- ============================================================
-- prospects
-- ============================================================
DROP POLICY IF EXISTS "Users can view own prospects" ON public.prospects;
DROP POLICY IF EXISTS "Users can create own prospects" ON public.prospects;
DROP POLICY IF EXISTS "Users can update own prospects" ON public.prospects;
DROP POLICY IF EXISTS "Users can delete own prospects" ON public.prospects;

-- ============================================================
-- company_registry
-- ============================================================
DROP POLICY IF EXISTS "Users can view own registry entries" ON public.company_registry;
DROP POLICY IF EXISTS "Users can create own registry entries" ON public.company_registry;
DROP POLICY IF EXISTS "Users can update own registry entries" ON public.company_registry;
DROP POLICY IF EXISTS "Users can delete own registry entries" ON public.company_registry;

-- ============================================================
-- icp_templates
-- ============================================================
DROP POLICY IF EXISTS "Users can view own icp templates" ON public.icp_templates;
DROP POLICY IF EXISTS "Users can create own icp templates" ON public.icp_templates;
DROP POLICY IF EXISTS "Users can update own icp templates" ON public.icp_templates;
DROP POLICY IF EXISTS "Users can delete own icp templates" ON public.icp_templates;

-- ============================================================
-- icp_discovery_feedback
-- ============================================================
DROP POLICY IF EXISTS "Users can view own icp feedback" ON public.icp_discovery_feedback;
DROP POLICY IF EXISTS "Users can create own icp feedback" ON public.icp_discovery_feedback;
DROP POLICY IF EXISTS "Users can update own icp feedback" ON public.icp_discovery_feedback;
DROP POLICY IF EXISTS "Users can delete own icp feedback" ON public.icp_discovery_feedback;

-- ============================================================
-- outreach_strategies
-- ============================================================
DROP POLICY IF EXISTS "Users see own strategies" ON public.outreach_strategies;
DROP POLICY IF EXISTS "Users insert own strategies" ON public.outreach_strategies;
DROP POLICY IF EXISTS "Users update own strategies" ON public.outreach_strategies;
DROP POLICY IF EXISTS "Users delete own strategies" ON public.outreach_strategies;
