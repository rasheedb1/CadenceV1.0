-- Add linkedin_profile_view to cadence_steps and templates step_type CHECK constraints

ALTER TABLE public.cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_step_type_check;

ALTER TABLE public.cadence_steps ADD CONSTRAINT cadence_steps_step_type_check
  CHECK (step_type IN (
    'send_email',
    'email_reply',
    'linkedin_message',
    'linkedin_like',
    'linkedin_connect',
    'linkedin_comment',
    'linkedin_profile_view',
    'whatsapp_message',
    'whatsapp',
    'cold_call',
    'call_manual',
    'task'
  ));

ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_step_type_check;

ALTER TABLE public.templates ADD CONSTRAINT templates_step_type_check
  CHECK (step_type IN (
    'send_email',
    'email_reply',
    'linkedin_message',
    'linkedin_like',
    'linkedin_connect',
    'linkedin_comment',
    'linkedin_profile_view',
    'whatsapp_message',
    'whatsapp',
    'cold_call',
    'call_manual',
    'task'
  ));
