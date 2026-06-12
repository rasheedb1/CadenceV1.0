// chief-prepare-decks-for-company
// =============================================================================
// Generates BOTH ss-deck + sdr-bc for a target account_map_company in parallel
// and persists URLs back onto the amc row. Called fire-and-forget by
// chief-process-company immediately after a lead is promoted, so by the
// time Day 5/7/9 fire (5+ business days later) URLs are guaranteed ready.
//
// Idempotent: skips a deck if its URL is already set on the amc row, unless
// `force=true` is passed.
//
// Resilience: each deck is independent — if ss-deck fails, sdr-bc still
// runs (and vice versa). Failures are logged but do NOT fail the wrapper.
// Downstream prompts treat NULL URLs as "no deck this touch" → degrade
// silently.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient, logActivity } from '../_shared/supabase.ts'

interface Req {
  account_map_company_id: string
  ownerId?: string
  orgId?: string
  force?: boolean
}

interface DeckResult {
  generated: boolean
  url?: string
  slug?: string
  error?: string
  duration_ms: number
}

const PRESENTATIONS_AGENT_TOKEN = Deno.env.get('PRESENTATIONS_AGENT_TOKEN') || ''
const SS_DECK_TIMEOUT_MS = 60_000
const SDR_BC_TIMEOUT_MS  = 90_000

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ])
}

async function callSsDeck(companyName: string, ownerEmail: string, supabaseUrl: string, serviceKey: string): Promise<DeckResult> {
  const start = Date.now()
  try {
    const resp = await withTimeout(
      fetch(`${supabaseUrl}/functions/v1/ss-deck-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Agent-Token': PRESENTATIONS_AGENT_TOKEN,
        },
        body: JSON.stringify({ createdByEmail: ownerEmail, company_name: companyName }),
      }),
      SS_DECK_TIMEOUT_MS,
      'ss-deck-generate'
    )
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { generated: false, error: `${resp.status}:${text.slice(0, 200)}`, duration_ms: Date.now() - start }
    }
    const data = await resp.json() as { url?: string; slug?: string; id?: string }
    return {
      generated: true,
      url: data.url,
      slug: data.slug,
      duration_ms: Date.now() - start,
    }
  } catch (e) {
    return { generated: false, error: (e as Error).message, duration_ms: Date.now() - start }
  }
}

async function callSdrBc(clientName: string, website: string | null, ownerEmail: string, supabaseUrl: string, serviceKey: string): Promise<DeckResult> {
  const start = Date.now()
  if (!website || website.trim().length === 0) {
    return { generated: false, error: 'no_website_on_amc', duration_ms: 0 }
  }
  try {
    const resp = await withTimeout(
      fetch(`${supabaseUrl}/functions/v1/sdr-bc-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Agent-Token': PRESENTATIONS_AGENT_TOKEN,
        },
        body: JSON.stringify({ createdByEmail: ownerEmail, clientName, website }),
      }),
      SDR_BC_TIMEOUT_MS,
      'sdr-bc-generate'
    )
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { generated: false, error: `${resp.status}:${text.slice(0, 200)}`, duration_ms: Date.now() - start }
    }
    const data = await resp.json() as { url?: string; slug?: string; id?: string }
    return {
      generated: true,
      url: data.url,
      slug: data.slug,
      duration_ms: Date.now() - start,
    }
  } catch (e) {
    return { generated: false, error: (e as Error).message, duration_ms: Date.now() - start }
  }
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const authHeader = req.headers.get('Authorization') || ''
  const body = (await req.json().catch(() => ({}))) as Req

  try {
    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)
    if (!body.account_map_company_id) return errorResponse('account_map_company_id required', 400)

    const supabase = createSupabaseClient(authHeader)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const { data: amc, error: amcErr } = await supabase
      .from('account_map_companies')
      .select('id, company_name, website, ss_deck_url, ss_deck_slug, sdr_bc_url, sdr_bc_slug')
      .eq('id', body.account_map_company_id)
      .single()

    if (amcErr || !amc) return errorResponse('account_map_company not found', 404)

    // ── Concurrency guard: claim a deck-prep slot for this amc ────────────
    // Two workers calling this function for the same company would double-
    // call bridge, waste tokens, and race on writing slugs. The claim sets
    // amc.deck_prep_started_at = NOW() atomically; if another worker holds
    // the slot (and it's not stale >5min), we bail out.
    const { data: claimedSlot, error: claimErr } = await supabase.rpc('try_claim_deck_prep', {
      p_amc_id: amc.id,
      p_stale_after_seconds: 300,
    })
    if (claimErr) {
      console.warn(`[chief-prepare-decks] claim RPC failed: ${claimErr.message}`)
    }
    if (claimedSlot === false) {
      console.log(`[chief-prepare-decks] slot busy for amc=${amc.id} (${amc.company_name}) — another worker is preparing`)
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'deck_prep_slot_busy',
        account_map_company_id: amc.id,
        company_name: amc.company_name,
      })
    }

    // From here on, ALWAYS release the slot before returning (success or err)
    const releaseSlot = async () => {
      try {
        await supabase.rpc('release_deck_prep_claim', { p_amc_id: amc.id })
      } catch (relErr) {
        console.warn(`[chief-prepare-decks] release_deck_prep_claim failed: ${(relErr as Error).message}`)
      }
    }

    // ── Website fallback chain (resilience) ─────────────────────────────
    // SDR BC requires a website. If amc.website is null, try:
    //   1. Apollo enrichment apollo_website on any prospect of this company
    //   2. Domain from any lead's corporate email (skip free-mail)
    //   3. Persist resolved website back to amc for future runs
    let websiteResolved = amc.website
    if (!websiteResolved) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('enrichment_data')
        .eq('company_id', amc.id)
        .not('enrichment_data', 'is', null)
        .limit(1)
        .maybeSingle()
      const apolloWeb = (prospect?.enrichment_data as Record<string, unknown> | null)?.apollo_website as string | undefined
      if (apolloWeb) {
        websiteResolved = apolloWeb.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
      }
      if (!websiteResolved) {
        const { data: lead } = await supabase
          .from('leads')
          .select('email')
          .eq('account_map_company_id', amc.id)
          .not('email', 'is', null)
          .limit(1)
          .maybeSingle()
        const emailDomain = lead?.email?.split('@')[1]?.toLowerCase()
        const freeMail = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com', 'me.com'])
        if (emailDomain && !freeMail.has(emailDomain)) {
          websiteResolved = emailDomain
        }
      }
      if (websiteResolved) {
        console.log(`[chief-prepare-decks] resolved website fallback for ${amc.company_name}: ${websiteResolved}`)
        await supabase.from('account_map_companies').update({ website: websiteResolved }).eq('id', amc.id)
      } else {
        console.warn(`[chief-prepare-decks] no website resolvable for ${amc.company_name} — sdr-bc will fail`)
      }
    }

    // Resolve owner email for skill API tokens (presentations require createdByEmail)
    const { data: ownerInteg } = await supabase
      .from('ae_integrations')
      .select('config')
      .eq('user_id', auth.userId)
      .eq('org_id', auth.orgId)
      .eq('provider', 'gmail')
      .maybeSingle()
    const ownerEmail = (ownerInteg?.config as Record<string, unknown> | null)?.email as string | undefined
    if (!ownerEmail) {
      return errorResponse('No Gmail integration found for owner — cannot resolve createdByEmail', 400)
    }

    const promises: Array<Promise<{ kind: 'ss_deck' | 'sdr_bc'; result: DeckResult }>> = []

    if (body.force || !amc.ss_deck_url) {
      promises.push(callSsDeck(amc.company_name, ownerEmail, supabaseUrl, serviceKey).then(r => ({ kind: 'ss_deck' as const, result: r })))
    }
    if (body.force || !amc.sdr_bc_url) {
      promises.push(callSdrBc(amc.company_name, websiteResolved, ownerEmail, supabaseUrl, serviceKey).then(r => ({ kind: 'sdr_bc' as const, result: r })))
    }

    // V18: skip URL gen if both already exist, but still proceed to b64
    // caching pass below (it may need to populate amc.ss_deck_pdf_b64 or
    // amc.sdr_bc_pdf_b64 if those are null).
    const settled = promises.length > 0 ? await Promise.all(promises) : []

    // Persist whichever decks succeeded
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const summary: Record<string, DeckResult> = {}
    for (const { kind, result } of settled) {
      summary[kind] = result
      if (result.generated && result.url && result.slug) {
        updates[`${kind}_url`] = result.url
        updates[`${kind}_slug`] = result.slug
        updates[`${kind}_generated_at`] = new Date().toISOString()
      }
    }

    // V18: fetch + cache PDF base64 for ALL decks with a slug that don't
    // already have a cached b64 (or all of them if body.force). The cache
    // persists on amc so send-email's attachDeck can read it directly
    // without calling bridge or burning CPU on encoding.
    //
    // We need the slugs from BOTH (a) decks generated in this run (still
    // only in the in-memory `updates` object — not yet persisted) and
    // (b) decks that already had a URL in the DB but were missing b64.
    // The original implementation re-read from DB before persisting
    // `updates`, so fresh-generation runs always saw null slugs and
    // skipped b64 caching entirely. Use a merged view instead.
    const amcSlugs = amc as unknown as { ss_deck_slug?: string | null; sdr_bc_slug?: string | null }
    const mergedSlugs: { ss?: { slug: string; b64Present: boolean }; sdr?: { slug: string; b64Present: boolean } } = {
      ss: amcSlugs.ss_deck_slug
        ? { slug: amcSlugs.ss_deck_slug, b64Present: false }  // b64Present filled below from DB
        : undefined,
      sdr: amcSlugs.sdr_bc_slug
        ? { slug: amcSlugs.sdr_bc_slug, b64Present: false }
        : undefined,
    }
    // Overlay slugs from this run's URL generation (newer/just-set values win)
    if (typeof updates.ss_deck_slug === 'string') {
      mergedSlugs.ss = { slug: updates.ss_deck_slug, b64Present: false }
    }
    if (typeof updates.sdr_bc_slug === 'string') {
      mergedSlugs.sdr = { slug: updates.sdr_bc_slug, b64Present: false }
    }
    // Look up current b64 presence for each (we don't want to re-fetch if
    // it's already cached and `force` is not set)
    const { data: amcB64Check } = await supabase
      .from('account_map_companies')
      .select('ss_deck_pdf_b64, sdr_bc_pdf_b64')
      .eq('id', amc.id)
      .single()
    if (amcB64Check) {
      if (mergedSlugs.ss) mergedSlugs.ss.b64Present = !!amcB64Check.ss_deck_pdf_b64
      if (mergedSlugs.sdr) mergedSlugs.sdr.b64Present = !!amcB64Check.sdr_bc_pdf_b64
    }
    const b64FetchPlan: Array<{ kind: 'ss_deck' | 'sdr_bc'; slug: string }> = []
    if (mergedSlugs.ss && (body.force || !mergedSlugs.ss.b64Present)) {
      b64FetchPlan.push({ kind: 'ss_deck', slug: mergedSlugs.ss.slug })
    }
    if (mergedSlugs.sdr && (body.force || !mergedSlugs.sdr.b64Present)) {
      b64FetchPlan.push({ kind: 'sdr_bc', slug: mergedSlugs.sdr.slug })
    }
    const b64Fetches = b64FetchPlan.map(async ({ kind, slug }) => {
      const bridgePath = kind === 'sdr_bc' ? 'sdr-bc' : 'm'
      const token = await computePrintToken(slug)
      if (!token) return { kind, error: 'no_print_secret' as string }
      const url = `https://bridge.yuno.tools/api/${bridgePath}/${slug}/pdf?print=${token}&format=base64`
      try {
        const resp = await fetch(url, { method: 'GET' })
        if (!resp.ok) return { kind, error: `${resp.status}` }
        const data = await resp.json() as { pdf_b64: string; size_bytes: number }
        return { kind, b64: data.pdf_b64, sizeBytes: data.size_bytes }
      } catch (err) {
        return { kind, error: (err as Error).message }
      }
    })

    const b64Results = await Promise.all(b64Fetches)
    for (const r of b64Results) {
      if (r.b64) {
        updates[`${r.kind}_pdf_b64`] = r.b64
        updates[`${r.kind}_pdf_size_bytes`] = r.sizeBytes ?? null
        updates[`${r.kind}_pdf_cached_at`] = new Date().toISOString()
        const prior = summary[r.kind] ?? { generated: true, duration_ms: 0 }
        summary[r.kind] = { ...prior, pdf_cached: true, pdf_size_bytes: r.sizeBytes ?? null } as DeckResult & { pdf_cached: boolean; pdf_size_bytes: number | null }
      } else if (r.error) {
        console.warn(`[chief-prepare-decks] ${r.kind} pdf b64 fetch failed: ${r.error}`)
      }
    }

    // Persist if (a) any new deck generated OR (b) any new b64 cached
    const succeeded = settled.filter(s => s.result.generated).length
    const b64Cached = b64Results.filter(r => r.b64).length
    if (succeeded > 0 || b64Cached > 0) {
      await supabase
        .from('account_map_companies')
        .update(updates)
        .eq('id', amc.id)
    }

    await releaseSlot()

    await logActivity({
      ownerId: auth.userId,
      orgId: auth.orgId,
      action: 'chief_prepare_decks_completed',
      status: succeeded === settled.length ? 'ok' : 'failed',
      details: {
        account_map_company_id: amc.id,
        company_name: amc.company_name,
        succeeded,
        attempted: settled.length,
        b64_cached: b64Cached,
        results: summary,
      },
    }).catch(() => {})

    return jsonResponse({
      success: true,
      account_map_company_id: amc.id,
      company_name: amc.company_name,
      succeeded,
      attempted: settled.length,
      results: summary,
    })
  } catch (err) {
    console.error('chief-prepare-decks-for-company error:', err)
    // Best-effort slot release on error (we may not have claimed it; idempotent)
    try {
      if (body.account_map_company_id) {
        const supabaseRel = createSupabaseClient(authHeader)
        await supabaseRel.rpc('release_deck_prep_claim', { p_amc_id: body.account_map_company_id })
      }
    } catch (_relErr) { /* swallow */ }
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})

/**
 * Compute HMAC-SHA256 bypass token for bridge.yuno.tools/api/{...}/pdf?print=
 * Mirrors openclaw/bridge/server.js bcPrintToken (same BC_PRINT_SECRET).
 */
async function computePrintToken(slug: string): Promise<string | null> {
  const secret = Deno.env.get('BC_PRINT_SECRET') || ''
  if (!secret) {
    console.warn('[chief-prepare-decks] BC_PRINT_SECRET not set — cannot fetch PDF b64')
    return null
  }
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}
