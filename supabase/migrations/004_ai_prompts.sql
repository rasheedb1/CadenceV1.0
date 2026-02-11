-- AI Prompts table for parametrizable prompt templates
CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('linkedin_message', 'linkedin_connect', 'linkedin_comment')),
  description TEXT,
  prompt_body TEXT NOT NULL,
  tone TEXT DEFAULT 'professional' CHECK (tone IN ('professional', 'casual', 'friendly')),
  language TEXT DEFAULT 'es',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_prompts_owner ON ai_prompts(owner_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_step_type ON ai_prompts(step_type);

-- Enable RLS
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own ai_prompts" ON ai_prompts;
CREATE POLICY "Users can view own ai_prompts" ON ai_prompts
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own ai_prompts" ON ai_prompts;
CREATE POLICY "Users can create own ai_prompts" ON ai_prompts
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own ai_prompts" ON ai_prompts;
CREATE POLICY "Users can update own ai_prompts" ON ai_prompts
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own ai_prompts" ON ai_prompts;
CREATE POLICY "Users can delete own ai_prompts" ON ai_prompts
  FOR DELETE USING (auth.uid() = owner_id);

-- Service role access for edge functions
DROP POLICY IF EXISTS "Service role can manage all ai_prompts" ON ai_prompts;
CREATE POLICY "Service role can manage all ai_prompts" ON ai_prompts
  FOR ALL USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE TRIGGER update_ai_prompts_updated_at
  BEFORE UPDATE ON ai_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
