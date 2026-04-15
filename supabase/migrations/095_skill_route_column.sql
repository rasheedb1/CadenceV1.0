-- Add route column to skill_registry so the runtime knows HOW to execute each skill
-- edge_function = call via Supabase edge function (call_skill tool)
-- bridge = call via bridge API (call_skill tool)
-- agent = agent executes directly with its own tools (web_search, scrape_url, etc.)

ALTER TABLE public.skill_registry
  ADD COLUMN IF NOT EXISTS route text NOT NULL DEFAULT 'edge_function'
  CHECK (route IN ('edge_function', 'bridge', 'agent'));

-- Backfill existing skills
UPDATE skill_registry SET route = 'bridge' WHERE name = 'business_case';
UPDATE skill_registry SET route = 'agent' WHERE name = 'search_companies_yuno';
-- All others stay as 'edge_function' (default)
