import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

  try {
    // Drop old CHECK constraint and add new one with 'gmail' provider
    await sql`ALTER TABLE public.ae_integrations DROP CONSTRAINT IF EXISTS ae_integrations_provider_check`
    await sql`ALTER TABLE public.ae_integrations ADD CONSTRAINT ae_integrations_provider_check CHECK (provider IN ('gong', 'google_calendar', 'gmail'))`
    await sql.end()
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await sql.end()
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
