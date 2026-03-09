import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')!
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

  try {
    // PART 1: account_maps — user-level isolation
    await sql`DROP POLICY IF EXISTS "Org members can view account_maps" ON public.account_maps`
    await sql`DROP POLICY IF EXISTS "Users can view own account maps" ON public.account_maps`
    await sql`
      CREATE POLICY "Users can view own account maps" ON public.account_maps
        FOR SELECT USING (
          auth.uid() = owner_id
          AND public.user_is_org_member(org_id)
        )
    `

    // PART 2: account_map_companies — user-level isolation
    await sql`DROP POLICY IF EXISTS "Org members can view account_map_companies" ON public.account_map_companies`
    await sql`DROP POLICY IF EXISTS "Users can view own account map companies" ON public.account_map_companies`
    await sql`
      CREATE POLICY "Users can view own account map companies" ON public.account_map_companies
        FOR SELECT USING (
          auth.uid() = owner_id
          AND public.user_is_org_member(org_id)
        )
    `

    // PART 3: prospects — user-level isolation
    await sql`DROP POLICY IF EXISTS "Org members can view prospects" ON public.prospects`
    await sql`DROP POLICY IF EXISTS "Users can view own prospects" ON public.prospects`
    await sql`
      CREATE POLICY "Users can view own prospects" ON public.prospects
        FOR SELECT USING (
          auth.uid() = owner_id
          AND public.user_is_org_member(org_id)
        )
    `

    // PART 4: buyer_personas — user-level for account_map, org-level for icp_profile
    await sql`DROP POLICY IF EXISTS "Org members can view buyer_personas" ON public.buyer_personas`
    await sql`DROP POLICY IF EXISTS "Users can view own buyer personas" ON public.buyer_personas`
    await sql`
      CREATE POLICY "Users can view own buyer personas" ON public.buyer_personas
        FOR SELECT USING (
          (account_map_id IS NOT NULL AND auth.uid() = owner_id AND public.user_is_org_member(org_id))
          OR
          (icp_profile_id IS NOT NULL AND public.user_is_org_member(org_id))
        )
    `

    await sql.end()
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await sql.end()
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
