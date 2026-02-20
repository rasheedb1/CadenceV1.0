// Edge Function: Sync Salesforce Accounts + Opportunities
// POST /functions/v1/salesforce-sync
// Queries Salesforce for Accounts with active Opportunities and caches locally.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { salesforceQuery, extractDomain } from '../_shared/salesforce.ts'
import { normalizeCompanyName } from '../_shared/company-normalize.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SfOpportunity {
  Id: string
  Name: string
  StageName: string
  Amount: number | null
  CloseDate: string | null
  Probability: number | null
  IsClosed: boolean
  IsWon: boolean
  Owner?: { Name: string } | null
}

interface SfContact {
  Id: string
  Name: string
  Email: string | null
  Phone: string | null
  Title: string | null
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
  Contacts?: {
    totalSize: number
    done: boolean
    records: SfContact[]
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

    // Query Accounts with non-lost Opportunities (open OR closed-won)
    // Includes Contacts for each account and Opportunities in one query
    // Note: CurrencyIsoCode is intentionally excluded — it only exists when
    // multi-currency is enabled and causes errors on single-currency orgs.
    const soql = `
      SELECT Id, Name, Website, Industry, Owner.Name,
        (SELECT Id, Name, StageName, Amount, CloseDate,
                Probability, IsClosed, IsWon, Owner.Name
         FROM Opportunities
         WHERE IsWon = true OR IsClosed = false),
        (SELECT Id, Name, Email, Phone, Title FROM Contacts)
      FROM Account
      WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsWon = true OR IsClosed = false)
    `.replace(/\s+/g, ' ').trim()

    const records = await salesforceQuery(ctx.orgId, soql) as unknown as SfAccount[]

    console.log(`Fetched ${records.length} accounts with non-lost opportunities`)

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
      const openOpps = opportunities.filter(o => !o.IsClosed)
      const wonOpps = opportunities.filter(o => o.IsClosed && o.IsWon)
      const totalPipeline = openOpps.reduce((sum, o) => sum + (o.Amount || 0), 0)
      const totalWonValue = wonOpps.reduce((sum, o) => sum + (o.Amount || 0), 0)

      // Find latest opportunity (prefer open, then won) by close date
      const allRelevantOpps = [...openOpps, ...wonOpps]
      const sortedOpps = [...allRelevantOpps].sort((a, b) => {
        if (!a.CloseDate) return 1
        if (!b.CloseDate) return -1
        return new Date(b.CloseDate).getTime() - new Date(a.CloseDate).getTime()
      })
      const latestOpp = sortedOpps[0]

      // Extract contacts from the account
      const accountContacts = (account.Contacts?.records || []).map(c => ({
        name: c.Name,
        email: c.Email || null,
        phone: c.Phone || null,
        title: c.Title || null,
      }))

      accountRows.push({
        org_id: ctx.orgId,
        sf_account_id: account.Id,
        name: account.Name,
        website: account.Website,
        domain: extractDomain(account.Website),
        industry: account.Industry,
        owner_name: account.Owner?.Name || null,
        opp_owner_name: latestOpp?.Owner?.Name || null,
        has_active_opportunities: openOpps.length > 0,
        active_opportunities_count: openOpps.length,
        total_pipeline_value: totalPipeline,
        won_opportunities_count: wonOpps.length,
        total_won_value: totalWonValue,
        latest_opportunity_stage: latestOpp?.StageName || null,
        latest_opportunity_name: latestOpp?.Name || null,
        latest_opportunity_close_date: latestOpp?.CloseDate || null,
        _contacts: accountContacts,
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
          currency_code: 'USD',
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
    // Strip extra fields not in the salesforce_accounts table
    if (accountRows.length > 0) {
      const dbAccountRows = accountRows.map(({ _contacts, opp_owner_name, won_opportunities_count, total_won_value, ...rest }) => rest)
      const { error: accError } = await supabase.from('salesforce_accounts').insert(dbAccountRows)
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

    // Sync active pipeline companies to company_registry for visibility + auto-exclusion
    // 1. Remove previous salesforce_sync entries that are no longer in the pipeline
    await supabase
      .from('company_registry')
      .delete()
      .eq('org_id', ctx.orgId)
      .eq('source', 'salesforce_sync')

    // 2. Upsert current pipeline companies into registry
    if (accountRows.length > 0) {
      const registryRows = accountRows.map((acc) => {
        const openCount = acc.active_opportunities_count as number
        const wonCount = acc.won_opportunities_count as number
        const pipelineVal = Number(acc.total_pipeline_value || 0)
        const wonVal = Number(acc.total_won_value || 0)

        // Build exclusion reason describing the account status
        const parts: string[] = []
        if (openCount > 0) parts.push(`Pipeline: ${openCount} opp(s), $${pipelineVal.toLocaleString()}`)
        if (wonCount > 0) parts.push(`Won: ${wonCount} deal(s), $${wonVal.toLocaleString()}`)
        const exclusionReason = parts.join(' | ') || 'Salesforce account'

        return {
          org_id: ctx.orgId,
          owner_id: ctx.userId,
          company_name: normalizeCompanyName(acc.name as string),
          company_name_display: (acc.name as string).trim(),
          registry_type: 'customer',
          source: 'salesforce_sync',
          website: acc.website as string | null,
          industry: acc.industry as string | null,
          exclusion_reason: exclusionReason,
          metadata: {
            sf_owner_name: acc.opp_owner_name as string | null,
            sf_account_id: acc.sf_account_id as string,
            sf_pipeline_value: pipelineVal,
            sf_won_value: wonVal,
            sf_active_opps: openCount,
            sf_won_opps: wonCount,
            sf_latest_stage: acc.latest_opportunity_stage as string | null,
            sf_latest_opp_name: acc.latest_opportunity_name as string | null,
            sf_contacts: acc._contacts as Array<{ name: string; email: string | null; phone: string | null; title: string | null }>,
          },
        }
      })

      for (let i = 0; i < registryRows.length; i += 500) {
        const batch = registryRows.slice(i, i + 500)
        const { error: regError } = await supabase
          .from('company_registry')
          .upsert(batch, { onConflict: 'org_id,company_name' })
        if (regError) console.error('Error upserting SF companies to registry:', regError)
      }
      console.log(`Synced ${registryRows.length} Salesforce pipeline companies to registry`)
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
