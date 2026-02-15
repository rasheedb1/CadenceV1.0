// Supabase client for Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function createSupabaseClient(authHeader?: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  // Use custom key to work around incorrect auto-injected key
  const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  })
}

// Get user from JWT auth, or from ownerId when called with service role key (for cron/process-queue)
export async function getAuthUserOrOwner(authHeader: string, ownerId?: string): Promise<{ id: string } | null> {
  const user = await getAuthUser(authHeader)
  if (user) return user

  // If user auth failed and ownerId was provided, verify caller is using service role key
  if (ownerId) {
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const jwt = authHeader.replace('Bearer ', '')
    if (jwt === serviceKey) {
      console.log(`Service role auth with ownerId: ${ownerId}`)
      return { id: ownerId }
    }
  }

  return null
}

// Get the authenticated user from the request
export async function getAuthUser(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // Use custom key to work around incorrect auto-injected key
  const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  console.log('getAuthUser - SUPABASE_URL:', supabaseUrl)
  console.log('getAuthUser - SERVICE_ROLE_KEY present:', !!supabaseServiceKey)

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    return null
  }

  // Extract the JWT token from the Authorization header
  const jwt = authHeader.replace('Bearer ', '')
  console.log('getAuthUser - JWT length:', jwt.length)
  console.log('getAuthUser - JWT preview:', jwt.substring(0, 20) + '...')

  try {
    // Use Supabase Auth REST API directly for better compatibility
    console.log('getAuthUser - Calling Auth API at:', `${supabaseUrl}/auth/v1/user`)
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': authHeader,
        'apikey': supabaseServiceKey,
      },
    })

    console.log('getAuthUser - Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('getAuthUser - Auth API error:', errorText)
      return null
    }

    const user = await response.json()
    console.log('getAuthUser - User authenticated:', user.id)
    return user
  } catch (error) {
    console.error('getAuthUser - Exception:', error)
    return null
  }
}

// Log activity to activity_log table
export async function logActivity(params: {
  ownerId: string
  cadenceId?: string
  cadenceStepId?: string
  leadId?: string
  action: string
  status: 'ok' | 'failed'
  details?: Record<string, unknown>
}) {
  const supabase = createSupabaseClient()

  await supabase.from('activity_log').insert({
    owner_id: params.ownerId,
    cadence_id: params.cadenceId || null,
    cadence_step_id: params.cadenceStepId || null,
    lead_id: params.leadId || null,
    action: params.action,
    status: params.status,
    details: params.details || null,
  })
}

// Update schedule status
export async function updateScheduleStatus(
  scheduleId: string,
  status: 'executed' | 'failed' | 'skipped_due_to_state_change',
  error?: string
) {
  const supabase = createSupabaseClient()

  await supabase
    .from('schedules')
    .update({
      status,
      last_error: error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scheduleId)
}

// Update lead step instance
export async function updateLeadStepInstance(
  instanceId: string,
  status: 'sent' | 'failed' | 'skipped',
  resultSnapshot?: Record<string, unknown>,
  error?: string
) {
  const supabase = createSupabaseClient()

  await supabase
    .from('lead_step_instances')
    .update({
      status,
      result_snapshot: resultSnapshot || null,
      last_error: error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instanceId)
}

// Update cadence lead status
export async function updateCadenceLeadStatus(
  leadId: string,
  cadenceId: string,
  status: 'active' | 'sent' | 'failed' | 'paused' | 'completed'
) {
  const supabase = createSupabaseClient()

  await supabase
    .from('cadence_leads')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .eq('cadence_id', cadenceId)
}

// Get Unipile account ID for a user
export async function getUnipileAccountId(userId: string): Promise<string | null> {
  const supabase = createSupabaseClient()

  // Check unipile_accounts table (authoritative source)
  const { data: unipileAccount } = await supabase
    .from('unipile_accounts')
    .select('account_id')
    .eq('user_id', userId)
    .eq('provider', 'LINKEDIN')
    .eq('status', 'active')
    .single()

  if (unipileAccount?.account_id) {
    return unipileAccount.account_id
  }

  // Fallback: check profiles table
  const { data: profile } = await supabase
    .from('profiles')
    .select('unipile_account_id')
    .eq('user_id', userId)
    .single()

  return profile?.unipile_account_id || null
}
