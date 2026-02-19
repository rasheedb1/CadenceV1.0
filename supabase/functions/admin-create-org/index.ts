import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthUser } from '../_shared/supabase.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authenticate user
    const user = await getAuthUser(authHeader)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify super-admin
    const supabase = createSupabaseClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .single()

    if (!profile?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: super-admin required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { name, slug, plan, adminEmail, adminRole } = await req.json()

    if (!name || !slug) {
      return new Response(JSON.stringify({ error: 'name and slug are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create the organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        plan: plan || 'free',
        plan_started_at: plan && plan !== 'free' ? new Date().toISOString() : null,
        created_by: user.id,
      })
      .select()
      .single()

    if (orgError) {
      return new Response(JSON.stringify({ error: orgError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let inviteLink: string | null = null
    const memberAdded = false

    // Always generate an invite link for the new org
    const role = adminRole || 'admin'
    const { data: invitation, error: inviteError } = await supabase
      .from('organization_invitations')
      .insert({
        org_id: org.id,
        role,
        invited_by: user.id,
      })
      .select('token')
      .single()

    if (inviteError) {
      console.error('Failed to create invitation:', inviteError)
    } else {
      inviteLink = `https://laiky-cadence.vercel.app/invite/${invitation.token}`
    }

    return new Response(
      JSON.stringify({
        org,
        memberAdded,
        inviteLink,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('admin-create-org error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
