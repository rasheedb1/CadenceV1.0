// Temporary: backfill gmail_message_id for email_messages with null values
// Matches sent emails from Unipile listing by subject + recipient
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const unipileDsn = Deno.env.get('UNIPILE_DSN')
    const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')
    if (!unipileDsn || !unipileAccessToken) return errorResponse('Missing Unipile credentials', 500)
    const baseUrl = `https://${unipileDsn}`
    const supabase = createSupabaseClient()

    // Get Gmail account
    const { data: accs } = await supabase
      .from('unipile_accounts')
      .select('account_id')
      .eq('provider', 'EMAIL')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!accs?.account_id) return errorResponse('No Gmail account found')
    const accountId = accs.account_id

    // Get all sent emails where gmail_message_id is null OR looks like a Unipile id (not a 16-char hex provider_id)
    // Gmail provider_id format: 16 hex chars like "19cb4f7e6e095a9f"
    // Unipile internal id format: base64url like "n_3LLSdEUqWX-InHajCaFA" (contains non-hex chars)
    const { data: allSentEmails } = await supabase
      .from('email_messages')
      .select('id, subject, to_email, gmail_message_id, created_at')
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(100)

    const hexProviderIdPattern = /^[0-9a-f]{16}$/
    const nullEmails = (allSentEmails || []).filter(e =>
      !e.gmail_message_id || !hexProviderIdPattern.test(e.gmail_message_id)
    )

    if (!nullEmails.length) return jsonResponse({ fixed: 0, message: 'All records already have correct provider_id format' })

    // Fetch Unipile sent emails (get a larger page to maximize matches)
    const listRes = await fetch(`${baseUrl}/api/v1/emails?account_id=${accountId}&limit=50`, {
      headers: { 'X-API-KEY': unipileAccessToken }
    })
    if (!listRes.ok) return errorResponse(`Unipile listing failed: ${await listRes.text()}`)

    const listData = await listRes.json()
    const items: Array<Record<string, unknown>> = listData?.items || listData?.data || []
    const sentItems = items.filter(e => e.role === 'sent' || (e.folders as string[] || []).includes('SENT'))

    const normalizeSubject = (s: string) => s.replace(/^re:\s*/i, '').trim().toLowerCase()

    const results: { id: string; subject: string; to: string; unipile_id: string | null; fixed: boolean }[] = []

    for (const email of nullEmails) {
      const match = sentItems.find(e => {
        const toIds = (e.to_attendees as Array<{identifier: string}> || []).map(a => a.identifier?.toLowerCase())
        const subjectMatch = normalizeSubject(e.subject as string || '') === normalizeSubject(email.subject || '')
        const recipientMatch = toIds.some(id => id === email.to_email?.toLowerCase())
        return subjectMatch && recipientMatch
      })

      if (match) {
        // Use provider_id (Gmail native hex ID) — this is what Unipile reply_to expects
        const idToStore = (match.provider_id || match.id) as string
        await supabase
          .from('email_messages')
          .update({ gmail_message_id: idToStore })
          .eq('id', email.id)
        results.push({ id: email.id, subject: email.subject, to: email.to_email, unipile_id: idToStore, fixed: true })
      } else {
        results.push({ id: email.id, subject: email.subject, to: email.to_email, unipile_id: null, fixed: false })
      }
    }

    const fixed = results.filter(r => r.fixed).length
    return jsonResponse({ fixed, total: nullEmails.length, results, sentItemsChecked: sentItems.length })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Error', 500)
  }
})
