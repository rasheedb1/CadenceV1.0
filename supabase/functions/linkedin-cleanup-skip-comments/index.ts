// Cleanup + diagnostic tool for the SKIP_COMMENT incident.
//
// Modes:
//   - probeOnly=true              → returns raw comments of one post for inspection
//   - diagnose=true               → for each SKIP_COMMENT-affected post, fetches the original post text
//                                    and classifies why the deterministic skip gate fired
//   - dryRun=true (default false) → attempts DELETE via Unipile (KNOWN to be unsupported by Unipile)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface CleanupRequest {
  ownerId: string
  orgId: string
  dryRun?: boolean
  probeOnly?: boolean
  diagnose?: boolean
  postIdOverride?: string
}

const SKIP_RE = /skip[\s_]*comment/i

// Mirror of the V10 blacklist-only gate in ai-research-generate/index.ts
// (post 2026-05-18). Kept in sync so we can preview what the gate will do.
const skipPatterns: RegExp[] = [
  /\bi'?m\s+hiring\b/i,
  /\b(we'?re|i'?m)\s+(hiring|looking\s+for)\b/i,
  /\bjoin\s+(my|our)\s+team\b/i,
  /\bnew\s+role\s+alert\b/i,
  /\b(apply(ing)?|application)\s+(here|now|today|via|by)\b/i,
  /\b(open|hiring|new)\s+(position|role|vacancy|vacancies|opening)s?\b/i,
  /\b(hiring|seeking)\s+(a|an)\s+\w+/i,
  /\bcheck\s+out\s+this\s+job\b/i,
  /\bsenior\s+(associate|manager|analyst|director|engineer)\s+role\b/i,
  /\bi'?m\s+(starting|happy\s+to\s+share\s+i'?m\s+starting)\s+a\s+new\s+(position|role|chapter)\b/i,
  /\bafter\s+\d+\s+(amazing\s+)?(years?|months?)\s+at\b/i,
  /\bover\s+\d+\s+years?\s+at\s+\w+/i,
  /\bexcited\s+to\s+(announce|share)\s+(my|i\s+(am|will|have))\b/i,
  /\b(rest\s+in\s+peace|passed\s+away|in\s+loving\s+memory|rip\b)/i,
  /\b(my\s+(birthday|anniversary|wedding|baby))\b/i,
  /\b(estamos|seguimos)\s+(buscando|contratando|en\s+(la\s+)?b[úu]squeda)\b/i,
  /\bbuscamos\s+(un|una|a)\s+/i,
  /\b(se\s+busca|se\s+necesita)\s+/i,
  /\b(abrimos|hay)\s+(una\s+)?(vacante|posici[óo]n|puesto)\b/i,
  /\b¡?(¿)?te\s+(apasiona|gustar[íi]a|interesa)\b.{0,40}(postula|apl[íi]ca|env[íi]a\s+tu\s+cv|p[óo]stulate)\b/i,
  /\bpostula(te|r)?\s+(aqu[íi]|ahora|hoy)\b/i,
  /\b(empiezo|comienzo|inicio)\s+(una\s+)?(nueva\s+(etapa|posici[óo]n|aventura))\b/i,
  /\b(tras|despu[ée]s\s+de)\s+\d+\s+(a[ñn]os|meses)\s+en\b/i,
  /\b(descanse\s+en\s+paz|q\.?e\.?p\.?d\.?|fallecimiento|en\s+memoria\s+de)\b/i,
]

function classifyPost(text: string): { skip_reason: string | null; matched_pattern: string | null } {
  const lower = (text || '').toLowerCase()
  if (!text || text.length < 30) return { skip_reason: 'no_post_or_too_short', matched_pattern: null }
  const hit = skipPatterns.find(p => p.test(lower))
  if (hit) return { skip_reason: 'personal_or_hiring_post', matched_pattern: hit.source }
  return { skip_reason: null, matched_pattern: null }
}

async function unipileRequest(
  method: string,
  path: string,
  dsn: string,
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://${dsn}${path}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': token },
  })
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* keep as text */ }
  return { ok: res.ok, status: res.status, body }
}

interface RawComment {
  id?: string
  comment_id?: string
  text?: string
  body?: string
  [k: string]: unknown
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body: CleanupRequest = await req.json()
    const { ownerId, orgId, dryRun = false, probeOnly = false, diagnose = false, postIdOverride } = body
    if (!ownerId || !orgId) return errorResponse('ownerId and orgId required', 400)

    const dsn = Deno.env.get('UNIPILE_DSN')
    const token = Deno.env.get('UNIPILE_ACCESS_TOKEN')
    if (!dsn || !token) return errorResponse('Missing Unipile env', 500)

    const supabase = createSupabaseClient()

    const { data: ua } = await supabase
      .from('unipile_accounts')
      .select('account_id')
      .eq('user_id', ownerId)
      .eq('provider', 'LINKEDIN')
      .eq('status', 'active')
      .single()
    if (!ua?.account_id) return errorResponse('No active LinkedIn Unipile account for owner', 404)
    const accountId = ua.account_id as string

    // Pull candidate posts from DB
    const { data: alRows } = await supabase
      .from('activity_log')
      .select('id, lead_id, cadence_step_id, details, created_at')
      .eq('owner_id', ownerId)
      .eq('org_id', orgId)
      .eq('action', 'linkedin_comment')
      .eq('status', 'ok')
      .order('created_at', { ascending: false })
      .limit(500)

    const offending: Array<{ post_id: string; lead_id: string }> = []
    for (const r of (alRows || [])) {
      const pid = (r.details as { postId?: string })?.postId
      if (!pid || !r.lead_id || !r.cadence_step_id) continue
      const { data: qr } = await supabase
        .from('message_qa_reviews')
        .select('generated_message')
        .eq('lead_id', r.lead_id)
        .eq('cadence_step_id', r.cadence_step_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (qr?.generated_message && SKIP_RE.test(qr.generated_message)) {
        offending.push({ post_id: pid, lead_id: r.lead_id })
      }
    }
    const uniquePostIds = Array.from(new Set(offending.map(p => p.post_id)))

    if (probeOnly) {
      const probePostId = postIdOverride || uniquePostIds[0]
      const encoded = encodeURIComponent(probePostId)
      const list = await unipileRequest('GET', `/api/v1/posts/${encoded}/comments?account_id=${accountId}&limit=50`, dsn, token)
      return jsonResponse({ probePostId, list_status: list.status, body_sample: list.body })
    }

    if (diagnose) {
      // For each offending post, fetch the original post text from Unipile
      // and classify why the deterministic skip gate fired.
      const rows: Array<{
        post_id: string
        lead_id: string
        post_text_preview: string | null
        post_length: number
        skip_reason_now: string | null
        matched_pattern: string | null
        unipile_status: number
      }> = []
      for (const { post_id, lead_id } of offending) {
        const encoded = encodeURIComponent(post_id)
        const r = await unipileRequest('GET', `/api/v1/posts/${encoded}?account_id=${accountId}`, dsn, token)
        let text: string | null = null
        if (r.ok && r.body && typeof r.body === 'object') {
          const b = r.body as Record<string, unknown>
          text = (b.text || b.body || b.content || null) as string | null
        }
        const cls = classifyPost(text || '')
        rows.push({
          post_id,
          lead_id,
          post_text_preview: text ? text.slice(0, 220) : null,
          post_length: text ? text.length : 0,
          skip_reason_now: cls.skip_reason,
          matched_pattern: cls.matched_pattern,
          unipile_status: r.status,
        })
        await new Promise(r => setTimeout(r, 250))
      }
      const summary: Record<string, number> = {}
      for (const r of rows) {
        const k = r.skip_reason_now || '__would_have_passed__'
        summary[k] = (summary[k] || 0) + 1
      }
      return jsonResponse({ success: true, summary, rows })
    }

    // Delete path (KNOWN broken — Unipile lacks DELETE for comments)
    const results: Array<{ post_id: string; matched: string[]; deleted: string[]; attempts: Array<{ status: number; path: string }> }> = []
    for (const postId of uniquePostIds) {
      const encoded = encodeURIComponent(postId)
      const list = await unipileRequest('GET', `/api/v1/posts/${encoded}/comments?account_id=${accountId}&limit=100`, dsn, token)
      const items: RawComment[] = Array.isArray((list.body as { items?: RawComment[] })?.items)
        ? (list.body as { items: RawComment[] }).items : []
      const matched = items.filter(c => SKIP_RE.test((c.text || c.body || '') as string)).map(c => String(c.id || c.comment_id || ''))
      const deleted: string[] = []
      const attempts: Array<{ status: number; path: string }> = []
      if (!dryRun) {
        for (const cid of matched) {
          const path = `/api/v1/posts/${encoded}/comments/${encodeURIComponent(cid)}?account_id=${accountId}`
          const d = await unipileRequest('DELETE', path, dsn, token)
          attempts.push({ status: d.status, path })
          if (d.ok) deleted.push(cid)
        }
      }
      results.push({ post_id: postId, matched, deleted, attempts })
    }
    return jsonResponse({ success: true, summary: { posts: results.length }, results })
  } catch (e) {
    console.error('cleanup error', e)
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500)
  }
})
