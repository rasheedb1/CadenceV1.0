// Edge Function: track-presentation-slide
// Public, unauthenticated. Receives per-slide dwell-time events from /bc/<slug>.
// Supports sendBeacon: accepts application/json OR text/plain bodies.
// Upserts (view_id, slide_index) — dwell_ms accumulates across events for the same slide.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SlideEvent {
  slide_index: number
  dwell_ms: number
}

interface RequestBody {
  session_id?: string
  events?: SlideEvent[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req: Request) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  if (req.method !== 'POST') return errorResponse('POST required', 405)

  let body: RequestBody
  try {
    // sendBeacon may send as text/plain — read raw text and parse manually.
    const raw = await req.text()
    body = raw ? JSON.parse(raw) : {}
  } catch {
    return errorResponse('Invalid JSON body')
  }

  const sessionId = (body.session_id || '').trim()
  const events = Array.isArray(body.events) ? body.events : []

  if (!UUID_RE.test(sessionId)) return errorResponse('valid session_id required')
  if (!events.length) return jsonResponse({ ok: true, recorded: 0 })

  // Sanitize events
  const cleaned = events
    .filter(e => Number.isInteger(e.slide_index) && e.slide_index >= 0 && e.slide_index < 200)
    .filter(e => Number.isFinite(e.dwell_ms) && e.dwell_ms > 0 && e.dwell_ms < 30 * 60 * 1000)
    .map(e => ({ slide_index: e.slide_index, dwell_ms: Math.round(e.dwell_ms) }))

  if (!cleaned.length) return jsonResponse({ ok: true, recorded: 0 })

  // Aggregate per slide_index in case the client sent multiple events for the same slide.
  const aggregated = new Map<number, number>()
  for (const e of cleaned) {
    aggregated.set(e.slide_index, (aggregated.get(e.slide_index) || 0) + e.dwell_ms)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verify the session actually exists (cheap guard against random UUIDs hammering the table).
  const { data: view } = await supabase
    .from('presentation_views')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!view) return errorResponse('unknown session_id', 404)

  // Upsert each (view_id, slide_index). For accumulation, fetch existing row first.
  // We can't use ON CONFLICT DO UPDATE with column arithmetic via the supabase-js client,
  // so we read-then-write per slide. Volume is low (≤ slide count per call), so this is fine.
  let recorded = 0
  for (const [slideIndex, dwellMs] of aggregated) {
    const { data: existing } = await supabase
      .from('presentation_slide_views')
      .select('id, dwell_ms')
      .eq('view_id', sessionId)
      .eq('slide_index', slideIndex)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('presentation_slide_views')
        .update({ dwell_ms: existing.dwell_ms + dwellMs, recorded_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (!error) recorded++
    } else {
      const { error } = await supabase
        .from('presentation_slide_views')
        .insert({ view_id: sessionId, slide_index: slideIndex, dwell_ms: dwellMs })
      if (!error) recorded++
    }
  }

  return jsonResponse({ ok: true, recorded })
})
