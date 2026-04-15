-- Add session_id to chief_sessions for Claude Agent SDK session resumption
ALTER TABLE public.chief_sessions
  ADD COLUMN IF NOT EXISTS session_id text DEFAULT NULL;

COMMENT ON COLUMN public.chief_sessions.session_id IS 'Claude Agent SDK session ID for conversation resumption';
