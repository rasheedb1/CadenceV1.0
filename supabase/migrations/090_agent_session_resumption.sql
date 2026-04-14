-- Migration 090: Add session_id to agent_tasks_v2 for SDK session resumption
-- When an agent asks the user a question, the SDK session is saved.
-- When the user replies, the same session resumes — agent remembers everything.

ALTER TABLE agent_tasks_v2 ADD COLUMN IF NOT EXISTS session_id TEXT;

COMMENT ON COLUMN agent_tasks_v2.session_id IS 'Claude Agent SDK session ID for resuming multi-turn conversations. Set after first executeWithSDK call, used to resume when user replies.';
