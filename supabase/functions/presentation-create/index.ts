// Edge function: presentation-create
// Creates a new business case deck row in `presentations`, optionally researching the client's
// payment stack via Firecrawl. Called by Chief's MCP tool, the /yuno-bc skill, and the frontend.
//
// Auth: shared secret via X-Agent-Token header (constant-time compared).
// Method: POST with JSON body.
// Returns: { slug, url, providers, expiresAt }.

import { createSupabaseClient } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'

const PUBLIC_BASE_URL = 'https://chief.yuno.tools'
const FIRECRAWL_TIMEOUT_MS = 15_000

// Known PSPs/acquirers — kept in sync with .claude/skills/yuno-bc/research.py.
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

// Restrict CORS to known origins for an auth'd POST (we don't use the shared '*' helper).
const ALLOWED_ORIGINS = new Set([
  'https://chief.yuno.tools',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8888',
])

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://chief.yuno.tools'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status: number, origin: string | null): Response {
  return json({ error: msg }, status, origin)
}

// Constant-time string equality (byte-level XOR accumulation).
function timingSafeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const ua = new TextEncoder().encode(a)
  const ub = new TextEncoder().encode(b)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

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
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length]
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

type TimeoutTag = { _timeout: string }
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | TimeoutTag> {
  const timer = new Promise<TimeoutTag>((resolve) =>
    setTimeout(() => resolve({ _timeout: label }), ms),
  )
  return Promise.race([p, timer])
}

async function researchPaymentStack(clientName: string): Promise<{ providers: string[]; raw: unknown }> {
  let firecrawl
  try {
    firecrawl = createFirecrawlClient()
  } catch {
    return { providers: [], raw: { error: 'FIRECRAWL_API_KEY not set' } }
  }

  const queries = [
    '"' + clientName + '" payment providers stripe adyen PSP',
    '"' + clientName + '" checkout payment processor acquirer',
    '"' + clientName + '" pagos dlocal mercadopago payu',
  ]

  const searchResults: Array<{ url?: string; title?: string; description?: string }> = []
  const failures: string[] = []

  // Per-call try/catch so one Firecrawl failure doesn't kill the whole create request.
  for (const query of queries) {
    try {
      const res = await withTimeout(
        firecrawl.search(query, { limit: 5, maxRetries: 1 }),
        FIRECRAWL_TIMEOUT_MS,
        'search',
      )
      if ('_timeout' in res) {
        failures.push('search timeout')
        continue
      }
      if (res.success && Array.isArray(res.data)) searchResults.push(...res.data)
      else if (!res.success) failures.push(String(res.error || 'search failed'))
    } catch (e) {
      failures.push('search ' + (e instanceof Error ? e.message : 'unknown'))
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
      try {
        const s = await withTimeout(
          firecrawl.scrape(r.url, { maxCharacters: 4000 }),
          FIRECRAWL_TIMEOUT_MS,
          'scrape',
        )
        if ('_timeout' in s) continue
        if (s.success && s.data?.markdown) deeper.push(s.data.markdown.slice(0, 4000))
      } catch {
        // Best-effort; a failed scrape shouldn't cascade.
      }
    }
    providers = extractPSPs(corpusCheap + ' ' + deeper.join(' '))
  }

  return {
    providers,
    raw: {
      queries,
      resultsFound: unique.length,
      failures: failures.length ? failures : undefined,
      topResults: unique.slice(0, 10).map((r) => ({ title: r.title, url: r.url })),
    },
  }
}

// Numeric range assertion. Throws on bad input.
function n(name: string, v: unknown, min: number, max: number): number {
  const x = Number(v)
  if (!Number.isFinite(x) || x < min || x > max) {
    throw new Error(name + ' must be a finite number in [' + min + ', ' + max + '], got: ' + JSON.stringify(v))
  }
  return x
}

// Shape-validate a rateTiers array. Returns sanitized array or throws.
function validateRateTiers(input: unknown): Array<{ upToTx: number | null; ratePerTx: number }> {
  if (!Array.isArray(input) || input.length === 0) throw new Error('rateTiers must be a non-empty array')
  if (input.length > 20) throw new Error('rateTiers cannot exceed 20 tiers')
  const out: Array<{ upToTx: number | null; ratePerTx: number }> = []
  let prevUpTo = 0
  for (let i = 0; i < input.length; i++) {
    const t = input[i] as Record<string, unknown>
    if (!t || typeof t !== 'object') throw new Error('rateTiers[' + i + '] must be an object')
    const rate = Number(t.ratePerTx)
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10) {
      throw new Error('rateTiers[' + i + '].ratePerTx must be a positive number ≤ 10, got: ' + JSON.stringify(t.ratePerTx))
    }
    let upTo: number | null
    if (t.upToTx === null || t.upToTx === undefined) {
      upTo = null
      if (i !== input.length - 1) throw new Error('only the final rateTier may have upToTx=null')
    } else {
      const u = Number(t.upToTx)
      if (!Number.isInteger(u) || u <= prevUpTo) {
        throw new Error('rateTiers[' + i + '].upToTx must be an integer > previous tier upToTx (' + prevUpTo + ')')
      }
      upTo = u
      prevUpTo = u
    }
    out.push({ upToTx: upTo, ratePerTx: rate })
  }
  return out
}

const COST_MODEL_KEYS = [
  'integrationPerProvider',
  'maintenancePerProvider3yr',
  'fteCostYr',
  'compliancePerMarket',
  'yunoIntegration',
  'yunoMaintenance3yr',
  'yunoCompliance',
] as const

function validateCostModel(input: unknown): Record<string, number> | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'object') throw new Error('costModel must be an object')
  const src = input as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const k of COST_MODEL_KEYS) {
    if (k in src) {
      const v = Number(src[k])
      if (!Number.isFinite(v) || v < 0 || v > 1e9) {
        throw new Error('costModel.' + k + ' must be a finite non-negative number ≤ 1e9')
      }
      out[k] = v
    }
  }
  return out
}

function mergeCostModels(
  parent: Record<string, number> | undefined,
  override: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!parent && !override) return undefined
  return { ...(parent || {}), ...(override || {}) }
}

type CountryRow = {
  code: string
  name: string
  tx: number
  mdrBps?: number
  avgTicket?: number
  note?: string
}

function validateCountries(input: unknown): CountryRow[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) throw new Error('countries must be an array')
  if (input.length > 20) throw new Error('countries: max 20 entries')
  const out: CountryRow[] = []
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (!c || typeof c !== 'object') throw new Error('countries[' + i + '] must be an object')
    const entry = c as Record<string, unknown>
    const tx = Number(entry.tx)
    if (!Number.isFinite(tx) || tx <= 0 || tx > 1e12) {
      throw new Error('countries[' + i + '].tx must be a positive number ≤ 1e12')
    }
    const codeRaw = typeof entry.code === 'string' ? entry.code.trim() : ''
    const nameRaw = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!codeRaw && !nameRaw) {
      throw new Error('countries[' + i + ']: code or name required')
    }
    const row: CountryRow = {
      code: (codeRaw || nameRaw).slice(0, 5).toUpperCase(),
      name: (nameRaw || codeRaw).slice(0, 40).toLowerCase(),
      tx: Math.round(tx),
    }
    if (entry.mdrBps !== undefined && entry.mdrBps !== null && entry.mdrBps !== '') {
      const m = Number(entry.mdrBps)
      if (!Number.isFinite(m) || m <= 0 || m > 1000) {
        throw new Error('countries[' + i + '].mdrBps must be a positive number ≤ 1000 (bps)')
      }
      row.mdrBps = m
    }
    if (entry.avgTicket !== undefined && entry.avgTicket !== null && entry.avgTicket !== '') {
      const a = Number(entry.avgTicket)
      if (!Number.isFinite(a) || a <= 0 || a > 1e6) {
        throw new Error('countries[' + i + '].avgTicket must be a positive number ≤ 1e6 (USD)')
      }
      row.avgTicket = a
    }
    if (typeof entry.note === 'string' && entry.note.trim()) {
      row.note = entry.note.trim().slice(0, 60)
    }
    out.push(row)
  }
  return out
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(origin) })
  }

  if (req.method !== 'POST') return err('Method not allowed', 405, origin)

  // Auth: shared secret with constant-time comparison
  const expectedToken = Deno.env.get('PRESENTATIONS_AGENT_TOKEN')
  if (!expectedToken) return err('Server misconfigured: PRESENTATIONS_AGENT_TOKEN not set', 500, origin)
  const provided = req.headers.get('x-agent-token') || req.headers.get('X-Agent-Token') || ''
  if (!timingSafeStrEqual(provided, expectedToken)) {
    return err('Invalid X-Agent-Token', 401, origin)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err('Invalid JSON body', 400, origin)
  }

  const supabase = createSupabaseClient()

  // Regeneration: load parent row. costModel is deep-merged (partial overrides keep other keys).
  let parentId: string | null = null
  let base: Record<string, unknown> = {}
  let baseOrgId: string | null = null
  const regenerateFrom = typeof body.regenerateFrom === 'string' ? body.regenerateFrom : undefined
  if (regenerateFrom) {
    const { data: parent, error: pErr } = await supabase
      .from('presentations')
      .select('id, org_id, defaults')
      .eq('slug', regenerateFrom)
      .maybeSingle()
    if (pErr) {
      console.error('bc-create: regenerate lookup error')
      return err('regenerateFrom lookup failed', 500, origin)
    }
    if (!parent) return err('regenerateFrom slug not found: ' + regenerateFrom, 404, origin)
    parentId = parent.id
    baseOrgId = parent.org_id
    base = (parent.defaults as Record<string, unknown>) || {}
  }

  const orgId = (typeof body.orgId === 'string' && body.orgId) || baseOrgId
  if (!orgId) return err('orgId is required', 400, origin)

  // pick: prefer body override, fall back to parent defaults. No permissive spread.
  const pick = <T = unknown>(k: string): T | undefined => {
    const v = body[k]
    return v !== undefined ? (v as T) : (base[k] as T)
  }

  const clientNameRaw = pick<string>('clientName')
  const clientName = typeof clientNameRaw === 'string' ? clientNameRaw.trim() : ''
  if (!clientName) return err('clientName is required', 400, origin)
  if (clientName.length > 100) return err('clientName too long (max 100)', 400, origin)

  let tpv: number, avgTicket: number, currentApproval: number, currentMDR: number, grossMargin: number
  let activeMarkets: number, currentAPMs: number, currentProviders: number, fteToday: number, fteTarget: number
  let approvalLiftPp: number, mdrReductionBps: number, apmUpliftPct: number, newAPMsAdded: number
  let integrationReductionPct: number, opsSavings: number
  let minTxAnnual: number, monthlySaaS: number, reconciliationFee: number
  let conservativeMult: number, optimisticMult: number, npvMultiplier: number
  let ratePerTx: number
  let rateTiers: Array<{ upToTx: number | null; ratePerTx: number }> = []
  let costModelMerged: Record<string, number> | undefined
  let pricingModel: 'flat' | 'tiered'
  let countries: CountryRow[] = []

  try {
    avgTicket = n('avgTicket', pick('avgTicket'), 1, 1e6)
    countries = validateCountries(pick('countries'))
    if (countries.length > 0) {
      const derivedTpv = countries.reduce(
        (acc, c) => acc + c.tx * (c.avgTicket ?? avgTicket),
        0,
      )
      if (!Number.isFinite(derivedTpv) || derivedTpv < 1 || derivedTpv > 1e12) {
        throw new Error('derived tpv from countries must be between 1 and 1e12')
      }
      tpv = derivedTpv
    } else {
      tpv = n('tpv', pick('tpv'), 1, 1e12)
    }
    currentApproval = n('currentApproval', pick('currentApproval'), 0.01, 100)
    currentMDR = n('currentMDR', pick('currentMDR'), 0.01, 10)
    grossMargin = n('grossMargin', pick('grossMargin'), 0.01, 100)
    activeMarkets = Math.round(n('activeMarkets', pick('activeMarkets') ?? 0, 0, 500))
    currentAPMs = Math.round(n('currentAPMs', pick('currentAPMs') ?? 0, 0, 10_000))
    currentProviders = Math.round(n('currentProviders', pick('currentProviders') ?? 0, 0, 500))
    fteToday = n('fteToday', pick('fteToday') ?? 4, 0, 10_000)
    fteTarget = n('fteTarget', pick('fteTarget') ?? 0.5, 0, 10_000)
    approvalLiftPp = n('approvalLiftPp', pick('approvalLiftPp') ?? 7.4, 0, 100)
    mdrReductionBps = n('mdrReductionBps', pick('mdrReductionBps') ?? 38, 0, 1_000)
    apmUpliftPct = n('apmUpliftPct', pick('apmUpliftPct') ?? 6, 0, 100)
    newAPMsAdded = Math.round(n('newAPMsAdded', pick('newAPMsAdded') ?? 180, 0, 10_000))
    integrationReductionPct = n('integrationReductionPct', pick('integrationReductionPct') ?? 85, 0, 100)
    opsSavings = n('opsSavings', pick('opsSavings') ?? 2_100_000, 0, 1e10)
    minTxAnnual = Math.round(n('minTxAnnual', pick('minTxAnnual') ?? 0, 0, 1e11))
    monthlySaaS = n('monthlySaaS', pick('monthlySaaS') ?? 0, 0, 1e8)
    reconciliationFee = n('reconciliationFee', pick('reconciliationFee') ?? 0, 0, 1e8)
    conservativeMult = n('conservativeMult', pick('conservativeMult') ?? 0.6, 0, 10)
    optimisticMult = n('optimisticMult', pick('optimisticMult') ?? 1.4, 0, 10)
    npvMultiplier = n('npvMultiplier', pick('npvMultiplier') ?? 2.6, 0, 100)

    const pm = pick('pricingModel')
    if (pm !== 'flat' && pm !== 'tiered') {
      throw new Error('pricingModel must be "flat" or "tiered"')
    }
    pricingModel = pm

    if (pricingModel === 'flat') {
      ratePerTx = n('ratePerTx', pick('ratePerTx'), 0.0001, 10)  // must be strictly > 0
    } else {
      ratePerTx = 0
      rateTiers = validateRateTiers(pick('rateTiers'))
    }

    const parentCost = validateCostModel(base.costModel)
    const bodyCost = validateCostModel(body.costModel)
    costModelMerged = mergeCostModels(parentCost, bodyCost)
  } catch (e) {
    return err((e as Error).message, 400, origin)
  }

  // todayProviders: trust body override first, then parent, else research.
  let todayProviders: string[] = []
  let rawResearch: unknown = null
  if (Array.isArray(body.todayProviders) && body.todayProviders.length > 0) {
    todayProviders = (body.todayProviders as unknown[])
      .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
      .filter((v): v is string => !!v)
      .slice(0, 12)
  } else if (Array.isArray(base.todayProviders) && (base.todayProviders as unknown[]).length > 0) {
    todayProviders = (base.todayProviders as unknown[])
      .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
      .filter((v): v is string => !!v)
      .slice(0, 12)
  } else {
    try {
      const research = await researchPaymentStack(clientName)
      todayProviders = research.providers
      rawResearch = research.raw
    } catch (e) {
      console.error('bc-create: research crashed')
      rawResearch = { error: 'research failed: ' + (e instanceof Error ? e.message : 'unknown') }
    }
  }

  // Slug generation: INSERT + catch unique-violation (23505). Retry up to 5×.
  const prefix = slugify(clientName)
  const defaults = {
    clientName,
    date: typeof pick('date') === 'string' ? pick('date') : '',
    tpv, avgTicket,
    countries,
    currentApproval, currentMDR,
    activeMarkets, currentAPMs, currentProviders,
    grossMargin,
    fteToday,
    todayProviders,
    pricingModel,
    ratePerTx,
    rateTiers,
    minTxAnnual,
    monthlySaaS,
    reconciliationFee,
    approvalLiftPp,
    mdrReductionBps,
    apmUpliftPct,
    newAPMsAdded,
    fteTarget,
    integrationReductionPct,
    opsSavings,
    conservativeMult,
    optimisticMult,
    npvMultiplier,
    costModel: costModelMerged,
  }

  let row: { id: string; slug: string; expires_at: string } | null = null
  let lastErrCode: string | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = prefix + '-' + randomSuffix(6)
    const { data, error: e } = await supabase
      .from('presentations')
      .insert({
        org_id: orgId,
        created_by: typeof body.createdBy === 'string' ? body.createdBy : null,
        kind: 'yuno_bc',
        client_name: clientName,
        slug: candidate,
        defaults,
        raw_research: rawResearch,
        parent_id: parentId,
      })
      .select('id, slug, expires_at')
      .single()
    if (!e) {
      row = data
      break
    }
    lastErrCode = (e as { code?: string }).code
    if (lastErrCode === '23505') continue // unique slug collision, retry
    break
  }

  if (!row) {
    console.error('bc-create: insert failed code=' + (lastErrCode || 'unknown'))
    return err('Insert failed', 500, origin)
  }

  return json({
    id: row.id,
    slug: row.slug,
    url: PUBLIC_BASE_URL + '/bc/' + row.slug,
    expiresAt: row.expires_at,
    providers: todayProviders,
    regeneratedFrom: parentId ? regenerateFrom : null,
  }, 200, origin)
})
