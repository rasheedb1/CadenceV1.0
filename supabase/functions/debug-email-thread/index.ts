// Temporary diagnostic: check Unipile email listing and reply_to field behavior
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const unipileDsn = Deno.env.get('UNIPILE_DSN')
    const unipileAccessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')
    if (!unipileDsn || !unipileAccessToken) {
      return errorResponse('Missing Unipile credentials', 500)
    }
    const baseUrl = `https://${unipileDsn}`
    const supabase = createSupabaseClient()

    // Get Gmail account
    const { data: accs } = await supabase
      .from('unipile_accounts')
      .select('account_id, user_id')
      .eq('provider', 'EMAIL')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!accs?.account_id) return errorResponse('No Gmail account found')
    const accountId = accs.account_id

    // Test 1: List emails WITHOUT role filter
    const listAll = await fetch(`${baseUrl}/api/v1/emails?account_id=${accountId}&limit=10`, {
      headers: { 'X-API-KEY': unipileAccessToken }
    })
    const allData = listAll.ok ? await listAll.json() : { error: await listAll.text() }
    const allItems: Array<Record<string, unknown>> = allData?.items || allData?.data || []

    // Test 2: List emails WITH role=SENT
    const listSent = await fetch(`${baseUrl}/api/v1/emails?account_id=${accountId}&role=SENT&limit=5`, {
      headers: { 'X-API-KEY': unipileAccessToken }
    })
    const sentData = listSent.ok ? await listSent.json() : { error: await listSent.text() }
    const sentItems: Array<Record<string, unknown>> = sentData?.items || sentData?.data || []

    // Test 3: Check the most recent email's full structure
    const firstEmail = allItems[0]
    let emailDetail: Record<string, unknown> = {}
    if (firstEmail?.id) {
      const detailRes = await fetch(`${baseUrl}/api/v1/emails/${firstEmail.id}`, {
        headers: { 'X-API-KEY': unipileAccessToken }
      })
      emailDetail = detailRes.ok ? await detailRes.json() : { error: await detailRes.text() }
    }

    // Test 4: Check what gmail_message_ids we have in DB
    const { data: dbEmails } = await supabase
      .from('email_messages')
      .select('id, subject, to_email, gmail_message_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    return jsonResponse({
      account_id: accountId,
      test1_no_role_filter: {
        count: allItems.length,
        top_keys: allItems[0] ? Object.keys(allItems[0]) : [],
        emails: allItems.slice(0, 5).map(e => ({
          id: e.id,
          provider_id: e.provider_id,
          thread_id: e.thread_id,
          subject: e.subject,
          role: e.role,
          folders: e.folders,
          to_attendees: e.to_attendees,
        }))
      },
      test2_role_sent_filter: {
        count: sentItems.length,
        http_status: listSent.status,
        error: sentData?.error,
      },
      test3_email_detail: {
        keys: Object.keys(emailDetail),
        id: emailDetail.id,
        provider_id: emailDetail.provider_id,
        thread_id: emailDetail.thread_id,
        message_id: emailDetail.message_id,
        subject: emailDetail.subject,
        role: emailDetail.role,
      },
      test4_db_emails: dbEmails,
    })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Error', 500)
  }
})
