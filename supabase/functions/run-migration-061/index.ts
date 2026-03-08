import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

  try {
    await sql`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_role TEXT CHECK (job_role IN ('sdr', 'bdm'))`
    await sql`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sf_owner_name TEXT`
    await sql`ALTER TABLE public.salesforce_accounts ADD COLUMN IF NOT EXISTS opp_owner_name TEXT`
    await sql`CREATE INDEX IF NOT EXISTS idx_sf_accounts_opp_owner ON public.salesforce_accounts (org_id, opp_owner_name)`
    await sql.end()
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await sql.end()
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
