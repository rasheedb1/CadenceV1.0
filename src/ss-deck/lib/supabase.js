// Reuses Chief's existing Supabase client so we don't double-instantiate
// (the SSDeck route is a small lazy module mounted inside the same SPA).
// Reads from merchants_ss (Stripe Sessions deck table) — distinct from
// the upstream repo's `merchants`, which Chief also doesn't have.
import { supabase } from '../../integrations/supabase/client'

export { supabase }

export async function fetchMerchantContent(slug) {
  if (!supabase || !slug) return null
  const { data, error } = await supabase
    .from('merchants_ss')
    // language + currency added by migration 147. SELECT them so cold-link
    // visitors see the deck in the language the row was generated in. The
    // default in the migration is 'en' / 'USD', so pre-migration rows render
    // identically to before.
    .select('slug, name, logo, logo_mono, greeting, mode, language, currency, show_psp_roles, pain_titles, psps, psps_disclaimer, missing_methods, capability_titles, capability_descs, capabilities_live, vendor_name, vendor_title')
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.warn('[supabase] fetchMerchantContent failed', error)
    return null
  }
  return data
}

// Adapt the merchants_ss row into the flat shape the slides consume
// (PAIN_N_TITLE, PSPS, LOCAL_METHODS_MISSING, CAPABILITY_N_TITLE/DESC).
// Mirrors the upstream toSlideData() so slide components stay unchanged.
export function toSlideData(row) {
  if (!row) return null
  const pains = row.pain_titles || []
  const caps = row.capability_titles || []
  const descs = row.capability_descs || []
  return {
    COMPANY_NAME: row.name,
    COMPANY_LOGO: row.logo || null,
    COMPANY_LOGO_MONO: row.logo_mono || null,
    COMPANY_GREETING: row.greeting || null,
    COMPANY_SLUG: row.slug,
    // Multilingual fields (Phase 3.D). Defaults preserve EN/USD for pre-
    // migration rows where the columns may be null until the row is touched.
    LANGUAGE: row.language || 'en',
    CURRENCY: row.currency || 'USD',
    SHOW_PSP_ROLES: row.show_psp_roles === true,
    PAIN_1_TITLE: pains[0],
    PAIN_2_TITLE: pains[1],
    PAIN_3_TITLE: pains[2],
    PAIN_4_TITLE: pains[3],
    PAIN_5_TITLE: pains[4],
    PSPS: row.psps || [],
    PSPS_DISCLAIMER: row.psps_disclaimer || null,
    LOCAL_METHODS_MISSING: row.missing_methods || [],
    CAPABILITY_1_TITLE: caps[0],
    CAPABILITY_1_DESC: descs[0],
    CAPABILITY_2_TITLE: caps[1],
    CAPABILITY_2_DESC: descs[1],
    CAPABILITY_3_TITLE: caps[2],
    CAPABILITY_3_DESC: descs[2],
    CAPABILITY_4_TITLE: caps[3],
    CAPABILITY_4_DESC: descs[3],
    CAPABILITIES_LIVE: row.capabilities_live || [],
    // Vendor (AE) shown on cover + CTA "Prepared by". Both null when the
    // row predates mig 148 OR the wizard left them blank — slides fall back
    // to the generic Yuno Sales Team copy.
    VENDOR_NAME: row.vendor_name || null,
    VENDOR_TITLE: row.vendor_title || null,
  }
}
