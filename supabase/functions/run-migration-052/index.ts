import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

  try {
    await sql`ALTER TABLE public.salesforce_opportunities ADD COLUMN IF NOT EXISTS opportunity_type TEXT`
    await sql`CREATE INDEX IF NOT EXISTS idx_sf_opps_type ON public.salesforce_opportunities(org_id, opportunity_type) WHERE opportunity_type IS NOT NULL`
    await sql.end()
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await sql.end()
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
