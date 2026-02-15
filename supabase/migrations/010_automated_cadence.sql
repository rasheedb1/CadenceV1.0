-- =====================================================
-- Automated Cadence Execution + Reply Detection + Notifications
-- =====================================================

-- 1. Add automation_mode to cadences
ALTER TABLE public.cadences ADD COLUMN IF NOT EXISTS automation_mode TEXT DEFAULT 'manual'
  CHECK (automation_mode IN ('manual', 'automated'));

-- 2. Add 'replied' to cadence_leads status
ALTER TABLE public.cadence_leads DROP CONSTRAINT IF EXISTS cadence_leads_status_check;
ALTER TABLE public.cadence_leads ADD CONSTRAINT cadence_leads_status_check
  CHECK (status IN ('active','pending','generated','sent','failed','paused','scheduled','completed','replied'));

-- 3. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  cadence_id UUID REFERENCES public.cadences(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('reply_detected','cadence_completed','step_failed','automation_started')),
  title TEXT NOT NULL,
  body TEXT,
  channel TEXT,
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(owner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(owner_id, is_read) WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role manages notifications" ON notifications;
CREATE POLICY "Service role manages notifications" ON notifications
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Add last_reply_checked_at to linkedin_conversations
ALTER TABLE public.linkedin_conversations ADD COLUMN IF NOT EXISTS last_reply_checked_at TIMESTAMPTZ;
