// Debug endpoint: test Sales Navigator search formats
// POST /functions/v1/debug-search

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()
    const companyName = body.companyName || 'Delivery Hero'
    const fixAccountId = body.fixAccountId || false

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const dsn = Deno.env.get('UNIPILE_DSN')!
    const token = Deno.env.get('UNIPILE_ACCESS_TOKEN')!

    const results: Record<string, unknown> = { companyName }

    // Find real Unipile account
    const accResp = await fetch(`https://${dsn}/api/v1/accounts`, {
      headers: { 'X-API-KEY': token },
    })
    const accData = await accResp.json()
    const linkedinAccount = (accData.items || []).find(
      (a: Record<string, unknown>) => a.type === 'LINKEDIN'
    )
    if (!linkedinAccount) {
      return jsonResponse({ error: 'No LinkedIn account in Unipile' })
    }
    const accountId = linkedinAccount.id as string
    results.realAccountId = accountId

    // Fix account ID if requested
    if (fixAccountId) {
      // Update unipile_accounts where account_id is wrong
      const { data: updated, error: updateErr } = await supabase
        .from('unipile_accounts')
        .update({ account_id: accountId })
        .eq('account_id', 'test-account-123')
        .select()
      results.fixResult = { updated, error: updateErr?.message }

      // Also ensure the user who owns this real account has it linked
      // The real account is under user 76403628... let's check
      const { data: existing } = await supabase
        .from('unipile_accounts')
        .select('*')
        .eq('account_id', accountId)
      results.existingRecords = existing
    }

    // Company lookup
    const lookupResp = await fetch(
      `https://${dsn}/api/v1/linkedin/search/parameters?account_id=${accountId}&type=COMPANY&keywords=${encodeURIComponent(companyName)}&limit=3`,
      { headers: { 'X-API-KEY': token } }
    )
    const lookupData = await lookupResp.json()
    results.companyLookup = lookupData
    const companyId = (lookupData.items?.[0]?.id || null) as string | null
    results.companyId = companyId

    // Test the production-like combinations (no role filter - it causes 400)
    const formats = [
      {
        name: 'PROD-L1: company + seniority + title keywords',
        body: {
          api: 'sales_navigator', category: 'people',
          company: { include: [companyId] },
          seniority: { include: ['cxo', 'vice_president', 'director'] },
          keywords: 'Finance OR Payments OR Treasury',
        },
      },
      {
        name: 'PROD-L2: company + seniority + domain keywords',
        body: {
          api: 'sales_navigator', category: 'people',
          company: { include: [companyId] },
          seniority: { include: ['cxo', 'vice_president', 'director', 'experienced_manager'] },
          keywords: 'payments OR checkout OR billing OR fintech',
        },
      },
      {
        name: 'PROD-L3: company + seniority only',
        body: {
          api: 'sales_navigator', category: 'people',
          company: { include: [companyId] },
          seniority: { include: ['cxo', 'vice_president', 'director', 'experienced_manager', 'senior'] },
        },
      },
      {
        name: 'FALLBACK: keywords only (no company ID)',
        body: {
          api: 'sales_navigator', category: 'people',
          keywords: companyName + ' Finance',
          seniority: { include: ['cxo', 'vice_president', 'director'] },
        },
      },
    ]

    const formatResults: Record<string, unknown> = {}
    results.formatTests = formatResults
    for (const format of formats) {
      if (!companyId && format.name !== 'A: keywords only' && format.name !== 'G: keywords + seniority') {
        formatResults[format.name] = { skipped: 'no company ID' }
        continue
      }
      try {
        const resp = await fetch(
          `https://${dsn}/api/v1/linkedin/search?account_id=${accountId}&limit=2`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': token },
            body: JSON.stringify(format.body),
          }
        )
        const text = await resp.text()
        let parsed: Record<string, unknown> = {}
        try { parsed = JSON.parse(text) } catch (_e) { parsed = { raw: text } }
        const items = (parsed.items || []) as Array<Record<string, unknown>>
        const testResult: Record<string, unknown> = {
          status: resp.status,
          itemCount: items.length,
        }
        if (items.length > 0 && items[0]) {
          testResult.firstItem = { name: items[0].name, headline: items[0].headline }
        }
        if (resp.status !== 200) {
          const detail = String(parsed.detail || parsed.title || '')
          testResult.error = detail.substring(0, 300)
        }
        formatResults[format.name] = testResult
      } catch (e) {
        formatResults[format.name] = { error: String(e) }
      }
    }

    return jsonResponse(results)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
