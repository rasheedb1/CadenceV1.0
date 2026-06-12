// Edge Function: track-presentation-view
// Public, unauthenticated. Called from /bc/<slug> after viewer enters email in the gate modal.
// Logs the visit, geolocates the IP, sends a Gmail self-note to the AE who created the BC.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getValidGmailToken, getGmailTokenByEmail, buildRfc2822, sendGmailMessage } from '../_shared/gmail.ts'

interface RequestBody {
  slug?: string
  viewer_email?: string
}

interface IpInfo {
  country?: string
  regionName?: string
  city?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function geolocateIp(ip: string | null): Promise<IpInfo> {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return {}
  }
  try {
    const resp = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!resp.ok) return {}
    const data = await resp.json()
    if (data.status !== 'success') return {}
    return { country: data.country, regionName: data.regionName, city: data.city }
  } catch {
    return {}
  }
}

function extractClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

function notificationHtml({
  clientName,
  viewerEmail,
  ip,
  city,
  country,
  userAgent,
  slug,
  locale,
}: {
  clientName: string
  viewerEmail: string
  ip: string
  city: string | null
  country: string | null
  userAgent: string
  slug: string
  locale: 'es' | 'en' | 'pt'
}): { subject: string; html: string } {
  const unknownLoc = locale === 'es' ? 'ubicación desconocida' : locale === 'pt' ? 'localização desconhecida' : 'unknown location'
  const where = [city, country].filter(Boolean).join(', ') || unknownLoc
  const deckUrl = `https://chief.yuno.tools/bc/${slug}`
  const dashUrl = `https://chief.yuno.tools/presentaciones`
  const localeTag = locale === 'es' ? 'es-MX' : locale === 'pt' ? 'pt-BR' : 'en-US'
  const now = new Date().toLocaleString(localeTag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  let t
  if (locale === 'es') {
    t = {
      subject: `Alguien vio tu BC de ${clientName}`,
      eyebrow: 'BUSINESS CASE ABIERTO',
      title: `${viewerEmail} acaba de abrir tu BC`,
      intro: `Alguien con el correo <strong>${viewerEmail}</strong> abrió el business case de <strong>${clientName}</strong>.`,
      whenLabel: 'Cuándo',
      whereLabel: 'Dónde',
      ipLabel: 'IP',
      deviceLabel: 'Dispositivo',
      ctaDeck: 'Ver el deck',
      ctaDash: 'Abrir Presentaciones',
    }
  } else if (locale === 'pt') {
    t = {
      subject: `Alguém viu seu BC de ${clientName}`,
      eyebrow: 'BUSINESS CASE ABERTO',
      title: `${viewerEmail} acabou de abrir seu BC`,
      intro: `Alguém com o e-mail <strong>${viewerEmail}</strong> abriu o business case de <strong>${clientName}</strong>.`,
      whenLabel: 'Quando',
      whereLabel: 'Onde',
      ipLabel: 'IP',
      deviceLabel: 'Dispositivo',
      ctaDeck: 'Ver o deck',
      ctaDash: 'Abrir Presentaciones',
    }
  } else {
    t = {
      subject: `Someone viewed your BC for ${clientName}`,
      eyebrow: 'BUSINESS CASE OPENED',
      title: `${viewerEmail} just opened your BC`,
      intro: `Someone with email <strong>${viewerEmail}</strong> opened the business case for <strong>${clientName}</strong>.`,
      whenLabel: 'When',
      whereLabel: 'Where',
      ipLabel: 'IP',
      deviceLabel: 'Device',
      ctaDeck: 'View deck',
      ctaDash: 'Open Presentaciones',
    }
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070B;font-family:'Titillium Web',-apple-system,BlinkMacSystemFont,sans-serif;color:#fff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#06070B;padding:40px 16px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:linear-gradient(180deg,#1A1F35 0%,#0E1124 100%);border:1px solid rgba(140,153,255,0.12);border-radius:16px;overflow:hidden">
      <tr><td style="padding:36px 36px 8px">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(140,153,255,0.9);font-weight:700">${t.eyebrow}</div>
        <h1 style="font-size:28px;font-weight:300;letter-spacing:-0.01em;color:#fff;margin:14px 0 0;line-height:1.25">${t.title}</h1>
      </td></tr>
      <tr><td style="padding:8px 36px 20px">
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.78);margin:8px 0 24px">${t.intro}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px">
          <tr><td style="padding:14px 18px;font-size:13px;color:rgba(255,255,255,0.5);width:90px">${t.whenLabel}</td><td style="padding:14px 18px 14px 0;font-size:13px;color:#fff">${now}</td></tr>
          <tr><td style="padding:0 18px 14px;font-size:13px;color:rgba(255,255,255,0.5)">${t.whereLabel}</td><td style="padding:0 18px 14px 0;font-size:13px;color:#fff">${where}</td></tr>
          <tr><td style="padding:0 18px 14px;font-size:13px;color:rgba(255,255,255,0.5)">${t.ipLabel}</td><td style="padding:0 18px 14px 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:ui-monospace,Menlo,monospace">${ip}</td></tr>
          <tr><td style="padding:0 18px 14px;font-size:13px;color:rgba(255,255,255,0.5);vertical-align:top">${t.deviceLabel}</td><td style="padding:0 18px 14px 0;font-size:12px;color:rgba(255,255,255,0.6);word-break:break-word">${userAgent || '—'}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:8px 36px 36px" align="left">
        <a href="${deckUrl}" style="display:inline-block;background:#E0ED80;color:#06070B;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;margin-right:10px">${t.ctaDeck}</a>
        <a href="${dashUrl}" style="display:inline-block;background:transparent;color:#E0ED80;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border:1px solid rgba(224,237,128,0.4);border-radius:8px">${t.ctaDash}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`

  return { subject: t.subject, html }
}

serve(async (req: Request) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  if (req.method !== 'POST') return errorResponse('POST required', 405)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }

  const slug = (body.slug || '').trim()
  const viewerEmail = (body.viewer_email || '').trim().toLowerCase()

  if (!slug) return errorResponse('slug required')
  if (!viewerEmail || !EMAIL_RE.test(viewerEmail)) return errorResponse('valid viewer_email required')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Look up presentation
  const { data: pres, error: presErr } = await supabase
    .from('presentations')
    .select('id, org_id, client_name, created_by, created_by_email, defaults, archived')
    .eq('slug', slug)
    .maybeSingle()

  if (presErr || !pres) return errorResponse('presentation not found', 404)
  if (pres.archived) return errorResponse('presentation archived', 410)

  // 2. Capture viewer context
  const ip = extractClientIp(req)
  const userAgent = req.headers.get('user-agent') || ''
  const geo = await geolocateIp(ip)

  // 3. Insert view row (id doubles as session_id)
  const { data: view, error: insErr } = await supabase
    .from('presentation_views')
    .insert({
      presentation_id: pres.id,
      org_id: pres.org_id,
      slug,
      viewer_email: viewerEmail,
      viewer_ip: ip,
      viewer_user_agent: userAgent,
      viewer_country: geo.country || null,
      viewer_region: geo.regionName || null,
      viewer_city: geo.city || null,
      notification_status: 'pending',
    })
    .select('id')
    .single()

  if (insErr || !view) {
    console.error('track-presentation-view: insert failed', insErr)
    return errorResponse('failed to log view', 500)
  }

  const sessionId = view.id

  // 4. Send Gmail self-note (best-effort, never blocks the response).
  // Lookup order: created_by_email (cross-org by Gmail) → fallback to created_by/org_id legacy.
  ;(async () => {
    try {
      let gmail: Awaited<ReturnType<typeof getValidGmailToken>> = null
      if (pres.created_by_email) {
        gmail = await getGmailTokenByEmail(supabase, pres.created_by_email)
      } else if (pres.created_by) {
        gmail = await getValidGmailToken(supabase, pres.created_by, pres.org_id)
      }
      if (!gmail || !gmail.email) {
        await supabase.from('presentation_views').update({ notification_status: 'skipped_no_gmail', notification_error: pres.created_by_email || pres.created_by ? 'no gmail integration found' : 'no owner on presentation' }).eq('id', sessionId)
        return
      }

      const rawLocale = (pres.defaults && typeof pres.defaults === 'object') ? (pres.defaults as { locale?: string }).locale : undefined
      const locale: 'es' | 'en' | 'pt' = rawLocale === 'es' || rawLocale === 'pt' ? rawLocale : 'en'
      const { subject, html } = notificationHtml({
        clientName: pres.client_name,
        viewerEmail,
        ip,
        city: geo.city || null,
        country: geo.country || null,
        userAgent,
        slug,
        locale,
      })

      const rfc = buildRfc2822({
        to: gmail.email,
        from: gmail.email,
        subject,
        html,
      })
      const result = await sendGmailMessage({ token: gmail.token, rfc2822: rfc })

      if (result.ok) {
        await supabase.from('presentation_views').update({ notification_status: 'sent' }).eq('id', sessionId)
      } else {
        await supabase.from('presentation_views').update({ notification_status: 'failed', notification_error: result.error?.slice(0, 500) || `HTTP ${result.status}` }).eq('id', sessionId)
        console.error('track-presentation-view: gmail send failed', result.status, result.error)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('track-presentation-view: notification error', msg)
      await supabase.from('presentation_views').update({ notification_status: 'failed', notification_error: msg.slice(0, 500) }).eq('id', sessionId)
    }
  })()

  return jsonResponse({ session_id: sessionId, presentation_id: pres.id })
})
