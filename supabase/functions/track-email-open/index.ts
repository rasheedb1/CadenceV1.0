// Edge Function: Track Email Open
// GET /functions/v1/track-email-open?eid={event_id}
// Called by email clients loading the tracking pixel.
// Records an email_event, creates/bumps a notification, returns a 1x1 transparent GIF.
// No auth required — this is a public endpoint.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

// 1x1 transparent GIF (43 bytes)
const TRANSPARENT_GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0))

serve(async (req: Request) => {
  const url = new URL(req.url)
  const eventId = url.searchParams.get('eid')

  // Always return the pixel, even on errors (don't break email rendering)
  const pixelResponse = () =>
    new Response(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_GIF.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

  if (!eventId) return pixelResponse()

  try {
    const supabase = createSupabaseClient() // service-role, bypasses RLS

    // 1. Look up the email_messages record by event_id
    const { data: emailMsg } = await supabase
      .from('email_messages')
      .select('owner_user_id, lead_id, cadence_id, cadence_step_id, to_email, subject')
      .eq('event_id', eventId)
      .single()

    if (!emailMsg) {
      console.warn(`track-email-open: No email_messages found for event_id ${eventId}`)
      return pixelResponse()
    }

    // 2. Filter out sender's own open (first open within 30s is likely the sender)
    const userAgent = req.headers.get('User-Agent') || null
    const ipAddress = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
                      req.headers.get('CF-Connecting-IP') || null

    // Check if this is the very first open AND it happened shortly after sending.
    // The sender's mail client (e.g. Gmail Sent folder) loads the pixel almost instantly.
    // We only skip that first rapid open — all subsequent opens are counted normally,
    // even if they happen within the grace period.
    const { count: existingOpens } = await supabase
      .from('email_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('event_type', 'opened')

    if ((existingOpens ?? 0) === 0) {
      // This is the first open — check if it's too soon after sending (likely the sender)
      const { data: emailFull } = await supabase
        .from('email_messages')
        .select('sent_at')
        .eq('event_id', eventId)
        .single()

      if (emailFull?.sent_at) {
        const secondsSinceSent = (Date.now() - new Date(emailFull.sent_at).getTime()) / 1000

        if (secondsSinceSent < 30) {
          console.log(`Ignoring sender's first open: event_id=${eventId}, ${secondsSinceSent.toFixed(0)}s after send`)
          return pixelResponse()
        }
      }
    }

    // 3. Record the open event in email_events
    await supabase.from('email_events').insert({
      id: crypto.randomUUID(),
      event_id: eventId,
      owner_user_id: emailMsg.owner_user_id,
      lead_id: emailMsg.lead_id,
      cadence_id: emailMsg.cadence_id,
      cadence_step_id: emailMsg.cadence_step_id,
      event_type: 'opened',
      user_agent: userAgent,
      ip_address: ipAddress,
    })

    // 4. Count total opens for this event_id
    const { count: openCount } = await supabase
      .from('email_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('event_type', 'opened')

    const totalOpens = openCount || 1

    // 5. Get lead name for notification
    let leadName = 'Lead desconocido'
    if (emailMsg.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name')
        .eq('id', emailMsg.lead_id)
        .single()
      if (lead) {
        leadName = `${lead.first_name} ${lead.last_name}`.trim() || 'Lead desconocido'
      }
    }

    // 6. Check if notification already exists for this event_id
    const { data: existingNotif } = await supabase
      .from('notifications')
      .select('id, metadata')
      .eq('type', 'email_opened')
      .eq('owner_id', emailMsg.owner_user_id)
      .filter('metadata->>event_id', 'eq', eventId)
      .single()

    if (existingNotif) {
      // Bump existing notification: update count, move to top, mark unread
      const existingMeta = (existingNotif.metadata || {}) as Record<string, unknown>
      await supabase
        .from('notifications')
        .update({
          title: `${leadName} abrio tu correo${totalOpens > 1 ? ` (${totalOpens} veces)` : ''}`,
          body: `Asunto: ${emailMsg.subject || 'Sin asunto'}`,
          is_read: false,
          created_at: new Date().toISOString(),
          metadata: { ...existingMeta, open_count: totalOpens },
        })
        .eq('id', existingNotif.id)
    } else {
      // Create new notification
      await supabase.from('notifications').insert({
        owner_id: emailMsg.owner_user_id,
        lead_id: emailMsg.lead_id,
        cadence_id: emailMsg.cadence_id,
        type: 'email_opened',
        title: `${leadName} abrio tu correo`,
        body: `Asunto: ${emailMsg.subject || 'Sin asunto'}`,
        channel: 'email',
        metadata: {
          event_id: eventId,
          open_count: 1,
          to_email: emailMsg.to_email,
          subject: emailMsg.subject,
        },
      })
    }

    console.log(`Email open tracked: event_id=${eventId}, lead=${emailMsg.lead_id}, opens=${totalOpens}`)
  } catch (error) {
    console.error('Error tracking email open:', error)
    // Don't fail — always return the pixel
  }

  return pixelResponse()
})
