/**
 * Service-role Supabase client used by the chat module.
 * Falls back to env vars already set on the bridge service.
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://arupeqczrxmfkcbjwyad.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[chat] SUPABASE_SERVICE_ROLE_KEY missing — /api/chat/* will return 500"
  );
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || "stub", {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { sb, SUPABASE_URL };
