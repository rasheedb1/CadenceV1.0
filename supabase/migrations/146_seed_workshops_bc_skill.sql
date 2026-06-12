-- 146_seed_workshops_bc_skill
-- =============================================================================
-- Registers the workshops-bc-generate edge function as a skill agents can
-- invoke via call_skill. Distinct from generate-business-case (yuno_bc),
-- sdr-bc-generate, and ss-deck-generate — this is the 17-slide workshop deck
-- at /workshop/<slug> with explicit client-input math.
-- =============================================================================

INSERT INTO public.skill_registry
  (name, display_name, description, category, skill_definition, requires_integrations, is_system)
VALUES (
  'workshops_bc_generate',
  'Generar Workshop BC (Yuno + Cliente)',
  'Genera un deck de 17 slides para workshop in-person/Zoom con un cliente. Toma inputs explícitos (tx mensuales, ticket, MDR, antifraude per-attempt, approval rate) y computa el business case en cuatro palancas. Devuelve URL pública chief.yuno.tools/workshop/<slug>.',
  'sales',
  E'Calls workshops-bc-generate edge function. Generates a 17-slide workshop deck (Cover, Agenda, Market Context, What is Yuno, Diagnostic, The Solve, Product Suite, Monitors, Yuno AI, Business Case, The Numbers, Customer Proof ×2, Trusted By, Team, Next Steps, Thanks). Distinct from business_case (yuno_bc, commercial 1-pager) and ss_deck_generate (21-slide visual deck).\n\nParams:\n- client_name (required): exact casing, e.g. "Coppel"\n- country (optional): ISO-2, e.g. "MX"\n- language (optional): "es" (default) or "en"\n- workshop_title, workshop_date, client_logo (optional)\n- inputs (REQUIRED — math-critical fields):\n    - monthly_transactions: number (APPROVED tx per month)\n    - avg_ticket_usd: number\n    - current_approval_rate_pct: 0-100\n  Optional inputs (skip a lever if not provided):\n    - current_acquirers: string[]\n    - current_antifraud: string\n    - current_mdr_pct, target_mdr_pct: number\n    - current_antifraud_per_attempt, target_antifraud_per_attempt: USD per attempt\n    - target_approval_rate_pct: 0-100\n    - margin_assumption_pct: default 30\n- attendees (optional): [{ name, role, side: "yuno" | "client" }]\n\nReturns:\n{\n  url: "https://chief.yuno.tools/workshop/<slug>",\n  pdf_url: "https://bridge.yuno.tools/api/workshop/<slug>/pdf",\n  slug, client_name, language, content_source,\n  business_case: { tpv_monthly_usd, tpv_annual_usd, mdr_savings_annual_usd, antifraud_savings_annual_usd, approval_tpv_uplift_annual_usd, approval_revenue_uplift_annual_usd, total_impact_annual_usd, ... }\n}\n\nMath:\n- MDR savings = tpv_annual × (current_mdr − target_mdr) / 100\n- Antifraud savings = (approved_tx / approval_rate) × (cur_af − tgt_af) × 12  [charged per ATTEMPT, not per approval]\n- Approval TPV uplift = attempts × (tgt_apr − cur_apr) × avg_ticket × 12\n- Revenue uplift = tpv_uplift × margin / 100\n\nNotes:\n- Public-read by slug; treat slug as share token.\n- Cold link is shareable to workshop attendees with no auth bounce.\n- PDF endpoint via Railway bridge.\n- Language gate: ALWAYS ask es/en in Phase A (regla feedback_yuno_bc_language).',
  '{}',
  true
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  skill_definition = EXCLUDED.skill_definition;
