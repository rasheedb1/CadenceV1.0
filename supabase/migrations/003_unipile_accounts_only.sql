-- =====================================================
-- UNIPILE_ACCOUNTS - Store connected Unipile accounts (safe to run multiple times)
-- =====================================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS public.unipile_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'LINKEDIN' CHECK (provider IN ('LINKEDIN', 'EMAIL', 'WHATSAPP')),
  account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_unipile_accounts_user_id ON public.unipile_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_unipile_accounts_account_id ON public.unipile_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_unipile_accounts_status ON public.unipile_accounts(status);

-- Enable RLS (safe to run multiple times)
ALTER TABLE public.unipile_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can view own unipile accounts" ON public.unipile_accounts;
DROP POLICY IF EXISTS "Users can insert own unipile accounts" ON public.unipile_accounts;
DROP POLICY IF EXISTS "Users can update own unipile accounts" ON public.unipile_accounts;
DROP POLICY IF EXISTS "Users can delete own unipile accounts" ON public.unipile_accounts;
DROP POLICY IF EXISTS "Service role can manage all unipile accounts" ON public.unipile_accounts;

-- RLS Policies
CREATE POLICY "Users can view own unipile accounts" ON public.unipile_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own unipile accounts" ON public.unipile_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own unipile accounts" ON public.unipile_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own unipile accounts" ON public.unipile_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Service role policy for edge functions
CREATE POLICY "Service role can manage all unipile accounts" ON public.unipile_accounts
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger for updated_at (drop and recreate)
DROP TRIGGER IF EXISTS update_unipile_accounts_updated_at ON public.unipile_accounts;
CREATE TRIGGER update_unipile_accounts_updated_at
  BEFORE UPDATE ON public.unipile_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to sync to profiles (create or replace is safe)
CREATE OR REPLACE FUNCTION public.sync_unipile_account_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.provider = 'LINKEDIN' AND NEW.status = 'active' THEN
    UPDATE public.profiles
    SET unipile_account_id = NEW.account_id
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_unipile_to_profile ON public.unipile_accounts;
CREATE TRIGGER sync_unipile_to_profile
  AFTER INSERT OR UPDATE ON public.unipile_accounts
  FOR EACH ROW EXECUTE FUNCTION public.sync_unipile_account_to_profile();

-- Function to clear from profiles when disconnected
CREATE OR REPLACE FUNCTION public.clear_unipile_account_from_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.provider = 'LINKEDIN' AND NEW.status = 'disconnected' THEN
    UPDATE public.profiles
    SET unipile_account_id = NULL
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS clear_unipile_from_profile ON public.unipile_accounts;
CREATE TRIGGER clear_unipile_from_profile
  AFTER UPDATE ON public.unipile_accounts
  FOR EACH ROW EXECUTE FUNCTION public.clear_unipile_account_from_profile();
