// Edge Function: Paula SF Pipeline — deterministic per-opp summarizer.
//
// Implements Plan v4.2 §7.6 architecture: deterministic Deno fn that
// orchestrates the fetch → summarize → audit → digest flow without LLM
// agency. Haiku is called ONCE per opp for summarization only.
//
// Inputs:
//   { org_id?: string, opportunity_ids?: string[], dry_run?: bool }
//   - org_id defaults to Rasheed's org
//   - opportunity_ids defaults to all open Coppel opps for Rasheed
//   - dry_run defaults to true (no SF writes)
//
// Outputs structured JSON of what would be written. Audit rows persisted.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse, handleCors } from '../_shared/cors.ts'

// ──────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────
const RASHEED_ORG = '553315b5-42d0-4518-a461-e4cb12914c54'
const RASHEED_USER = '76403628-d906-45e1-b673-c4231264da5c'
const RASHEED_SF_USER = '005Hu00000QlMRGIA3'
const BRIDGE_URL = Deno.env.get('BRIDGE_URL') || 'https://bridge.yuno.tools'
const SF_LOGIN = 'https://login.salesforce.com'
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GONG_BASE = 'https://us-11211.api.gong.io/v2'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const FIELD_MAX = 200 // chars; SF length 255 with safety margin

// ──────────────────────────────────────────────────────────────────────────
// Salesforce
// ──────────────────────────────────────────────────────────────────────────
async function getSfToken(supabase: any): Promise<{ token: string; instanceUrl: string }> {
  const { data: conn } = await supabase
    .from('salesforce_connections')
    .select('access_token, refresh_token, instance_url')
    .eq('org_id', RASHEED_ORG)
    .single()
  if (!conn) throw new Error('SF connection missing')

  // Try optimistic
  try {
    const t = await fetch(`${conn.instance_url}/services/data/v59.0/limits`, {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    })
    // Even if /limits is API_DISABLED_FOR_ORG, a non-401 means token is valid
    if (t.status !== 401) return { token: conn.access_token, instanceUrl: conn.instance_url }
  } catch {}

  // Refresh
  const clientId = Deno.env.get('SALESFORCE_CLIENT_ID')!
  const clientSecret = Deno.env.get('SALESFORCE_CLIENT_SECRET')!
  const r = await fetch(`${SF_LOGIN}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
    }),
  })
  const d = await r.json()
  if (!r.ok || !d.access_token) throw new Error(`SF refresh: ${JSON.stringify(d).substring(0, 200)}`)
  await supabase
    .from('salesforce_connections')
    .update({ access_token: d.access_token, instance_url: d.instance_url || conn.instance_url, is_active: true })
    .eq('org_id', RASHEED_ORG)
  return { token: d.access_token, instanceUrl: d.instance_url || conn.instance_url }
}

async function sfQuery(soql: string, sfToken: string, instanceUrl: string): Promise<any[]> {
  const url = `${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${sfToken}` } })
  const d = await r.json()
  if (!r.ok) throw new Error(`SOQL: ${d?.[0]?.message || JSON.stringify(d).substring(0, 200)}`)
  return d.records || []
}

// ──────────────────────────────────────────────────────────────────────────
// Gmail
// ──────────────────────────────────────────────────────────────────────────
async function getGmailToken(supabase: any): Promise<string | null> {
  const { data: row } = await supabase
    .from('ae_integrations')
    .select('access_token, refresh_token, token_expires_at, config')
    .eq('user_id', RASHEED_USER)
    .eq('org_id', RASHEED_ORG)
    .eq('provider', 'gmail')
    .single()
  if (!row) return null

  let accessToken = row.access_token || row.config?.access_token
  const refreshToken = row.refresh_token || row.config?.refresh_token
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0

  if (!accessToken && !refreshToken) return null
  if (expiresAt && Date.now() < expiresAt - 60_000) return accessToken

  // Refresh
  if (!refreshToken) return null
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  const d = await r.json()
  if (!r.ok || !d.access_token) return null
  const newExpiresAt = new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString()
  await supabase
    .from('ae_integrations')
    .update({
      access_token: d.access_token,
      token_expires_at: newExpiresAt,
      config: { ...(row.config || {}), access_token: d.access_token, expires_at: newExpiresAt },
    })
    .eq('user_id', RASHEED_USER)
    .eq('org_id', RASHEED_ORG)
    .eq('provider', 'gmail')
  return d.access_token
}

function decodeBase64Url(s: string): string {
  // Deno: TextDecoder + atob with url-safe → standard
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')
  try {
    const bin = atob(padded)
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
  } catch { return '' }
}

function extractGmailBody(part: any): string {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data)
  if (part.mimeType === 'text/html' && part.body?.data) {
    const html = decodeBase64Url(part.body.data)
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  if (Array.isArray(part.parts)) {
    const plain = part.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain) return extractGmailBody(plain)
    const html = part.parts.find((p: any) => p.mimeType === 'text/html')
    if (html) return extractGmailBody(html)
    for (const sub of part.parts) {
      const b = extractGmailBody(sub)
      if (b) return b
    }
  }
  return ''
}

async function gmailSearch(query: string, gmailToken: string, max = 5): Promise<Array<{ id: string; date: string; from: string; subject: string; snippet: string }>> {
  const listRes = await fetch(`${GMAIL_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${max}`, {
    headers: { Authorization: `Bearer ${gmailToken}` },
  })
  if (!listRes.ok) return []
  const list = await listRes.json()
  const ids = (list.messages || []).map((m: any) => m.id)
  const results: any[] = []
  for (const id of ids) {
    const r = await fetch(`${GMAIL_BASE}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${gmailToken}` },
    })
    if (!r.ok) continue
    const msg = await r.json()
    const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>
    const h = (n: string) => headers.find(x => x.name.toLowerCase() === n.toLowerCase())?.value || ''
    results.push({
      id: msg.id,
      date: h('Date'),
      from: h('From'),
      subject: h('Subject') || '(no subject)',
      snippet: (msg.snippet || extractGmailBody(msg.payload).substring(0, 500)).substring(0, 500),
    })
  }
  return results
}

// ──────────────────────────────────────────────────────────────────────────
// Gong
// ──────────────────────────────────────────────────────────────────────────
async function getGongAuth(supabase: any): Promise<string | null> {
  const { data: row } = await supabase
    .from('agent_integrations')
    .select('access_token, refresh_token')
    .eq('org_id', RASHEED_ORG)
    .eq('provider', 'gong')
    .maybeSingle()
  if (!row?.access_token) return null
  // Gong API uses Basic auth with key=access_token, secret=refresh_token
  const basic = btoa(`${row.access_token}:${row.refresh_token || ''}`)
  return `Basic ${basic}`
}

// Fetch ALL calls in the date window with pagination (Gong returns 100 per page).
// Cached once per run; all opps filter from the same in-memory list.
interface GongCallMeta {
  id: string
  title: string
  date: string
  participants: string[]
  participantEmails: string[]
}
async function gongFetchAllCalls(auth: string, daysBack = 30): Promise<GongCallMeta[]> {
  const from = new Date(Date.now() - daysBack * 86400000).toISOString()
  const to = new Date().toISOString()
  const all: GongCallMeta[] = []
  let cursor: string | null = null
  for (let page = 0; page < 10; page++) {
    const body: any = {
      filter: { fromDateTime: from, toDateTime: to },
      contentSelector: { exposedFields: { parties: true } },
    }
    if (cursor) body.cursor = cursor
    const r = await fetch(`${GONG_BASE}/calls/extensive`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) break
    const d = await r.json()
    const calls = d.calls || []
    for (const c of calls) {
      all.push({
        id: c.metaData?.id || '',
        title: c.metaData?.title || '',
        date: c.metaData?.started || '',
        participants: (c.parties || []).map((p: any) => p.name).filter(Boolean),
        participantEmails: (c.parties || []).map((p: any) => p.emailAddress).filter(Boolean),
      })
    }
    cursor = d.records?.cursor
    if (!cursor || calls.length === 0) break
  }
  return all
}

function gongFilterForOpp(allCalls: GongCallMeta[], accountName: string, domain: string | null, max = 3): GongCallMeta[] {
  const accountLower = accountName.toLowerCase().replace(/[\s\-]+$/, '') // strip trailing dashes/spaces
  // Title match: account name appears in title (e.g. "BanCoppel + Yuno" matches "Coppel" or "Bancoppel")
  // Participant match: any participant email ends in @<domain>
  const matches = allCalls.filter(c => {
    const titleLower = (c.title || '').toLowerCase()
    if (titleLower.includes(accountLower)) return true
    // Try first word of multi-word account names (e.g. "Decameron Latam" → match "Decameron")
    const firstWord = accountLower.split(/\s+/)[0]
    if (firstWord.length >= 5 && titleLower.includes(firstWord)) return true
    if (domain) {
      const domainLower = domain.toLowerCase()
      if (c.participantEmails.some(e => e.toLowerCase().endsWith(`@${domainLower}`))) return true
    }
    return false
  })
  // Sort by date desc, take top N
  matches.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return matches.slice(0, max)
}

async function gongTranscript(callId: string, auth: string): Promise<string> {
  const r = await fetch(`${GONG_BASE}/calls/transcript`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { callIds: [callId] } }),
  })
  if (!r.ok) return ''
  const d = await r.json()
  const monologues = d.callTranscripts?.[0]?.transcript || []
  const text = monologues.map((m: any) => {
    const speaker = m.speakerId || 'Speaker'
    const sentences = (m.sentences || []).map((s: any) => s.text).join(' ')
    return `${speaker}: ${sentences}`
  }).join('\n')
  return text.substring(0, 2500)
}

// ──────────────────────────────────────────────────────────────────────────
// Anthropic Haiku — single summarization call per opp
// ──────────────────────────────────────────────────────────────────────────
interface HaikuOutput {
  next_step: { text: string; sources: Array<{ type: string; id: string; date: string }> } | null
  deal_comments: { text: string; sources: Array<{ type: string; id: string; date: string }> } | null
  blocker: { text: string; sources: Array<{ type: string; id: string; date: string }> } | null
}

async function callHaiku(bundle: any): Promise<HaikuOutput> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!
  const systemPrompt = `You are a sales-ops summarizer. Read the bundle and output STRICT JSON only — no markdown, no prose around it.

OUTPUT SCHEMA (return EXACTLY this shape, populated):
{
  "next_step":     {"text": "...", "sources": [{"type":"email|call","id":"<id>","date":"YYYY-MM-DD"}]} | null,
  "deal_comments": {"text": "...", "sources": [...]} | null,
  "blocker":       {"text": "...", "sources": [...]} | null
}

RULES (absolute):
- Each "text" field MUST be ≤${FIELD_MAX} characters.
- Write in ENGLISH (translate Spanish/Portuguese signals).
- Every claim must reference a source from input.emails[].id ∪ input.calls[].id.
- If insufficient evidence for a slot, output null for that slot.
- Be factual: use "agreed", "committed" only if explicit in source.
- Output the JSON object ONLY. No markdown fences. No explanation.`

  const userMsg = JSON.stringify(bundle)

  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 800,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(`Haiku: ${JSON.stringify(d).substring(0, 200)}`)

  const text = d.content?.[0]?.text || '{}'
  // Strip markdown fences if present
  const cleaned = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  return JSON.parse(cleaned) as HaikuOutput
}

// ──────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────
function validateOutput(out: HaikuOutput, bundle: any): HaikuOutput {
  const validIds = new Set([
    ...(bundle.emails || []).map((e: any) => e.id),
    ...(bundle.calls || []).map((c: any) => c.id),
  ])

  const validateField = (field: any) => {
    if (!field) return null
    if (typeof field.text !== 'string') return null
    if (field.text.length === 0) return null
    // Truncate at sentence boundary if over
    if (field.text.length > FIELD_MAX) {
      const lastDot = field.text.lastIndexOf('. ', FIELD_MAX - 1)
      field.text = lastDot > 50 ? field.text.substring(0, lastDot + 1) : field.text.substring(0, FIELD_MAX - 3) + '...'
    }
    // Strip sources whose id is not in bundle
    field.sources = (field.sources || []).filter((s: any) => validIds.has(s.id))
    if (field.sources.length === 0) return null // require at least 1 valid citation
    return field
  }

  return {
    next_step: validateField(out.next_step),
    deal_comments: validateField(out.deal_comments),
    blocker: validateField(out.blocker),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createSupabaseClient()
    const body = await req.json().catch(() => ({}))
    const orgId = body?.org_id || RASHEED_ORG
    const opportunityIds: string[] | null = body?.opportunity_ids || null
    const dryRun = body?.dry_run !== false // default true

    // 1. Field map
    const { data: fieldMap } = await supabase
      .from('paula_sf_field_map')
      .select('*')
      .eq('org_id', orgId)
      .single()
    if (!fieldMap || !fieldMap.confirmed_at) {
      return errorResponse('Field map missing or unconfirmed', 400)
    }

    // 2. SF token + opps
    // SAFETY: OwnerId filter is ALWAYS applied. If caller passes opportunity_ids
    // that don't belong to Rasheed, the SOQL returns 0 rows and nothing is
    // touched. This is non-negotiable per user directive 2026-05-09:
    // "no busques oportunidades de cualquier persona sino las mias".
    const sf = await getSfToken(supabase)
    let oppFilter = `WHERE OwnerId = '${RASHEED_SF_USER}' AND IsClosed = false`
    if (opportunityIds && opportunityIds.length > 0) {
      const idList = opportunityIds.map(id => `'${id}'`).join(',')
      oppFilter = `WHERE Id IN (${idList}) AND OwnerId = '${RASHEED_SF_USER}'`
    }
    const oppSoql = `
      SELECT Id, Name, StageName, AccountId, Account.Name, Account.Website,
             NextStep, ${fieldMap.deal_comments_api}, ${fieldMap.blocker_api},
             CloseDate, Amount, LastModifiedDate, OwnerId
      FROM Opportunity ${oppFilter}
      ORDER BY CloseDate
      LIMIT 10
    `
    const opps = await sfQuery(oppSoql, sf.token, sf.instanceUrl)

    // SAFETY check: report any explicit IDs that didn't come back (likely owned
    // by someone else or closed). Caller sees exactly what was filtered out.
    const skippedIds: Array<{ id: string; reason: string }> = []
    if (opportunityIds && opportunityIds.length > 0) {
      const returnedIds = new Set(opps.map((o: any) => o.Id))
      for (const id of opportunityIds) {
        if (!returnedIds.has(id)) {
          skippedIds.push({ id, reason: 'not_owned_by_rasheed_or_closed' })
        }
      }
    }

    // 3. Auth for Gmail + Gong (best effort)
    const gmailToken = await getGmailToken(supabase).catch(() => null)
    const gongAuth = await getGongAuth(supabase).catch(() => null)

    // Fetch ALL Gong calls once, filter per-opp from cache
    const allGongCalls: GongCallMeta[] = gongAuth
      ? await gongFetchAllCalls(gongAuth, 30).catch(() => [])
      : []

    // 4. Process each opp
    const results: any[] = []
    for (const opp of opps) {
      const accountName = opp.Account?.Name || ''
      const website = opp.Account?.Website || ''
      const domain = website
        ? website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
        : null

      // Email signals
      let emails: any[] = []
      if (gmailToken && (domain || accountName)) {
        const q = domain
          ? `from:@${domain} OR to:@${domain} OR subject:"${accountName}"`
          : `subject:"${accountName}"`
        emails = await gmailSearch(q, gmailToken, 5).catch(() => [])
      }

      // Gong signals: filter from cached all-calls list
      let calls: any[] = []
      if (gongAuth && accountName && allGongCalls.length > 0) {
        const matched = gongFilterForOpp(allGongCalls, accountName, domain, 2)
        for (const m of matched) {
          const transcript = await gongTranscript(m.id, gongAuth).catch(() => '')
          calls.push({ ...m, transcript_summary: transcript })
        }
      }

      const currentValues = {
        next_step: opp.NextStep || '',
        deal_comments: opp[fieldMap.deal_comments_api] || '',
        blocker: opp[fieldMap.blocker_api] || '',
      }

      const bundle = {
        opp_id: opp.Id,
        account_name: accountName,
        domain,
        current: currentValues,
        emails: emails.slice(0, 5),
        calls: calls.slice(0, 2),
      }

      // Skip Haiku call if no signals at all
      if (emails.length === 0 && calls.length === 0) {
        await supabase.from('paula_sf_run_audit').insert({
          org_id: orgId,
          sf_opportunity_id: opp.Id,
          opportunity_name: opp.Name,
          scope: 'rasheed_canary',
          status: 'skipped_no_signals',
          prev_values: currentValues,
          signals_summary: { emails: 0, calls: 0, dry_run: dryRun },
          reason: 'no_signals_found',
        })
        results.push({ opp_id: opp.Id, name: opp.Name, status: 'skipped_no_signals' })
        continue
      }

      // Haiku summarization
      let haikuOut: HaikuOutput
      let haikuErr: string | null = null
      try {
        const raw = await callHaiku(bundle)
        haikuOut = validateOutput(raw, bundle)
      } catch (e: any) {
        haikuErr = e.message
        haikuOut = { next_step: null, deal_comments: null, blocker: null }
      }

      const newValues = {
        next_step: haikuOut.next_step?.text || null,
        deal_comments: haikuOut.deal_comments?.text || null,
        blocker: haikuOut.blocker?.text || null,
      }

      // Live write to SF (only if not dry_run AND we have at least one new value)
      let writeError: string | null = null
      let fieldsWritten: string[] = []
      const hasAnyNew = newValues.next_step || newValues.deal_comments || newValues.blocker
      if (!dryRun && !haikuErr && hasAnyNew) {
        const sfFields: Record<string, string> = {}
        if (newValues.next_step) { sfFields[fieldMap.next_step_api] = newValues.next_step; fieldsWritten.push('next_step') }
        if (newValues.deal_comments) { sfFields[fieldMap.deal_comments_api] = newValues.deal_comments; fieldsWritten.push('deal_comments') }
        if (newValues.blocker) { sfFields[fieldMap.blocker_api] = newValues.blocker; fieldsWritten.push('blocker') }
        try {
          const r = await fetch(`${sf.instanceUrl}/services/data/v59.0/sobjects/Opportunity/${opp.Id}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${sf.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sfFields),
          })
          if (!r.ok) {
            const errBody = await r.text()
            writeError = `SF PATCH ${r.status}: ${errBody.substring(0, 200)}`
          }
        } catch (e: any) {
          writeError = `SF write error: ${e.message}`
        }
      }

      // Audit row
      const auditStatus = haikuErr
        ? 'failed_summarize'
        : writeError
          ? 'failed_write'
          : hasAnyNew
            ? (dryRun ? 'noop' : 'updated')
            : 'skipped_no_signals'

      await supabase.from('paula_sf_run_audit').insert({
        org_id: orgId,
        sf_opportunity_id: opp.Id,
        opportunity_name: opp.Name,
        scope: 'rasheed_canary',
        status: auditStatus,
        fields_written: fieldsWritten,
        prev_values: currentValues,
        new_values: newValues,
        signals_summary: { emails: emails.length, calls: calls.length, dry_run: dryRun },
        reason: haikuErr || writeError || (dryRun ? 'dry_run_phase_1_2' : 'live_run'),
      })

      results.push({
        opp_id: opp.Id,
        name: opp.Name,
        stage: opp.StageName,
        status: auditStatus,
        signals: { emails: emails.length, calls: calls.length },
        fields_written: fieldsWritten,
        prev: currentValues,
        new: newValues,
        haiku_error: haikuErr,
        write_error: writeError,
      })
    }

    // 5. Send WhatsApp digest
    const summary = results.map(r =>
      `• ${r.name} → ${r.status} (${r.signals?.emails || 0}e, ${r.signals?.calls || 0}c)`
    ).join('\n')
    const digestText =
      `🔍 Paula — Coppel pipeline ${dryRun ? '(dry-run)' : 'live'}\n\n` +
      `${results.length} opps processed:\n${summary}\n\n` +
      `Audit: SELECT * FROM paula_sf_run_audit WHERE org_id='${orgId}' ORDER BY created_at DESC LIMIT ${results.length}`

    fetch(`${BRIDGE_URL}/api/agent-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: 'Paula',
        result: { text: digestText },
        whatsapp_number: null,
        severity: 'info',
      }),
    }).catch(() => {})

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      processed: results.length,
      skipped_not_owned: skippedIds,
      results,
    })
  } catch (error) {
    console.error('paula-coppel-pipeline error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
