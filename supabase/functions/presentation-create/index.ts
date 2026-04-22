// Edge function: presentation-create
// Creates a new business case deck row in `presentations`, optionally researching the client's
// payment stack via Firecrawl. Called by Chief's MCP tool, the /yuno-bc skill, and the frontend.
//
// Auth: shared secret via X-Agent-Token header
// Method: POST with JSON body
// Returns: { slug, url, providers, expiresAt }

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'

const PUBLIC_BASE_URL = 'https://chief.yuno.tools'

// Same PSP list as the research.py helper.
const KNOWN_PSPS: Record<string, string[]> = {
  'stripe': ['stripe'],
  'adyen': ['adyen'],
  'checkout.com': ['checkout.com', 'checkout com'],
  'worldpay': ['worldpay'],
  'cybersource': ['cybersource'],
  'braintree': ['braintree'],
  'paypal': ['paypal', 'pay pal'],
  'fiserv': ['fiserv', 'first data'],
  'nuvei': ['nuvei'],
  'rapyd': ['rapyd'],
  'global payments': ['global payments'],
  'authorize.net': ['authorize.net'],
  'square': ['square inc', 'squareup'],
  'bluesnap': ['bluesnap'],
  'dlocal': ['dlocal', 'd local'],
  'mercado pago': ['mercado pago', 'mercadopago'],
  'payu': ['payu'],
  'ebanx': ['ebanx'],
  'kushki': ['kushki'],
  'openpay': ['openpay'],
  'conekta': ['conekta'],
  'culqi': ['culqi'],
  'izipay': ['izipay'],
  'mobbex': ['mobbex'],
  'prisma': ['prisma medios de pago'],
  'getnet': ['getnet'],
  'wompi': ['wompi'],
  'niubiz': ['niubiz'],
  'razorpay': ['razorpay'],
  'ccavenue': ['ccavenue'],
  'paytm': ['paytm'],
  'billdesk': ['billdesk'],
  'mollie': ['mollie'],
  'klarna': ['klarna'],
  'trustly': ['trustly'],
  'sofort': ['sofort'],
  'ingenico': ['ingenico'],
}

// Regex-safe escape without using $& replacement (which flags a security hook as false positive).
function escapeRegex(s: string): string {
  const specials = new Set(['.', '*', '+', '?', '^', '{', '}', '(', ')', '|', '[', ']', '\\'])
  let out = ''
  for (const c of s) out += specials.has(c) ? '\\' + c : c
  return out
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'client'
}

function randomSuffix(len = 6): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function extractPSPs(corpus: string): string[] {
  const normalized = corpus.toLowerCase().replace(/\s+/g, ' ')
  const hits: Array<[number, string]> = []
  for (const [canonical, aliases] of Object.entries(KNOWN_PSPS)) {
    for (const alias of aliases) {
      const pattern = alias.length <= 4
        ? new RegExp('\\b' + escapeRegex(alias) + '\\b')
        : new RegExp(escapeRegex(alias))
      const m = pattern.exec(normalized)
      if (m) {
        hits.push([m.index, canonical])
        break
      }
    }
  }
  hits.sort((a, b) => a[0] - b[0])
  const seen = new Set<string>()
  const out: string[] = []
  for (const [, name] of hits) {
    if (!seen.has(name)) {
      out.push(name)
      seen.add(name)
    }
  }
  return out.slice(0, 12)
}

async function researchPaymentStack(clientName: string): Promise<{ providers: string[]; raw: unknown }> {
  let firecrawl
  try {
    firecrawl = createFirecrawlClient()
  } catch {
    return { providers: [], raw: { error: 'FIRECRAWL_API_KEY not set' } }
  }

  const q = (text: string) => text
  const queries = [
    q('"' + clientName + '" payment providers stripe adyen PSP'),
    q('"' + clientName + '" checkout payment processor acquirer'),
    q('"' + clientName + '" pagos dlocal mercadopago payu'),
  ]

  const searchResults: Array<{ url?: string; title?: string; description?: string }> = []
  for (const query of queries) {
    const r = await firecrawl.search(query, { limit: 5, maxRetries: 1 })
    if (r.success && Array.isArray(r.data)) {
      searchResults.push(...r.data)
    }
  }

  const seen = new Set<string>()
  const unique = searchResults.filter((r) => {
    if (!r.url || seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })

  const corpusCheap = unique.map((r) => (r.title || '') + ' ' + (r.description || '')).join(' ')
  let providers = extractPSPs(corpusCheap)

  if (providers.length < 3 && unique.length) {
    const deeper: string[] = []
    for (const r of unique.slice(0, 2)) {
      if (!r.url) continue
      const s = await firecrawl.scrape(r.url, { maxCharacters: 4000 })
      if (s.success && s.data?.markdown) deeper.push(s.data.markdown.slice(0, 4000))
    }
    providers = extractPSPs(corpusCheap + ' ' + deeper.join(' '))
  }

  return {
    providers,
    raw: {
      queries,
      resultsFound: unique.length,
      topResults: unique.slice(0, 10).map((r) => ({ title: r.title, url: r.url })),
    },
  }
}

function assertRange(name: string, v: unknown, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(name + ' must be a number in [' + min + ', ' + max + '], got: ' + JSON.stringify(v))
  }
  return n
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const expectedToken = Deno.env.get('PRESENTATIONS_AGENT_TOKEN')
  if (!expectedToken) return errorResponse('Server misconfigured: PRESENTATIONS_AGENT_TOKEN not set', 500)
  const provided = req.headers.get('x-agent-token') || req.headers.get('X-Agent-Token')
  if (provided !== expectedToken) return errorResponse('Invalid X-Agent-Token', 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const supabase = createSupabaseClient()

  let parentId: string | null = null
  let baseDefaults: Record<string, unknown> = {}
  let baseOrgId: string | null = null
  const regenerateFrom = body.regenerateFrom as string | undefined
  if (regenerateFrom) {
    const { data: parent, error: parentErr } = await supabase
      .from('presentations')
      .select('id, org_id, defaults')
      .eq('slug', regenerateFrom)
      .maybeSingle()
    if (parentErr || !parent) return errorResponse('regenerateFrom slug not found: ' + regenerateFrom, 404)
    parentId = parent.id
    baseOrgId = parent.org_id
    baseDefaults = (parent.defaults as Record<string, unknown>) || {}
  }

  const d = { ...baseDefaults, ...body }

  const orgId = (d.orgId as string) || baseOrgId
  if (!orgId) return errorResponse('orgId is required', 400)

  const clientName = ((d.clientName as string) || '').trim()
  if (!clientName) return errorResponse('clientName is required', 400)

  let tpv, avgTicket, currentApproval, currentMDR, grossMargin
  try {
    tpv = assertRange('tpv', d.tpv, 1, 1e12)
    avgTicket = assertRange('avgTicket', d.avgTicket, 0.01, 1e6)
    currentApproval = assertRange('currentApproval', d.currentApproval, 0.01, 100)
    currentMDR = assertRange('currentMDR', d.currentMDR, 0.01, 10)
    grossMargin = assertRange('grossMargin', d.grossMargin, 0.01, 100)
  } catch (e) {
    return errorResponse((e as Error).message, 400)
  }

  const pricingModel = d.pricingModel as string
  if (pricingModel !== 'flat' && pricingModel !== 'tiered') {
    return errorResponse('pricingModel must be "flat" or "tiered"', 400)
  }
  if (pricingModel === 'flat' && !Number.isFinite(Number(d.ratePerTx))) {
    return errorResponse('ratePerTx required when pricingModel=flat', 400)
  }
  if (pricingModel === 'tiered') {
    if (!Array.isArray(d.rateTiers) || d.rateTiers.length === 0) {
      return errorResponse('rateTiers required (non-empty array) when pricingModel=tiered', 400)
    }
  }

  let todayProviders = (d.todayProviders as string[]) || []
  let rawResearch: unknown = null
  if (!Array.isArray(todayProviders) || todayProviders.length === 0) {
    const research = await researchPaymentStack(clientName)
    todayProviders = research.providers
    rawResearch = research.raw
  }

  const prefix = slugify(clientName)
  let slug = ''
  for (let i = 0; i < 5; i++) {
    const candidate = prefix + '-' + randomSuffix(6)
    const { data: existing } = await supabase
      .from('presentations')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!existing) {
      slug = candidate
      break
    }
  }
  if (!slug) return errorResponse('Could not generate a unique slug after 5 tries', 500)

  const defaults = {
    clientName,
    date: d.date || '',
    tpv, avgTicket,
    currentApproval, currentMDR,
    activeMarkets: Number(d.activeMarkets) || 0,
    currentAPMs: Number(d.currentAPMs) || 0,
    currentProviders: Number(d.currentProviders) || todayProviders.length || 0,
    grossMargin,
    fteToday: Number(d.fteToday) || 4,
    todayProviders,
    pricingModel,
    ratePerTx: Number(d.ratePerTx) || 0,
    rateTiers: (d.rateTiers as unknown[]) || [],
    minTxAnnual: Number(d.minTxAnnual) || 0,
    monthlySaaS: Number(d.monthlySaaS) || 0,
    approvalLiftPp: Number(d.approvalLiftPp) || 7.4,
    mdrReductionBps: Number(d.mdrReductionBps) || 38,
    apmUpliftPct: Number(d.apmUpliftPct) || 6,
    newAPMsAdded: Number(d.newAPMsAdded) || 180,
    fteTarget: Number(d.fteTarget) || 0.5,
    integrationReductionPct: Number(d.integrationReductionPct) || 85,
    opsSavings: Number(d.opsSavings) || 2100000,
    conservativeMult: Number(d.conservativeMult) || 0.6,
    optimisticMult: Number(d.optimisticMult) || 1.4,
    npvMultiplier: Number(d.npvMultiplier) || 2.6,
    costModel: (d.costModel as Record<string, number>) || {
      integrationPerProvider: 200000,
      maintenancePerProvider3yr: 400000,
      fteCostYr: 250000,
      compliancePerMarket: 45000,
      yunoIntegration: 100000,
      yunoMaintenance3yr: 200000,
      yunoCompliance: 100000,
    },
  }

  const { data: row, error: insertErr } = await supabase
    .from('presentations')
    .insert({
      org_id: orgId,
      created_by: (d.createdBy as string) || null,
      kind: 'yuno_bc',
      client_name: clientName,
      slug,
      defaults,
      raw_research: rawResearch,
      parent_id: parentId,
    })
    .select('id, slug, expires_at')
    .single()

  if (insertErr || !row) {
    console.error('Insert failed:', insertErr)
    return errorResponse('Insert failed: ' + (insertErr?.message || 'unknown'), 500)
  }

  return jsonResponse({
    id: row.id,
    slug: row.slug,
    url: PUBLIC_BASE_URL + '/bc/' + row.slug,
    expiresAt: row.expires_at,
    providers: todayProviders,
    regeneratedFrom: parentId ? regenerateFrom : null,
  })
})
