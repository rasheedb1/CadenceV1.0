import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

  try {
    // PART 1: icp_profiles — user-level isolation
    await sql`DROP POLICY IF EXISTS "Org members can view icp_profiles" ON public.icp_profiles`
    await sql`
      CREATE POLICY "Users can view own icp_profiles" ON public.icp_profiles
        FOR SELECT USING (
          auth.uid() = owner_id
          AND public.user_is_org_member(org_id)
        )
    `

    // PART 2: buyer_personas — simplify to owner-only
    // (replaces the 063 policy that had icp_profile_id as org-wide)
    await sql`DROP POLICY IF EXISTS "Users can view own buyer personas" ON public.buyer_personas`
    await sql`
      CREATE POLICY "Users can view own buyer personas" ON public.buyer_personas
        FOR SELECT USING (
          auth.uid() = owner_id
          AND public.user_is_org_member(org_id)
        )
    `

    await sql.end()
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await sql.end()
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
