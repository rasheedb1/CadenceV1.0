-- =====================================================
-- LAIKY CADENCE - Complete Database Schema
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PROFILES - User Profiles (extends auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  unipile_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. LEADS - Prospects/Contacts
-- =====================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  company TEXT,
  title TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. CADENCES - Outreach Sequences
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cadences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. CADENCE_STEPS - Steps within Cadences
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cadence_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cadence_id UUID NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  step_type TEXT NOT NULL CHECK (step_type IN (
    'send_email',
    'linkedin_message',
    'linkedin_like',
    'linkedin_connect',
    'linkedin_comment',
    'whatsapp_message',
    'call_manual'
  )),
  step_label TEXT NOT NULL,
  day_offset INTEGER NOT NULL DEFAULT 0,
  order_in_day INTEGER NOT NULL DEFAULT 0,
  config_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. CADENCE_LEADS - Leads assigned to Cadences
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cadence_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cadence_id UUID NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  current_step_id UUID REFERENCES public.cadence_steps(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'active', 'pending', 'generated', 'sent', 'failed', 'paused', 'scheduled', 'completed'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cadence_id, lead_id)
);

-- =====================================================
-- 6. LEAD_STEP_INSTANCES - State of each step per lead
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lead_step_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cadence_id UUID NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  cadence_step_id UUID NOT NULL REFERENCES public.cadence_steps(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'generated', 'sent', 'failed', 'skipped'
  )),
  draft_json JSONB,
  message_template_text TEXT,
  message_rendered_text TEXT,
  payload_snapshot JSONB,
  result_snapshot JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cadence_step_id, lead_id)
);

-- =====================================================
-- 7. SCHEDULES - Scheduled actions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cadence_id UUID NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  cadence_step_id UUID NOT NULL REFERENCES public.cadence_steps(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'executed', 'canceled', 'skipped_due_to_state_change', 'failed'
  )),
  message_template_text TEXT,
  message_rendered_text TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. TEMPLATES - Reusable message templates
-- =====================================================
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN (
    'send_email',
    'linkedin_message',
    'linkedin_like',
    'linkedin_connect',
    'linkedin_comment',
    'whatsapp_message',
    'call_manual'
  )),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. EMAIL_MESSAGES - Sent emails with tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID UNIQUE DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  cadence_id UUID REFERENCES public.cadences(id) ON DELETE SET NULL,
  cadence_step_id UUID REFERENCES public.cadence_steps(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body_original TEXT,
  html_body_tracked TEXT,
  gmail_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. EMAIL_EVENTS - Email tracking events
-- =====================================================
CREATE TABLE IF NOT EXISTS public.email_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  cadence_id UUID REFERENCES public.cadences(id) ON DELETE SET NULL,
  cadence_step_id UUID REFERENCES public.cadence_steps(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'opened', 'clicked', 'failed', 'bounced')),
  link_url TEXT,
  link_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 11. LINKEDIN_CONVERSATIONS - LinkedIn chat threads
-- =====================================================
CREATE TABLE IF NOT EXISTS public.linkedin_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  linkedin_thread_id TEXT,
  phantom_thread_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_messaged' CHECK (status IN (
    'not_messaged', 'messaged', 'awaiting_reply', 'replied', 'failed'
  )),
  last_activity_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, lead_id)
);

-- =====================================================
-- 12. LINKEDIN_MESSAGES - Individual LinkedIn messages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.linkedin_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.linkedin_conversations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider TEXT DEFAULT 'unipile',
  provider_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN (
    'pending', 'sent', 'delivered', 'failed'
  )),
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 13. ACTIVITY_LOG - All system actions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  cadence_id UUID REFERENCES public.cadences(id) ON DELETE SET NULL,
  cadence_step_id UUID REFERENCES public.cadence_steps(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  status TEXT DEFAULT 'ok' CHECK (status IN ('ok', 'failed')),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 14. WEEKLY_MESSAGE_STATS - Rate limiting tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS public.weekly_message_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  linkedin_sent INTEGER DEFAULT 0,
  sales_navigator_sent INTEGER DEFAULT 0,
  sales_navigator_credit_errors INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, week_start)
);

-- =====================================================
-- INDEXES for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON public.leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_linkedin_url ON public.leads(linkedin_url);

CREATE INDEX IF NOT EXISTS idx_cadences_owner_id ON public.cadences(owner_id);
CREATE INDEX IF NOT EXISTS idx_cadences_status ON public.cadences(status);

CREATE INDEX IF NOT EXISTS idx_cadence_steps_cadence_id ON public.cadence_steps(cadence_id);
CREATE INDEX IF NOT EXISTS idx_cadence_steps_owner_id ON public.cadence_steps(owner_id);

CREATE INDEX IF NOT EXISTS idx_cadence_leads_cadence_id ON public.cadence_leads(cadence_id);
CREATE INDEX IF NOT EXISTS idx_cadence_leads_lead_id ON public.cadence_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_cadence_leads_owner_id ON public.cadence_leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_cadence_leads_status ON public.cadence_leads(status);

CREATE INDEX IF NOT EXISTS idx_lead_step_instances_cadence_id ON public.lead_step_instances(cadence_id);
CREATE INDEX IF NOT EXISTS idx_lead_step_instances_lead_id ON public.lead_step_instances(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_step_instances_status ON public.lead_step_instances(status);

CREATE INDEX IF NOT EXISTS idx_schedules_owner_id ON public.schedules(owner_id);
CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at ON public.schedules(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON public.schedules(status);

CREATE INDEX IF NOT EXISTS idx_templates_owner_id ON public.templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_templates_step_type ON public.templates(step_type);

CREATE INDEX IF NOT EXISTS idx_email_messages_owner_id ON public.email_messages(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_lead_id ON public.email_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_event_id ON public.email_messages(event_id);

CREATE INDEX IF NOT EXISTS idx_email_events_event_id ON public.email_events(event_id);
CREATE INDEX IF NOT EXISTS idx_email_events_lead_id ON public.email_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON public.email_events(created_at);

CREATE INDEX IF NOT EXISTS idx_linkedin_conversations_owner_id ON public.linkedin_conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_conversations_lead_id ON public.linkedin_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_conversations_status ON public.linkedin_conversations(status);

CREATE INDEX IF NOT EXISTS idx_linkedin_messages_conversation_id ON public.linkedin_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_messages_direction ON public.linkedin_messages(direction);

CREATE INDEX IF NOT EXISTS idx_activity_log_owner_id ON public.activity_log(owner_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_lead_id ON public.activity_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_cadence_id ON public.activity_log(cadence_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log(created_at);

CREATE INDEX IF NOT EXISTS idx_weekly_message_stats_owner_id ON public.weekly_message_stats(owner_id);
CREATE INDEX IF NOT EXISTS idx_weekly_message_stats_week_start ON public.weekly_message_stats(week_start);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_step_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_message_stats ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - Profiles
-- =====================================================
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- RLS POLICIES - Leads
-- =====================================================
CREATE POLICY "Users can view own leads" ON public.leads
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own leads" ON public.leads
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own leads" ON public.leads
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own leads" ON public.leads
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Cadences
-- =====================================================
CREATE POLICY "Users can view own cadences" ON public.cadences
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own cadences" ON public.cadences
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own cadences" ON public.cadences
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own cadences" ON public.cadences
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Cadence Steps
-- =====================================================
CREATE POLICY "Users can view own cadence steps" ON public.cadence_steps
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own cadence steps" ON public.cadence_steps
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own cadence steps" ON public.cadence_steps
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own cadence steps" ON public.cadence_steps
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Cadence Leads
-- =====================================================
CREATE POLICY "Users can view own cadence leads" ON public.cadence_leads
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own cadence leads" ON public.cadence_leads
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own cadence leads" ON public.cadence_leads
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own cadence leads" ON public.cadence_leads
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Lead Step Instances
-- =====================================================
CREATE POLICY "Users can view own lead step instances" ON public.lead_step_instances
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own lead step instances" ON public.lead_step_instances
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own lead step instances" ON public.lead_step_instances
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own lead step instances" ON public.lead_step_instances
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Schedules
-- =====================================================
CREATE POLICY "Users can view own schedules" ON public.schedules
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own schedules" ON public.schedules
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own schedules" ON public.schedules
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own schedules" ON public.schedules
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Templates
-- =====================================================
CREATE POLICY "Users can view own templates" ON public.templates
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own templates" ON public.templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own templates" ON public.templates
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own templates" ON public.templates
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Email Messages
-- =====================================================
CREATE POLICY "Users can view own email messages" ON public.email_messages
  FOR SELECT USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can create own email messages" ON public.email_messages
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own email messages" ON public.email_messages
  FOR UPDATE USING (auth.uid() = owner_user_id);

-- =====================================================
-- RLS POLICIES - Email Events
-- =====================================================
CREATE POLICY "Users can view own email events" ON public.email_events
  FOR SELECT USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can create own email events" ON public.email_events
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

-- =====================================================
-- RLS POLICIES - LinkedIn Conversations
-- =====================================================
CREATE POLICY "Users can view own linkedin conversations" ON public.linkedin_conversations
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own linkedin conversations" ON public.linkedin_conversations
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own linkedin conversations" ON public.linkedin_conversations
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own linkedin conversations" ON public.linkedin_conversations
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - LinkedIn Messages
-- =====================================================
CREATE POLICY "Users can view own linkedin messages" ON public.linkedin_messages
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own linkedin messages" ON public.linkedin_messages
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own linkedin messages" ON public.linkedin_messages
  FOR UPDATE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Activity Log
-- =====================================================
CREATE POLICY "Users can view own activity log" ON public.activity_log
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own activity log" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Weekly Message Stats
-- =====================================================
CREATE POLICY "Users can view own weekly stats" ON public.weekly_message_stats
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own weekly stats" ON public.weekly_message_stats
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own weekly stats" ON public.weekly_message_stats
  FOR UPDATE USING (auth.uid() = owner_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS for updated_at
-- =====================================================
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cadences_updated_at
  BEFORE UPDATE ON public.cadences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cadence_steps_updated_at
  BEFORE UPDATE ON public.cadence_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cadence_leads_updated_at
  BEFORE UPDATE ON public.cadence_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_step_instances_updated_at
  BEFORE UPDATE ON public.lead_step_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_linkedin_conversations_updated_at
  BEFORE UPDATE ON public.linkedin_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_message_stats_updated_at
  BEFORE UPDATE ON public.weekly_message_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- HELPER FUNCTION: Get current week start (Monday)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_week_start(input_date DATE DEFAULT CURRENT_DATE)
RETURNS DATE AS $$
BEGIN
  RETURN input_date - EXTRACT(DOW FROM input_date)::INTEGER + 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- HELPER FUNCTION: Increment weekly LinkedIn counter
-- =====================================================
CREATE OR REPLACE FUNCTION public.increment_linkedin_sent(p_owner_id UUID)
RETURNS void AS $$
DECLARE
  v_week_start DATE;
BEGIN
  v_week_start := public.get_week_start();

  INSERT INTO public.weekly_message_stats (owner_id, week_start, linkedin_sent)
  VALUES (p_owner_id, v_week_start, 1)
  ON CONFLICT (owner_id, week_start)
  DO UPDATE SET
    linkedin_sent = weekly_message_stats.linkedin_sent + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
