-- 143_seed_ss_deck_skill
-- =============================================================================
-- Registers the ss-deck-generate edge function as a skill agents can invoke
-- via call_skill. Distinct from generate-business-case (yuno_bc) and
-- sdr-bc-generate — this is the 21-slide visual deck at /m/<slug>.
--
-- chief-deep-research-company TTL is 30 days, shared across ALL skills that
-- pull payment-stack intelligence (yuno-bc, sdr-bc, ss-deck, ai-research-generate).
-- A single research run per company powers every downstream skill for 30d.
-- =============================================================================

INSERT INTO public.skill_registry
  (name, display_name, description, category, skill_definition, requires_integrations, is_system)
VALUES (
  'ss_deck_generate',
  'Generar SS Deck (Yuno + Cliente)',
  'Genera un deck visual de 21 slides estilo Stripe Sessions para un cliente. Investiga el top-4 acquirers via chief-deep-research-company (con regional fallback). Devuelve URL pública chief.yuno.tools/m/<slug>.',
  'sales',
  E'Calls ss-deck-generate edge function. Generates a 21-slide visual deck (Cover, Diagnostic, Yuno Solve, Product Suite, Global Presence, Leadership). Distinct from business_case (commercial BC) and sdr_bc (prospecting math) — this is the visual storytelling deck.\n\nParams:\n- company_name (required): exact casing, e.g. "Walmart" not "walmart"\n- website (optional): e.g. "walmart.com". If omitted, auto-resolved via Firecrawl.\n- mode (optional): "merchant" (default), "banking", or "partner"\n- logo (optional): absolute URL to white-on-transparent logo for the cover\n- greeting (optional): cover greeting override (default: "Hello {company} team!")\n\nReturns:\n{\n  url: "https://chief.yuno.tools/m/<slug>",\n  slug: "<slug>",\n  company_name: "<name>",\n  content_source: "research" | "regional_fallback" | "template",\n  region: "us"|"lat"|"ema"|"apa" | null,\n  domain: "<resolved.com>",\n  acquirers: ["Chase Paymentech", ...]\n}\n\nNotes:\n- Cost: $0.30-0.50 first hit per company (deep-research). Cached 30 days — subsequent calls for same company are ~free.\n- Latency: 5-10s cache hit, 20-45s cache miss.\n- The URL is public (no expiration) — share as cold link.\n- PDF available at https://bridge.yuno.tools/api/m/<slug>/pdf.\n- This skill is also usable as a cadence step type (generate_ss_deck) — when run inside a cadence, the deck URL is persisted to cadence_lead_state so subsequent send_email steps can interpolate {{deck_url}}.',
  '{}',
  true
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  skill_definition = EXCLUDED.skill_definition;
