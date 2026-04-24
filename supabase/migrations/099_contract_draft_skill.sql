-- contract_draft skill: generates a Yuno Order Form draft as a Google Doc
-- via the bridge endpoint POST /api/generate-contract.
--
-- Inputs are mixed: recent business case in `presentations` pre-fills client
-- name and pricing when available; everything else comes from the caller
-- (Chief collects it from the user via ask_human_via_whatsapp).

INSERT INTO public.skill_registry
  (name, display_name, description, category, skill_definition, requires_integrations, is_system, route)
VALUES (
  'contract_draft',
  'Yuno Order Form Contract',
  'Genera un DRAFT del Yuno Order Form como Google Doc en la carpeta de contratos. Si existe un business case reciente del cliente, jala nombre + pricing de ahí; el resto se lo pides al usuario.',
  'sales',
  'Calls generate-contract endpoint on the bridge. Copies a Google Docs template into the contracts folder and fills placeholders via replaceAllText.

Params:
- client_name (required): nombre legal del cliente
- bc_slug (optional): slug de un business case existente en presentations; si se provee, el endpoint jala COMPANY_NAME, COUNTRY/TERRITORY y pricing de ahí
- overrides (optional object): override manual de cualquier variable del contrato

Variables que el contrato necesita (required):
  COMPANY_NAME, COUNTRY, REGISTRATION_NUMBER, COMPANY_ADDRESS,
  EFFECTIVE_DATE, TERRITORY, INTEGRATION_TYPE,
  MONTHLY_PLATFORM_FEE, TX_FEE_PAYMENT,
  PRIMARY_CONTACT, TECHNICAL_CONTACT, BILLING_CONTACT

Defaults de Yuno (sobreescribibles vía overrides):
  SIGNATURE_DATE = EFFECTIVE_DATE
  SUBSCRIPTION_TERM = "12 months"
  AUTHORIZED_USERS = "10"
  TX_FEE_FRAUD = "USD 0.01 per successful transaction"
  TX_FEE_3DS = "USD 0.025 per successful transaction"
  MIN_MONTHLY_GUARANTEE = "USD 200"
  MIN_TX_COUNT = "5,000"

Flow (Fase A / Fase B):
  Fase A: si hay BC reciente del cliente, confírmale al usuario qué se jaló de ahí
    (pricing + territorio). Luego pregunta por ask_human_via_whatsapp TODAS las
    variables required que no vengan del BC. NUNCA inventes registration_number,
    dirección, fechas, integration_type ni contactos.
  Fase B: llama esta skill con client_name + overrides completos.

Response:
  - { success: true, url: "https://docs.google.com/document/d/<id>/edit", docId, used_bc_slug } → muéstrale la URL al usuario
  - { success: false, missing: [vars] } → pregúntale al usuario las faltantes y reintenta',
  ARRAY['drive'],
  true,
  'bridge'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_definition = EXCLUDED.skill_definition,
  requires_integrations = EXCLUDED.requires_integrations,
  is_system = EXCLUDED.is_system,
  route = EXCLUDED.route;
