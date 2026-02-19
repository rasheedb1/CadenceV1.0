// Salesforce API helpers for Edge Functions
import { createSupabaseClient } from './supabase.ts'

const SF_LOGIN_URL = 'https://login.salesforce.com'
const SF_API_VERSION = 'v62.0'

interface SalesforceConnection {
  id: string
  org_id: string
  access_token: string
  refresh_token: string
  instance_url: string
  sf_user_id: string
  sf_org_id: string | null
  sf_username: string | null
  token_issued_at: string | null
  is_active: boolean
}

// Get the active Salesforce connection for an org
export async function getSalesforceConnection(orgId: string): Promise<SalesforceConnection | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from('salesforce_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .single()

  if (error || !data) return null
  return data as SalesforceConnection
}

// Refresh the Salesforce access token
export async function refreshSalesforceToken(connection: SalesforceConnection): Promise<{ access_token: string; instance_url: string }> {
  const clientId = Deno.env.get('SALESFORCE_CLIENT_ID')
  const clientSecret = Deno.env.get('SALESFORCE_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('Missing SALESFORCE_CLIENT_ID or SALESFORCE_CLIENT_SECRET')
  }

  const response = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Salesforce token refresh failed:', errorText)
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return {
    access_token: data.access_token,
    instance_url: data.instance_url,
  }
}

// Make an authenticated API call to Salesforce with auto-refresh on 401
export async function salesforceApiCall(
  orgId: string,
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const connection = await getSalesforceConnection(orgId)
  if (!connection) throw new Error('No active Salesforce connection found')

  const makeRequest = async (token: string, instanceUrl: string) => {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${instanceUrl}/services/data/${SF_API_VERSION}${endpoint}`

    return fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  // First attempt
  let response = await makeRequest(connection.access_token, connection.instance_url)

  // If 401, refresh and retry
  if (response.status === 401) {
    console.log('Salesforce token expired, refreshing...')
    try {
      const newTokens = await refreshSalesforceToken(connection)

      // Update tokens in DB
      const supabase = createSupabaseClient()
      await supabase
        .from('salesforce_connections')
        .update({
          access_token: newTokens.access_token,
          instance_url: newTokens.instance_url,
          token_issued_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      // Retry with new token
      response = await makeRequest(newTokens.access_token, newTokens.instance_url)
    } catch (refreshError) {
      // Mark connection as inactive if refresh fails (token revoked)
      const supabase = createSupabaseClient()
      await supabase
        .from('salesforce_connections')
        .update({
          is_active: false,
          last_error: 'Token refresh failed - please reconnect',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      throw refreshError
    }
  }

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Salesforce API error ${response.status}: ${errorBody}`)
  }

  return response.json()
}

// Execute a SOQL query with automatic pagination
export async function salesforceQuery(orgId: string, soql: string): Promise<Record<string, unknown>[]> {
  const encodedQuery = encodeURIComponent(soql)
  let result = await salesforceApiCall(orgId, `/query/?q=${encodedQuery}`) as {
    done: boolean
    totalSize: number
    records: Record<string, unknown>[]
    nextRecordsUrl?: string
  }

  const allRecords = [...result.records]

  // Handle pagination
  while (!result.done && result.nextRecordsUrl) {
    const connection = await getSalesforceConnection(orgId)
    if (!connection) break

    result = await salesforceApiCall(orgId, result.nextRecordsUrl) as typeof result
    allRecords.push(...result.records)
  }

  return allRecords
}

// Extract domain from a website URL
export function extractDomain(website: string | null): string | null {
  if (!website) return null
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

// Get Salesforce OAuth config from env
export function getSalesforceOAuthConfig() {
  const clientId = Deno.env.get('SALESFORCE_CLIENT_ID')
  const clientSecret = Deno.env.get('SALESFORCE_CLIENT_SECRET')
  const redirectUri = Deno.env.get('SALESFORCE_REDIRECT_URI')

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Salesforce OAuth configuration (SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_REDIRECT_URI)')
  }

  return { clientId, clientSecret, redirectUri }
}
