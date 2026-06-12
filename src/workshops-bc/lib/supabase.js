// Reads workshops_bc rows for the /workshop/<slug> route. Reuses Chief's
// existing Supabase client (the deck is a lazy module mounted in the SPA).
//
// toSlideData() flattens the row into a stable shape consumed by every
// slide so we can rename DB columns without touching slide components.
import { supabase } from '../../integrations/supabase/client'

export { supabase }

export async function fetchWorkshopContent(slug) {
  if (!supabase || !slug) return null
  const { data, error } = await supabase
    .from('workshops_bc')
    .select('slug, client_name, client_logo, country, language, currency, workshop_title, workshop_date, attendees, inputs, business_case, research, content_source, created_at')
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.warn('[workshops-bc] fetch failed', error)
    return null
  }
  return data
}

// Flatten a workshops_bc row into the data shape every slide consumes.
// Keep the field names UPPER_SNAKE to match the ss-deck convention and
// let SlideBase's existing logo treatment work unchanged.
export function toSlideData(row) {
  if (!row) return null
  return {
    CLIENT_NAME: row.client_name,
    CLIENT_LOGO: row.client_logo || null,
    COMPANY_NAME: row.client_name,          // alias for SlideBase top-bar
    COMPANY_LOGO: row.client_logo || null,  // alias for viewer logo strip
    COMPANY_SLUG: row.slug,
    COUNTRY: row.country || null,
    LANGUAGE: row.language || 'es',
    CURRENCY: row.currency || 'USD',
    WORKSHOP_TITLE: row.workshop_title || null,
    WORKSHOP_DATE: row.workshop_date || null,
    ATTENDEES: Array.isArray(row.attendees) ? row.attendees : [],
    INPUTS: row.inputs || {},
    BUSINESS_CASE: row.business_case || {},
    RESEARCH: row.research || null,
    CONTENT_SOURCE: row.content_source || 'inputs_only',
  }
}
