-- =====================================================
-- LLM Provider & Model settings per user
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS llm_provider TEXT NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS llm_model TEXT NOT NULL DEFAULT 'gpt-4o';
