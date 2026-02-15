-- Add send_email to ai_prompts step_type check constraint
ALTER TABLE public.ai_prompts DROP CONSTRAINT ai_prompts_step_type_check;
ALTER TABLE public.ai_prompts ADD CONSTRAINT ai_prompts_step_type_check
  CHECK (step_type IN ('linkedin_message', 'linkedin_connect', 'linkedin_comment', 'send_email'));
