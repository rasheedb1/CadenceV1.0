// Edge Function: Connect Gmail via Unipile Hosted Auth
// POST /functions/v1/connect-gmail
// Generates a Unipile hosted auth link for the user to connect their Gmail account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthUser } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface CreateHostedAuthLinkRequest {
  successRedirectUrl?: string
  failureRedirectUrl?: string
}

interface UnipileHostedAuthResponse {
  object: string
  url: string
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const user = await getAuthUser(authHeader)
    if (!user) {
      return errorResponse('Invalid or expired token', 401)
    }

    // Parse optional request body
    let body: CreateHostedAuthLinkRequest = {}
    try {
      body = await req.json()
    } catch {
      // Empty body is fine
    }

    // Get Unipile credentials from environment
    const unipileDsn = Deno.env.get('UNIPILE_DSN')
    const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')

    if (!unipileDsn || !unipileAccessToken) {
      console.error('Missing Unipile credentials')
      return errorResponse('Unipile integration not configured', 500)
    }

    const baseUrl = `https://${unipileDsn}`

    // Check if user already has an active Gmail/EMAIL connection
    const supabase = createSupabaseClient()
    const { data: existingAccount } = await supabase
      .from('unipile_accounts')
      .select('id, account_id, status')
      .eq('user_id', user.id)
      .eq('provider', 'EMAIL')
      .eq('status', 'active')
      .single()

    if (existingAccount) {
      return errorResponse('Gmail account already connected. Disconnect first to reconnect.', 400)
    }

    // Generate expiration time (24 hours from now)
    const expiresOn = new Date()
    expiresOn.setHours(expiresOn.getHours() + 24)

    // Get the Supabase project URL for the webhook
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const notifyUrl = supabaseUrl
      ? `${supabaseUrl}/functions/v1/gmail-webhook`
      : undefined

    // Create hosted auth link via Unipile API
    const hostedAuthPayload: Record<string, unknown> = {
      type: 'create',
      providers: ['GOOGLE'],
      api_url: baseUrl,
      expiresOn: expiresOn.toISOString(),
      name: user.id, // Store user ID to match on callback
    }

    // Add notify_url if available
    if (notifyUrl) {
      hostedAuthPayload.notify_url = notifyUrl
    }

    // Add success/failure redirect URLs if provided
    if (body.successRedirectUrl) {
      hostedAuthPayload.success_redirect_url = body.successRedirectUrl
    } else {
      // Default redirect with gmail_status query param
      hostedAuthPayload.success_redirect_url = supabaseUrl
        ? `${supabaseUrl.replace('.supabase.co', '.vercel.app')}?gmail_status=success`
        : undefined
    }
    if (body.failureRedirectUrl) {
      hostedAuthPayload.failure_redirect_url = body.failureRedirectUrl
    } else {
      hostedAuthPayload.failure_redirect_url = supabaseUrl
        ? `${supabaseUrl.replace('.supabase.co', '.vercel.app')}?gmail_status=failed`
        : undefined
    }

    console.log('Creating Unipile hosted auth link for Gmail for user:', user.id)
    console.log('Unipile payload:', JSON.stringify(hostedAuthPayload, null, 2))
    console.log('Notify URL configured:', notifyUrl)

    const response = await fetch(`${baseUrl}/api/v1/hosted/accounts/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': unipileAccessToken,
      },
      body: JSON.stringify(hostedAuthPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Unipile API error:', response.status, errorText)
      return errorResponse(`Failed to create auth link: ${response.statusText}`, response.status)
    }

    const data: UnipileHostedAuthResponse = await response.json()

    console.log('Unipile hosted auth link created for Gmail:', data.url)

    return jsonResponse({
      success: true,
      authUrl: data.url,
      expiresOn: expiresOn.toISOString(),
    })
  } catch (error) {
    console.error('Error creating Gmail auth link:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
