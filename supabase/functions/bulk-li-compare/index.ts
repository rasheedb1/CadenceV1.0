// One-shot utility: bulk LinkedIn lookup for a list of contacts.
// Accepts {org_id, contacts:[{contact_id,name,company,title_sf,email}]}.
// Resolves the org's Unipile account_id, then runs Unipile users/search
// "Name Company" for each contact, taking the top match. Returns
// {results:[{contact_id, sf_*, li_name, li_headline, li_position_title,
// li_position_company, li_location, li_provider_id, li_public_id, matched, error}]}.
// Adds a 1500ms delay between calls to respect Unipile rate limits.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function unipileGet(dsn: string, token: string, path: string) {
  const res = await fetch(`https://${dsn}${path}`, {
    headers: { 'X-API-KEY': token, accept: 'application/json' },
  })
  const txt = await res.text()
  try { return { ok: res.ok, status: res.status, data: JSON.parse(txt) } }
  catch { return { ok: res.ok, status: res.status, data: { _raw: txt } } }
}

async function unipilePost(dsn: string, token: string, path: string, body: any) {
  const res = await fetch(`https://${dsn}${path}`, {
    method: 'POST',
    headers: { 'X-API-KEY': token, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const txt = await res.text()
  try { return { ok: res.ok, status: res.status, data: JSON.parse(txt) } }
  catch { return { ok: res.ok, status: res.status, data: { _raw: txt } } }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { org_id, contacts } = await req.json() as {
      org_id: string
      contacts: Array<{ contact_id: string; name: string; company?: string; title_sf?: string; email?: string }>
    }
    if (!org_id || !Array.isArray(contacts) || contacts.length === 0) {
      return json({ error: 'org_id + non-empty contacts[] required' }, 400)
    }

    const dsn = Deno.env.get('UNIPILE_DSN')
    const token = Deno.env.get('UNIPILE_ACCESS_TOKEN')
    const supaUrl = Deno.env.get('SUPABASE_URL')
    const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!dsn || !token || !supaUrl || !supaKey) {
      return json({ error: 'missing env (UNIPILE_DSN/UNIPILE_ACCESS_TOKEN/SUPABASE_*)' }, 500)
    }

    const supa = createClient(supaUrl, supaKey)

    // Find the first connected LinkedIn account for any user in this org
    const { data: members } = await supa
      .from('organization_members')
      .select('user_id')
      .eq('org_id', org_id)
    const userIds = (members || []).map(m => m.user_id)
    if (userIds.length === 0) return json({ error: 'no members in org' }, 404)

    const { data: ua } = await supa
      .from('unipile_accounts')
      .select('account_id, user_id, status')
      .in('user_id', userIds)
      .eq('provider', 'LINKEDIN')
      .eq('status', 'active')
      .limit(1)
    const account_id = ua?.[0]?.account_id
    if (!account_id) return json({ error: 'no active LinkedIn unipile account in org' }, 404)

    const results: any[] = []
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i]
      const q = [c.name, c.company].filter(Boolean).join(' ').trim()
      try {
        // Sales Navigator people search by keywords (more generous rate limit)
        const sr = await unipilePost(
          dsn, token,
          `/api/v1/linkedin/search?account_id=${encodeURIComponent(account_id)}&limit=3`,
          { api: 'sales_navigator', category: 'people', keywords: q },
        )
        const items = (sr.data?.items || sr.data?.results || []) as any[]
        const top: any = items[0] || null

        // Confidence: company name fragment present in headline (case/accent-insensitive)
        const norm = (s: string) => (s || '')
          .normalize('NFKD').replace(/[̀-ͯ]/g, '')
          .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
        const companyTokens = norm(c.company || '').split(' ').filter(t => t.length >= 4)
        const headlineNorm = norm(top?.headline || '')
        const companyMatch = companyTokens.some(t => headlineNorm.includes(t))
        const nameNorm = norm(`${top?.first_name || top?.name || ''} ${top?.last_name || ''}`)
        const sfNameNorm = norm(c.name)
        const nameMatch = sfNameNorm.split(' ').filter(t => t.length >= 3).every(t => nameNorm.includes(t))
        const confidence = nameMatch && companyMatch ? 'high' : nameMatch ? 'medium' : top ? 'low' : 'none'

        results.push({
          contact_id: c.contact_id,
          sf_name: c.name,
          sf_company: c.company,
          sf_title: c.title_sf,
          sf_email: c.email,
          query: q,
          status: sr.status,
          matched: !!top,
          confidence,
          li_name: top ? `${top.first_name || top.name || ''} ${top.last_name || ''}`.trim() : null,
          li_headline: top?.headline || null,
          li_location: top?.location || null,
          li_public_id: top?.public_identifier || top?.public_id || null,
          li_provider_id: top?.provider_id || top?.id || null,
          li_premium: top?.is_premium ?? null,
          li_network_distance: top?.network_distance || null,
          alt_results: items.slice(1, 3).map((it: any) => ({
            name: `${it.first_name || it.name || ''} ${it.last_name || ''}`.trim(),
            headline: it.headline,
            public_id: it.public_identifier || it.public_id,
            location: it.location,
          })),
        })
      } catch (e) {
        results.push({ contact_id: c.contact_id, sf_name: c.name, sf_company: c.company, sf_title: c.title_sf, error: (e as Error).message })
      }
      if (i < contacts.length - 1) await new Promise(r => setTimeout(r, 600))
    }

    return json({ count: results.length, account_id, results })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
