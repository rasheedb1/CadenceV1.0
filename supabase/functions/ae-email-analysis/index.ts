import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { createLLMClient } from '../_shared/llm.ts'

interface UnipileMessage {
  id: string
  account_id: string
  subject?: string
  body?: string
  snippet?: string
  from?: { name?: string; identifier?: string }
  to?: Array<{ name?: string; identifier?: string }>
  date: string
  is_read?: boolean
}

interface ActionItem {
  title: string
  description: string
  due_at: string
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

  let body: { ae_account_id: string; domain: string }
  try {
    body = await req.json()
    if (!body.ae_account_id || !body.domain) {
      return errorResponse('ae_account_id and domain are required', 400)
    }
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const supabase = createSupabaseClient()
  const UNIPILE_DSN = Deno.env.get('UNIPILE_DSN')
  const UNIPILE_TOKEN = Deno.env.get('UNIPILE_ACCESS_TOKEN')

  if (!UNIPILE_DSN || !UNIPILE_TOKEN) {
    return errorResponse('Unipile not configured', 500)
  }

  // Get the user's Unipile account (email account, not LinkedIn)
  const accountsResp = await fetch(`https://${UNIPILE_DSN}/api/v1/accounts`, {
    headers: {
      'X-API-KEY': UNIPILE_TOKEN,
      'Accept': 'application/json',
    },
  })

  if (!accountsResp.ok) {
    return errorResponse('Could not fetch Unipile accounts', 502)
  }

  const accountsData = await accountsResp.json()
  const accounts = accountsData.items || accountsData.accounts || []

  // Find email account (type GOOGLE or OUTLOOK, not LINKEDIN)
  const emailAccount = accounts.find((a: { type?: string; account_type?: string }) => {
    const t = (a.type || a.account_type || '').toUpperCase()
    return t === 'GOOGLE' || t === 'GMAIL' || t === 'OUTLOOK' || t === 'MICROSOFT'
  })

  if (!emailAccount) {
    return errorResponse(
      'No email account (Gmail/Outlook) connected in Unipile. Connect Gmail in Settings first.',
      400
    )
  }

  const accountId = emailAccount.id

  // Fetch recent messages from this email account
  const domain = body.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  const messagesResp = await fetch(
    `https://${UNIPILE_DSN}/api/v1/messages?account_id=${accountId}&limit=50`,
    {
      headers: {
        'X-API-KEY': UNIPILE_TOKEN,
        'Accept': 'application/json',
      },
    }
  )

  let messages: UnipileMessage[] = []
  if (messagesResp.ok) {
    const messagesData = await messagesResp.json()
    messages = messagesData.items || messagesData.messages || []
  }

  // Filter messages related to the domain (sent to/from domain)
  const domainMessages = messages.filter(m => {
    const fromEmail = m.from?.identifier || ''
    const toEmails = (m.to || []).map(t => t.identifier || '')
    return fromEmail.includes(domain) || toEmails.some(e => e.includes(domain))
  })

  console.log(`[ae-email-analysis] Found ${domainMessages.length} messages for domain ${domain}`)

  if (domainMessages.length === 0) {
    return jsonResponse({
      success: true,
      reminders_created: 0,
      message: `No emails found for domain ${domain}`,
    })
  }

  // Build email summary for LLM
  const emailSummary = domainMessages.slice(0, 10).map(m => {
    const date = new Date(m.date).toLocaleDateString()
    const from = m.from?.name || m.from?.identifier || 'Unknown'
    const subject = m.subject || '(no subject)'
    const snippet = (m.snippet || m.body || '').substring(0, 300)
    return `Date: ${date}\nFrom: ${from}\nSubject: ${subject}\nPreview: ${snippet}`
  }).join('\n\n---\n\n')

  // LLM analysis: detect follow-ups needed
  const llm = createLLMClient('anthropic', 'claude-haiku-4-5-20251001')

  const result = await llm.createMessage({
    system: `You analyze sales email threads to identify follow-up actions needed.
Return ONLY a JSON array of action items. Each item: {"title": "short action", "description": "context", "due_at": "YYYY-MM-DD"}.
Focus on: unanswered questions, pending deliverables, committed next steps, emails sent >3 days ago without reply.
Maximum 5 items. If no follow-ups needed, return [].`,
    messages: [
      {
        role: 'user',
        content: `Account domain: ${domain}\n\nRecent emails:\n\n${emailSummary}`,
      },
    ],
    maxTokens: 600,
    temperature: 0.2,
  })

  let actionItems: ActionItem[] = []
  if (result.success && result.text) {
    try {
      let cleaned = result.text.trim()
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        actionItems = parsed.filter(
          (i: { title?: unknown; due_at?: unknown }) =>
            typeof i.title === 'string' && typeof i.due_at === 'string'
        )
      }
    } catch {
      console.warn('[ae-email-analysis] Failed to parse LLM response')
    }
  }

  // Create reminders
  let remindersCreated = 0
  for (const item of actionItems) {
    let dueAt: string
    try {
      dueAt = new Date(item.due_at).toISOString()
    } catch {
      // Default to 2 days from now if date parse fails
      dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }

    const { error } = await supabase.from('ae_reminders').insert({
      org_id: authCtx.orgId,
      user_id: authCtx.userId,
      ae_account_id: body.ae_account_id,
      title: item.title,
      description: item.description,
      due_at: dueAt,
      source: 'gmail',
    })

    if (!error) remindersCreated++
  }

  console.log(`[ae-email-analysis] Created ${remindersCreated} reminders for ${domain}`)
  return jsonResponse({ success: true, reminders_created: remindersCreated })
})
