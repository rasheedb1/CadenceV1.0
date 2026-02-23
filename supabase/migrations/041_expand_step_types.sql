-- Expand cadence_steps.step_type CHECK constraint to include whatsapp, cold_call, task
-- Previous constraint only allowed: send_email, linkedin_message, linkedin_like, linkedin_connect, linkedin_comment, whatsapp_message, call_manual

ALTER TABLE public.cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_step_type_check;

ALTER TABLE public.cadence_steps ADD CONSTRAINT cadence_steps_step_type_check
  CHECK (step_type IN (
    'send_email',
    'linkedin_message',
    'linkedin_like',
    'linkedin_connect',
    'linkedin_comment',
    'whatsapp_message',
    'whatsapp',
    'cold_call',
    'call_manual',
    'task'
  ));

-- Also expand templates.step_type if it has a constraint
ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_step_type_check;

ALTER TABLE public.templates ADD CONSTRAINT templates_step_type_check
  CHECK (step_type IN (
    'send_email',
    'linkedin_message',
    'linkedin_like',
    'linkedin_connect',
    'linkedin_comment',
    'whatsapp_message',
    'whatsapp',
    'cold_call',
    'call_manual',
    'task'
  ));
