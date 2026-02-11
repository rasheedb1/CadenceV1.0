-- Add prompt_type column to distinguish message prompts from research prompts
ALTER TABLE public.ai_prompts
  ADD COLUMN prompt_type TEXT NOT NULL DEFAULT 'message';

-- Add CHECK constraint for prompt_type
ALTER TABLE public.ai_prompts
  ADD CONSTRAINT ai_prompts_prompt_type_check
  CHECK (prompt_type IN ('message', 'research'));

-- Drop old step_type CHECK constraint (inline constraints are named tablename_columnname_check)
ALTER TABLE public.ai_prompts
  DROP CONSTRAINT IF EXISTS ai_prompts_step_type_check;

-- Make step_type nullable (research prompts don't have a step_type)
ALTER TABLE public.ai_prompts
  ALTER COLUMN step_type DROP NOT NULL;

-- New compound CHECK: message prompts require valid step_type, research prompts must have NULL step_type
ALTER TABLE public.ai_prompts
  ADD CONSTRAINT ai_prompts_step_type_check
  CHECK (
    (prompt_type = 'message' AND step_type IN ('linkedin_message', 'linkedin_connect', 'linkedin_comment'))
    OR
    (prompt_type = 'research' AND step_type IS NULL)
  );

-- Index for efficient filtering by prompt_type
CREATE INDEX IF NOT EXISTS idx_ai_prompts_prompt_type ON ai_prompts(owner_id, prompt_type);
