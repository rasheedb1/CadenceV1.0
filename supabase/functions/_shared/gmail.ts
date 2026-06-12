// Gmail API helpers — token refresh + RFC 2822 + message send.
// Extracted from send-email so other edge functions (e.g. track-presentation-view)
// can dispatch mail using a user's Gmail OAuth token.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SupaClient = ReturnType<typeof createClient>

interface GmailTokenConfig {
  access_token: string
  refresh_token?: string | null
  expires_at: string
  email?: string | null
}

export interface GmailAuth {
  token: string
  email: string | null
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_at: string } | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await resp.json()
  if (!data.access_token) return null
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  }
}

// Look up Gmail integration by the connected email address (config.email).
// Use this when ownership is by email (e.g. presentations.created_by_email),
// independent of which Supabase auth user owns the integration.
export async function getGmailTokenByEmail(
  supabase: SupaClient,
  email: string,
): Promise<GmailAuth | null> {
  if (!email) return null
  const { data: integration } = await supabase
    .from('ae_integrations')
    .select('user_id, org_id')
    .eq('provider', 'gmail')
    .ilike('config->>email', email)
    .maybeSingle()
  if (!integration) return null
  return getValidGmailToken(supabase, integration.user_id as string, integration.org_id as string)
}

export async function getValidGmailToken(
  supabase: SupaClient,
  userId: string,
  orgId: string,
): Promise<GmailAuth | null> {
  const { data: integration } = await supabase
    .from('ae_integrations')
    .select('config')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('provider', 'gmail')
    .single()

  if (!integration) return null
  const cfg = integration.config as GmailTokenConfig
  if (!cfg?.access_token) return null

  const expiresAt = new Date(cfg.expires_at).getTime()
  let accessToken = cfg.access_token

  // Refresh if within 2 minutes of expiry
  if (Date.now() > expiresAt - 2 * 60 * 1000 && cfg.refresh_token) {
    const refreshed = await refreshAccessToken(cfg.refresh_token)
    if (refreshed) {
      accessToken = refreshed.access_token
      await supabase
        .from('ae_integrations')
        .update({
          config: { ...cfg, access_token: refreshed.access_token, expires_at: refreshed.expires_at },
          token_expires_at: refreshed.expires_at,
        })
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('provider', 'gmail')
    }
  }

  return { token: accessToken, email: cfg.email || null }
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// RFC 2822 headers must be ASCII. Non-ASCII subjects (emojis, accents) need
// RFC 2047 encoded-word syntax, otherwise Gmail's web UI renders them as mojibake.
function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return `=?UTF-8?B?${btoa(binary)}?=`
}

export interface BuildMessageOptions {
  to: string
  from: string
  subject: string
  html: string
  cc?: string | null
  replyToThreadId?: string | null
}

export function buildRfc2822(opts: BuildMessageOptions): string {
  const lines = [
    `To: ${opts.to}`,
    `From: ${opts.from}`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
  ]
  if (opts.cc) lines.push(`Cc: ${opts.cc}`)
  if (opts.replyToThreadId) {
    lines.push(`In-Reply-To: <${opts.replyToThreadId}>`)
    lines.push(`References: <${opts.replyToThreadId}>`)
  }
  lines.push('', opts.html)
  return lines.join('\r\n')
}

export interface SendGmailResult {
  ok: boolean
  status: number
  messageId?: string
  threadId?: string
  error?: string
}

export async function sendGmailMessage({
  token,
  rfc2822,
  threadId,
}: {
  token: string
  rfc2822: string
  threadId?: string | null
}): Promise<SendGmailResult> {
  const body: Record<string, unknown> = { raw: toBase64Url(rfc2822) }
  if (threadId) body.threadId = threadId

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return { ok: false, status: resp.status, error: errText }
  }
  const result = await resp.json()
  return {
    ok: true,
    status: resp.status,
    messageId: result?.id,
    threadId: result?.threadId,
  }
}
