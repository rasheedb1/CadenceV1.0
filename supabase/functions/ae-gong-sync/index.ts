import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { createLLMClient } from '../_shared/llm.ts'

interface GongCall {
  id: string
  title: string
  started: string          // ISO datetime
  duration: number         // seconds
  primaryUserId?: string
  parties?: Array<{ name: string; emailAddress?: string; affiliation: string }>
}

interface GongTranscriptEntry {
  speakerId: string
  sentences: Array<{ start: number; end: number; text: string }>
}

function makeGongAuth(accessKey: string, secretKey: string): string {
  const encoded = btoa(`${accessKey}:${secretKey}`)
  return `Basic ${encoded}`
}

async function fetchGongCalls(auth: string, fromDate: string): Promise<GongCall[]> {
  const resp = await fetch('https://api.gong.io/v2/calls', {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { fromDateTime: fromDate },
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gong /v2/calls failed (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return (data.calls || []) as GongCall[]
}

async function fetchGongTranscript(auth: string, callId: string): Promise<string> {
  try {
    const resp = await fetch(`https://api.gong.io/v2/calls/${callId}/transcript`, {
      headers: { 'Authorization': auth },
    })
    if (!resp.ok) return ''
    const data = await resp.json()
    // Flatten all sentences to text
    const entries: GongTranscriptEntry[] = data.callTranscripts?.[0]?.transcript || []
    return entries
      .flatMap(e => e.sentences.map(s => s.text))
      .join(' ')
      .trim()
  } catch {
    return ''
  }
}

async function extractActionItems(llm: ReturnType<typeof createLLMClient>, transcript: string, callTitle: string): Promise<Array<{ text: string; assignee?: string; due_date?: string }>> {
  if (!transcript || transcript.length < 100) return []

  const truncated = transcript.length > 8000 ? transcript.substring(0, 8000) + '...' : transcript

  const result = await llm.createMessage({
    system: 'You extract action items from sales call transcripts. Return ONLY a JSON array. Each item: {"text": "action description", "assignee": "person name or null", "due_date": "YYYY-MM-DD or null"}. Maximum 10 items. If no action items, return [].',
    messages: [{
      role: 'user',
      content: `Call: ${callTitle}\n\nTranscript:\n${truncated}`,
    }],
    maxTokens: 800,
    temperature: 0.2,
  })

  if (!result.success || !result.text) return []

  try {
    let cleaned = result.text.trim()
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const items = JSON.parse(cleaned)
    if (!Array.isArray(items)) return []
    return items.filter(i => typeof i.text === 'string' && i.text.trim())
  } catch {
    return []
  }
}

async function extractSummary(llm: ReturnType<typeof createLLMClient>, transcript: string, callTitle: string): Promise<string> {
  if (!transcript || transcript.length < 100) return ''

  const truncated = transcript.length > 6000 ? transcript.substring(0, 6000) + '...' : transcript

  const result = await llm.createMessage({
    system: 'Summarize this sales call in 2-3 sentences. Focus on: what was discussed, decisions made, and next steps. Be concise.',
    messages: [{
      role: 'user',
      content: `Call: ${callTitle}\n\nTranscript:\n${truncated}`,
    }],
    maxTokens: 300,
    temperature: 0.3,
  })

  return result.success ? result.text.trim() : ''
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('Missing authorization', 401)

  let authCtx: { userId: string; orgId: string } | null
  try {
    authCtx = await getAuthContext(authHeader)
  } catch {
    return errorResponse('Authentication failed', 401)
  }
  if (!authCtx) return errorResponse('Unauthorized', 401)

  let body: { ae_account_id?: string | null } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  const supabase = createSupabaseClient()

  // Load Gong credentials from ae_integrations
  const { data: integration, error: intErr } = await supabase
    .from('ae_integrations')
    .select('access_token, refresh_token')
    .eq('user_id', authCtx.userId)
    .eq('org_id', authCtx.orgId)
    .eq('provider', 'gong')
    .single()

  if (intErr || !integration?.access_token || !integration?.refresh_token) {
    return errorResponse('Gong not connected. Save your Gong credentials in Settings \u2192 Account Executive.', 400)
  }

  const gongAuth = makeGongAuth(integration.access_token, integration.refresh_token)

  // Fetch calls from last 30 days
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  let calls: GongCall[]
  try {
    calls = await fetchGongCalls(gongAuth, fromDate)
  } catch (e) {
    return errorResponse(`Gong API error: ${e instanceof Error ? e.message : 'Unknown'}`, 502)
  }

  console.log(`[ae-gong-sync] Found ${calls.length} calls`)

  // Init LLM for AI extraction
  const llm = createLLMClient('anthropic', 'claude-haiku-4-5-20251001')

  let synced = 0
  let remindersCreated = 0

  for (const call of calls.slice(0, 20)) { // max 20 calls per sync to stay within time budget
    try {
      // Fetch transcript
      const transcript = await fetchGongTranscript(gongAuth, call.id)

      // AI: extract in parallel
      const [summary, actionItems] = await Promise.all([
        extractSummary(llm, transcript, call.title || 'Sales Call'),
        extractActionItems(llm, transcript, call.title || 'Sales Call'),
      ])

      // Build participants from parties
      const participants = (call.parties || []).map(p => ({
        name: p.name,
        email: p.emailAddress,
      }))

      // Upsert activity (skip if already synced -- UNIQUE on org_id+source+external_id)
      const { data: activity, error: actErr } = await supabase
        .from('ae_activities')
        .upsert({
          org_id: authCtx.orgId,
          user_id: authCtx.userId,
          ae_account_id: body.ae_account_id || null,
          type: 'call',
          source: 'gong',
          external_id: call.id,
          title: call.title || 'Gong Call',
          summary,
          action_items: actionItems,
          occurred_at: call.started,
          duration_seconds: call.duration || null,
          participants,
        }, { onConflict: 'org_id,source,external_id', ignoreDuplicates: false })
        .select('id')
        .single()

      if (actErr) {
        console.warn(`[ae-gong-sync] Failed to upsert call ${call.id}:`, actErr.message)
        continue
      }

      synced++

      // Create reminders for action items with due dates
      const itemsWithDates = actionItems.filter(i => i.due_date)
      for (const item of itemsWithDates) {
        const { error: remErr } = await supabase
          .from('ae_reminders')
          .insert({
            org_id: authCtx.orgId,
            user_id: authCtx.userId,
            ae_account_id: body.ae_account_id || null,
            activity_id: activity?.id || null,
            title: item.text,
            due_at: new Date(item.due_date!).toISOString(),
            source: 'gong',
          })
        if (!remErr) remindersCreated++
      }

      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 400))

    } catch (e) {
      console.warn(`[ae-gong-sync] Error processing call ${call.id}:`, e)
    }
  }

  console.log(`[ae-gong-sync] Done: synced=${synced}, reminders=${remindersCreated}`)
  return jsonResponse({ success: true, synced, reminders_created: remindersCreated })
})
