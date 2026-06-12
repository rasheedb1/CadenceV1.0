// Edge function: presentation-update
// Mutates an existing `presentations` row in place — same slug, same URL, new defaults.
// Validation rules mirror presentation-create. Auth: agent token, service role, or user JWT
// (JWT path additionally requires the user own the row via org membership or created_by).
//
// Method: POST with JSON body { slug, ...payloadFields }.
// Returns: { id, slug, url, expiresAt, providers }.

import { createSupabaseClient } from '../_shared/supabase.ts'

const PUBLIC_BASE_URL = 'https://chief.yuno.tools'

// Mirrors presentation-create. Adding a currency here keeps both functions in sync.
const SUPPORTED_CURRENCIES = new Set(['USD', 'MXN', 'BRL', 'COP', 'ARS', 'CLP', 'PEN', 'EUR', 'GBP'])
type Currency = 'USD' | 'MXN' | 'BRL' | 'COP' | 'ARS' | 'CLP' | 'PEN' | 'EUR' | 'GBP'

const ADDITIONAL_SERVICE_IDS = new Set([
  'risk_conditions',
  'external_3ds_api',
  'monitoring_alerts',
  'smart_routing',
  'network_tokens',
  'fraud_prevention_success',
  '3ds_transaction',
])

function validateAdditionalServices(input: unknown): Record<string, { enabled: boolean; price: number }> | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('additionalServices must be an object keyed by service id')
  }
  const out: Record<string, { enabled: boolean; price: number }> = {}
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!ADDITIONAL_SERVICE_IDS.has(id)) {
      throw new Error('additionalServices: unknown service id ' + id)
    }
    if (!raw || typeof raw !== 'object') {
      throw new Error('additionalServices.' + id + ' must be an object')
    }
    const entry = raw as Record<string, unknown>
    const enabled = entry.enabled === false ? false : true
    const priceNum = Number(entry.price)
    if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 10) {
      throw new Error('additionalServices.' + id + '.price must be a finite number in [0, 10]')
    }
    out[id] = { enabled, price: priceNum }
  }
  return out
}

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

function timingSafeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const ua = new TextEncoder().encode(a)
  const ub = new TextEncoder().encode(b)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

function n(name: string, v: unknown, min: number, max: number): number {
  const x = Number(v)
  if (!Number.isFinite(x) || x < min || x > max) {
    throw new Error(name + ' must be a finite number in [' + min + ', ' + max + '], got: ' + JSON.stringify(v))
  }
  return x
}

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

  // Auth: same 3 paths as presentation-create. JWT path adds an ownership check
  // below (must be in the row's org or be the row's creator).
  const expectedToken = Deno.env.get('PRESENTATIONS_AGENT_TOKEN')
  const serviceRoleFull = Deno.env.get('SERVICE_ROLE_KEY_FULL') || ''
  const serviceRoleAuto = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const provided = req.headers.get('x-agent-token') || req.headers.get('X-Agent-Token') || ''
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : ''
  const tokenOk = !!expectedToken && timingSafeStrEqual(provided, expectedToken)
  const bearerOk = !!bearer && (
    (!!serviceRoleFull && timingSafeStrEqual(bearer, serviceRoleFull)) ||
    (!!serviceRoleAuto && timingSafeStrEqual(bearer, serviceRoleAuto))
  )
  let jwtUser: { id: string; email?: string } | null = null
  if (!tokenOk && !bearerOk && bearer) {
    try {
      const adminClient = createSupabaseClient()
      const { data: userData, error: userErr } = await adminClient.auth.getUser(bearer)
      if (userData?.user && !userErr) {
        jwtUser = { id: userData.user.id, email: userData.user.email || undefined }
      }
    } catch { /* invalid jwt — fall through to 401 */ }
  }
  if (!tokenOk && !bearerOk && !jwtUser) {
    return err('Invalid auth: provide X-Agent-Token, service-role Bearer, or user JWT', 401, origin)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return err('Invalid JSON body', 400, origin)
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!slug) return err('slug is required', 400, origin)

  const supabase = createSupabaseClient()

  const { data: existing, error: lookupErr } = await supabase
    .from('presentations')
    .select('id, org_id, slug, expires_at, defaults, created_by, created_by_email')
    .eq('slug', slug)
    .maybeSingle()
  if (lookupErr) {
    console.error('bc-update: lookup error')
    return err('lookup failed', 500, origin)
  }
  if (!existing) return err('presentation not found: ' + slug, 404, origin)

  // JWT ownership check: user must be a member of the row's org OR be the row's creator
  // OR have created_by_email matching their auth email (cross-org ownership pattern).
  if (jwtUser) {
    const userEmail = (jwtUser.email || '').toLowerCase()
    const rowEmail = (existing.created_by_email || '').toLowerCase()
    const isCreator = existing.created_by && existing.created_by === jwtUser.id
    const isEmailMatch = !!userEmail && !!rowEmail && userEmail === rowEmail
    let isOrgMember = false
    if (!isCreator && !isEmailMatch && existing.org_id) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('user_id', jwtUser.id)
        .eq('org_id', existing.org_id)
        .maybeSingle()
      isOrgMember = !!membership
    }
    if (!isCreator && !isEmailMatch && !isOrgMember) {
      return err('forbidden: you do not own this presentation', 403, origin)
    }
  }

  const base = (existing.defaults as Record<string, unknown>) || {}

  // pick: prefer body override, fall back to existing defaults — same semantics
  // as presentation-create's regenerateFrom path. Lets the form send a partial
  // payload (e.g., only pricing changed) without losing untouched fields.
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
  let minTxAnnual: number, monthlySaaS: number, reconciliationFee: number, numNewIntegrations: number
  let salesName: string | undefined, salesTitle: string | undefined, salesEmail: string | undefined
  let locale: 'en' | 'es' | 'pt'
  let currency: Currency
  let conservativeMult: number, optimisticMult: number, npvMultiplier: number
  let ratePerTx: number
  let rateTiers: Array<{ upToTx: number | null; ratePerTx: number }> = []
  let costModelMerged: Record<string, number> | undefined
  let pricingModel: 'flat' | 'tramos' | 'tiers'
  let countries: CountryRow[] = []
  let additionalServicesValidated: Record<string, { enabled: boolean; price: number }> | undefined

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
    numNewIntegrations = Math.round(n('numNewIntegrations', pick('numNewIntegrations') ?? 0, 0, 1000))

    const pickStr = (k: string, max: number): string | undefined => {
      const v = pick(k)
      if (v == null) return undefined
      if (typeof v !== 'string') throw new Error(k + ' must be a string')
      const trimmed = v.trim()
      if (trimmed.length === 0) return undefined
      if (trimmed.length > max) throw new Error(k + ' too long (>' + max + ' chars)')
      return trimmed
    }
    salesName = pickStr('salesName', 100)
    salesTitle = pickStr('salesTitle', 80)
    salesEmail = pickStr('salesEmail', 100)
    if (salesEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(salesEmail)) {
      throw new Error('salesEmail must be a valid email')
    }
    const localeRaw = pick('locale')
    if (localeRaw === undefined || localeRaw === null || localeRaw === '') {
      locale = 'en'
    } else if (localeRaw === 'en' || localeRaw === 'es' || localeRaw === 'pt') {
      locale = localeRaw
    } else {
      throw new Error('locale must be "en", "es" or "pt"')
    }

    const currencyRaw = pick('currency')
    if (currencyRaw === undefined || currencyRaw === null || currencyRaw === '') {
      currency = 'USD'
    } else if (typeof currencyRaw === 'string' && SUPPORTED_CURRENCIES.has(currencyRaw)) {
      currency = currencyRaw as Currency
    } else {
      throw new Error('currency must be one of: ' + Array.from(SUPPORTED_CURRENCIES).join(', '))
    }

    conservativeMult = n('conservativeMult', pick('conservativeMult') ?? 0.6, 0, 10)
    optimisticMult = n('optimisticMult', pick('optimisticMult') ?? 1.4, 0, 10)
    npvMultiplier = n('npvMultiplier', pick('npvMultiplier') ?? 2.6, 0, 100)

    const pmRaw = pick('pricingModel')
    const pm = pmRaw === 'tiered' ? 'tramos' : pmRaw
    if (pm !== 'flat' && pm !== 'tramos' && pm !== 'tiers') {
      throw new Error('pricingModel must be "flat", "tramos" or "tiers"')
    }
    pricingModel = pm

    if (pricingModel === 'flat') {
      ratePerTx = n('ratePerTx', pick('ratePerTx'), 0.0001, 10)
    } else {
      ratePerTx = 0
      rateTiers = validateRateTiers(pick('rateTiers'))
    }

    const baseCost = validateCostModel(base.costModel)
    const bodyCost = validateCostModel(body.costModel)
    costModelMerged = mergeCostModels(baseCost, bodyCost)

    const bodyServices = validateAdditionalServices(body.additionalServices)
    const baseServices = validateAdditionalServices(base.additionalServices)
    additionalServicesValidated = bodyServices !== undefined ? bodyServices : baseServices
  } catch (e) {
    return err((e as Error).message, 400, origin)
  }

  // todayProviders: trust body override first, then existing defaults. Unlike create,
  // an empty list does NOT trigger Firecrawl re-research — edits should be deterministic
  // and fast. If the AE wants a fresh research pass they can use Regenerar instead.
  let todayProviders: string[] = []
  if (Array.isArray(body.todayProviders) && body.todayProviders.length > 0) {
    todayProviders = (body.todayProviders as unknown[])
      .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
      .filter((v): v is string => !!v)
      .slice(0, 12)
  } else if (Array.isArray(base.todayProviders)) {
    todayProviders = (base.todayProviders as unknown[])
      .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
      .filter((v): v is string => !!v)
      .slice(0, 12)
  }

  const defaults = {
    clientName,
    locale,
    currency,
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
    numNewIntegrations,
    salesName,
    salesTitle,
    salesEmail,
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
    additionalServices: additionalServicesValidated,
  }

  const { data: updated, error: updErr } = await supabase
    .from('presentations')
    .update({
      client_name: clientName,
      defaults,
    })
    .eq('id', existing.id)
    .select('id, slug, expires_at')
    .single()

  if (updErr || !updated) {
    console.error('bc-update: update failed', updErr)
    return err('Update failed', 500, origin)
  }

  return json({
    id: updated.id,
    slug: updated.slug,
    url: PUBLIC_BASE_URL + '/bc/' + updated.slug,
    expiresAt: updated.expires_at,
    providers: todayProviders,
  }, 200, origin)
})
