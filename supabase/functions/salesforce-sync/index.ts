// Edge Function: Sync Salesforce Accounts + Opportunities
// POST /functions/v1/salesforce-sync
// Queries Salesforce for Accounts with active Opportunities and caches locally.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { salesforceQuery, extractDomain } from '../_shared/salesforce.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SfOpportunity {
  Id: string
  Name: string
  StageName: string
  Amount: number | null
  CurrencyIsoCode?: string
  CloseDate: string | null
  Probability: number | null
  IsClosed: boolean
  IsWon: boolean
  Owner?: { Name: string } | null
}

interface SfAccount {
  Id: string
  Name: string
  Website: string | null
  Industry: string | null
  Owner?: { Name: string } | null
  Opportunities?: {
    totalSize: number
    done: boolean
    records: SfOpportunity[]
  } | null
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Invalid or expired token', 401)

    console.log('Starting Salesforce sync for org:', ctx.orgId)

    // Query Accounts with active (open) Opportunities
    const soql = `
      SELECT Id, Name, Website, Industry, Owner.Name,
        (SELECT Id, Name, StageName, Amount, CurrencyIsoCode, CloseDate,
                Probability, IsClosed, IsWon, Owner.Name
         FROM Opportunities
         WHERE IsClosed = false)
      FROM Account
      WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsClosed = false)
    `.replace(/\s+/g, ' ').trim()

    const records = await salesforceQuery(ctx.orgId, soql) as unknown as SfAccount[]

    console.log(`Fetched ${records.length} accounts with active opportunities`)

    const supabase = createSupabaseClient()
    const now = new Date().toISOString()

    // Clear previous cached data for this org
    await supabase.from('salesforce_opportunities').delete().eq('org_id', ctx.orgId)
    await supabase.from('salesforce_accounts').delete().eq('org_id', ctx.orgId)

    // Process and insert accounts + opportunities
    const accountRows: Record<string, unknown>[] = []
    const oppRows: Record<string, unknown>[] = []

    for (const account of records) {
      const opportunities = account.Opportunities?.records || []
      const activeOpps = opportunities.filter(o => !o.IsClosed)
      const totalPipeline = activeOpps.reduce((sum, o) => sum + (o.Amount || 0), 0)

      // Find latest opportunity by close date
      const sortedOpps = [...activeOpps].sort((a, b) => {
        if (!a.CloseDate) return 1
        if (!b.CloseDate) return -1
        return new Date(b.CloseDate).getTime() - new Date(a.CloseDate).getTime()
      })
      const latestOpp = sortedOpps[0]

      accountRows.push({
        org_id: ctx.orgId,
        sf_account_id: account.Id,
        name: account.Name,
        website: account.Website,
        domain: extractDomain(account.Website),
        industry: account.Industry,
        owner_name: account.Owner?.Name || null,
        has_active_opportunities: activeOpps.length > 0,
        active_opportunities_count: activeOpps.length,
        total_pipeline_value: totalPipeline,
        latest_opportunity_stage: latestOpp?.StageName || null,
        latest_opportunity_name: latestOpp?.Name || null,
        latest_opportunity_close_date: latestOpp?.CloseDate || null,
        synced_at: now,
      })

      for (const opp of opportunities) {
        oppRows.push({
          org_id: ctx.orgId,
          sf_account_id: account.Id,
          sf_opportunity_id: opp.Id,
          name: opp.Name,
          stage_name: opp.StageName,
          amount: opp.Amount,
          currency_code: opp.CurrencyIsoCode || 'USD',
          close_date: opp.CloseDate,
          probability: opp.Probability,
          is_closed: opp.IsClosed,
          is_won: opp.IsWon,
          owner_name: opp.Owner?.Name || null,
          synced_at: now,
        })
      }
    }

    // Batch insert (Supabase handles up to ~1000 rows per call)
    if (accountRows.length > 0) {
      const { error: accError } = await supabase.from('salesforce_accounts').insert(accountRows)
      if (accError) console.error('Error inserting SF accounts:', accError)
    }

    if (oppRows.length > 0) {
      // Insert in batches of 500
      for (let i = 0; i < oppRows.length; i += 500) {
        const batch = oppRows.slice(i, i + 500)
        const { error: oppError } = await supabase.from('salesforce_opportunities').insert(batch)
        if (oppError) console.error('Error inserting SF opportunities batch:', oppError)
      }
    }

    // Update last_sync_at on the connection
    await supabase
      .from('salesforce_connections')
      .update({ last_sync_at: now, last_error: null, updated_at: now })
      .eq('org_id', ctx.orgId)

    console.log(`Salesforce sync complete: ${accountRows.length} accounts, ${oppRows.length} opportunities`)

    return jsonResponse({
      success: true,
      accountsCount: accountRows.length,
      opportunitiesCount: oppRows.length,
    })
  } catch (error) {
    console.error('salesforce-sync error:', error)

    // Save error to connection
    try {
      const ctx = await getAuthContext(req.headers.get('Authorization')!)
      if (ctx) {
        const supabase = createSupabaseClient()
        await supabase
          .from('salesforce_connections')
          .update({
            last_error: error instanceof Error ? error.message : 'Unknown sync error',
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', ctx.orgId)
      }
    } catch { /* ignore */ }

    return errorResponse(error instanceof Error ? error.message : 'Sync failed', 500)
  }
})
