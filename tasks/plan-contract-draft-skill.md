# Plan — Contract Draft Skill (Yuno Order Form)

## Scope

Nuevo skill de Chief que genera un **draft** del Yuno Order Form como Google Doc, copiando un template en Drive y rellenando placeholders. Dual-input: si existe un BC reciente del cliente en `presentations`, jala nombre + pricing; los campos faltantes (dirección, contactos, fechas) se los pide el usuario por WhatsApp.

## Arquitectura

```
[WhatsApp → Chief] "genera contrato para <cliente>"
    ↓
call_skill("contract_draft", { clientName, bcSlug?, overrides? })
    ↓ (BRIDGE_SKILLS map → POST /api/generate-contract)
Bridge endpoint /api/generate-contract:
  1. Resolver org_id + user's Google access token (refresh via existing flow)
  2. Si bcSlug (o clientName match reciente): SELECT defaults FROM presentations WHERE slug=... OR client_name ILIKE... ORDER BY created_at DESC LIMIT 1
  3. Derivar variables BC → contrato (clientName, countries → territory, pricing overrides)
  4. Merge con overrides del body (overrides ganan)
  5. Validar requeridas → 400 con lista de faltantes si no
  6. drive.files.copy(TEMPLATE_DOC_ID) → nuevo doc "Yuno Order Form - <Cliente> - <YYYY-MM-DD>"
  7. docs.batchUpdate con replaceAllText por cada {{VAR}}
  8. Return { success, url: "https://docs.google.com/document/d/<id>/edit", docId, missing?: [] }
    ↓
Chief muestra URL al usuario en WhatsApp
```

## Decisiones (confirmadas por usuario)

| # | Decisión | Valor |
|---|---|---|
| 1 | Fuente de datos | Mix: BC reciente si existe (nombre + pricing), usuario completa el resto |
| 2 | Storage del doc generado | Drive del usuario (copia del template) |
| 3 | Firma | Solo draft — sin DocuSign/firma electrónica en v1 |
| 4 | Variables | 20 placeholders listados abajo |
| 5 | Trigger | Chief via WhatsApp (skill en registry, route=bridge) |
| 6 | Template doc ID | `1cyep0RqWAAXAwJV5BeYoLLJ1tFNDaPNXG774zcBI-Ko` → env var `CONTRACT_TEMPLATE_DOC_ID` |
| 7 | Output folder ID | `1AnXdU9EOMUeWj4RAAS9G_GMI84eyYSrm` → env var `CONTRACT_OUTPUT_FOLDER_ID` |
| 8 | Signatario Yuno | Fijo — se escribe literal en el template (no placeholder) |

## Variables (placeholders en el template)

**Cliente (company-specific):**
- `{{COMPANY_NAME}}`, `{{COUNTRY}}`, `{{REGISTRATION_NUMBER}}`, `{{COMPANY_ADDRESS}}`

**Fechas / término:**
- `{{EFFECTIVE_DATE}}`, `{{SIGNATURE_DATE}}`, `{{SUBSCRIPTION_TERM}}` (default "12 months")

**Servicio:**
- `{{TERRITORY}}`, `{{INTEGRATION_TYPE}}`, `{{AUTHORIZED_USERS}}` (default "10")

**Pricing (jala de BC si existe):**
- `{{MONTHLY_PLATFORM_FEE}}`, `{{TX_FEE_PAYMENT}}`, `{{TX_FEE_FRAUD}}`, `{{TX_FEE_3DS}}`
- `{{MIN_MONTHLY_GUARANTEE}}`, `{{MIN_TX_COUNT}}`

**Contactos cliente:**
- `{{PRIMARY_CONTACT}}`, `{{TECHNICAL_CONTACT}}`, `{{BILLING_CONTACT}}`

**Signatario Yuno:** fijo en el template (no placeholder).

## BC → Contract variable mapping

`presentations.defaults` (BC_DEFAULTS JSONB) → contract fields:

| BC field | Contract var | Transform |
|---|---|---|
| `clientName` | `COMPANY_NAME` | direct |
| `countries[].name` (join) | `TERRITORY` | `countries.map(c => c.name).join(", ")` |
| `countries[0].name` | `COUNTRY` | first country (for "incorporated in") |
| `platformFee` | `MONTHLY_PLATFORM_FEE` | `USD ${n.toLocaleString()}` |
| `txFeePayment` | `TX_FEE_PAYMENT` | `USD ${n.toFixed(2)} per successful transaction` |
| `txFeeFraud` | `TX_FEE_FRAUD` | same format |
| `txFee3DS` | `TX_FEE_3DS` | same format |
| `minGuarantee` | `MIN_MONTHLY_GUARANTEE` | `USD ${n}` |
| `minTxCount` | `MIN_TX_COUNT` | `${n.toLocaleString()}` |

Campos que **nunca vienen del BC** y siempre los pide Chief: `REGISTRATION_NUMBER`, `COMPANY_ADDRESS`, `EFFECTIVE_DATE`, `SIGNATURE_DATE`, `INTEGRATION_TYPE`, `PRIMARY_CONTACT`, `TECHNICAL_CONTACT`, `BILLING_CONTACT`.

## Fases

### Fase 1 — Template setup (manual, usuario hace una vez)

- [ ] Usuario sube/crea Google Doc con el contenido del PDF Yuno Order Form
- [ ] Reemplaza los campos tipo `[COMPANY NAME]` con `{{COMPANY_NAME}}` (placeholder format)
- [ ] Comparte el doc con la service account o lo deja accesible al token OAuth del usuario
- [ ] Copia el doc ID del URL y me lo pasa → lo guardo como `CONTRACT_TEMPLATE_DOC_ID` env var en Railway

**Entregable:** un Google Doc template con los 20 placeholders listos. Sin esto el skill no puede funcionar.

### Fase 2 — Bridge endpoint (`/api/generate-contract`)

Archivo: [openclaw/bridge/generate_contract.js](openclaw/bridge/generate_contract.js) (nuevo, paralelo a `generate_business_case.js`)

- [ ] Función `generateContract({ orgId, clientName, bcSlug, overrides, accessToken })`:
  1. Si `bcSlug`: `SELECT defaults FROM presentations WHERE slug = :slug AND archived = false`
  2. Si no `bcSlug` pero `clientName`: `SELECT defaults, slug FROM presentations WHERE client_name ILIKE :name AND archived = false ORDER BY created_at DESC LIMIT 1`
  3. Mapear `defaults` → variables (ver tabla arriba)
  4. Merge overrides (overrides > BC > defaults del env)
  5. Computar variables faltantes → si hay obligatorias faltantes, `return { missing: [...] }` sin crear el doc
  6. `drive.files.copy(TEMPLATE_DOC_ID, { name: "Yuno Order Form - <Cliente> - <YYYY-MM-DD>" })`
  7. `docs.batchUpdate(newDocId, { requests: [...replaceAllText per var] })`
  8. Return `{ docId, url, used_bc_slug?, overrides_applied }`

- [ ] Endpoint `app.post("/api/generate-contract", ...)` en [openclaw/bridge/server.js](openclaw/bridge/server.js):
  - Auth: `X-Agent-Token` constant-time check (match existing pattern)
  - Body: `{ org_id, client_name, bc_slug?, overrides?: {...} }`
  - Resuelve Google token via `/integrations/google/refresh` helper
  - Llama `generateContract(...)` → devuelve JSON

- [ ] Manejo de errores: template no accesible → 500 con mensaje claro; campos faltantes → 400 con lista

### Fase 3 — Registrar skill en DB

Archivo: `supabase/migrations/099_contract_draft_skill.sql` (siguiente migración)

```sql
INSERT INTO public.skill_registry
  (name, display_name, description, category, skill_definition, requires_integrations, is_system, route)
VALUES (
  'contract_draft',
  'Yuno Order Form Contract',
  'Generate a draft Yuno Order Form contract as a Google Doc copied from the template, with client + pricing data filled from a recent business case when available.',
  'sales',
  '... (ver skill_definition abajo) ...',
  ARRAY['drive'],
  true,
  'bridge'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  skill_definition = EXCLUDED.skill_definition,
  requires_integrations = EXCLUDED.requires_integrations,
  route = EXCLUDED.route;
```

**skill_definition** (texto que Chief lee para saber cómo invocar):
```
Generates a DRAFT Yuno Order Form contract as a Google Doc in the user's Drive.

Params:
- clientName (required): nombre legal del cliente
- bcSlug (optional): slug de un business case existente en /bc/<slug>; si se provee, jala pricing y country de ahí
- overrides (optional object): override manual de cualquier variable del contrato

Required variables (must come from BC or overrides):
  COMPANY_NAME, COUNTRY, REGISTRATION_NUMBER, COMPANY_ADDRESS,
  EFFECTIVE_DATE, TERRITORY, INTEGRATION_TYPE,
  MONTHLY_PLATFORM_FEE, TX_FEE_PAYMENT, MIN_MONTHLY_GUARANTEE,
  PRIMARY_CONTACT, TECHNICAL_CONTACT, BILLING_CONTACT

Optional (con defaults):
  SIGNATURE_DATE (= EFFECTIVE_DATE), SUBSCRIPTION_TERM ("12 months"),
  AUTHORIZED_USERS ("10"), TX_FEE_FRAUD ("USD 0.01 per successful transaction"),
  TX_FEE_3DS ("USD 0.025 per successful transaction"), MIN_TX_COUNT ("5,000")

Flow (Phase A / Phase B):
  Phase A: collect missing required fields from user via ask_human_via_whatsapp.
    NEVER invent values. If bcSlug provided, confirm with user which fields are pulled from BC.
  Phase B: call this skill with completed params. Returns { url } — present to user.

Output: { success: true, url: "https://docs.google.com/document/d/<id>/edit", docId }
```

- [ ] Migración aplicada via Supabase Management API

### Fase 4 — Route en chief-agents

Archivo: [chief-agents/src/mcp-tools/skill-tools.ts](chief-agents/src/mcp-tools/skill-tools.ts)

- [ ] Agregar a `BRIDGE_SKILLS` map:
  ```ts
  'contract_draft': '/api/generate-contract',
  ```
- [ ] No cambios adicionales — el skill se enruta automáticamente via el routing existente

### Fase 5 — Asignar skill a agente (opcional, per user)

- [ ] Via UI AgentSkillsPanel o directamente: `INSERT INTO agent_skills (agent_id, skill_id, enabled) VALUES (<chief_agent_id>, <contract_draft_id>, true)`
- [ ] O dejarlo disponible solo bajo demanda (no asignado por default)

### Fase 6 — Verificación end-to-end

- [ ] Test 1 — sin BC: "genera contrato para Acme Corp" → Chief pregunta todos los campos → genera doc → URL funciona, contenido correcto
- [ ] Test 2 — con BC: crear BC para "Rappi" → "genera contrato para Rappi" → Chief confirma pricing del BC, pide solo los campos faltantes → genera doc
- [ ] Test 3 — campos faltantes: llamar endpoint directo con body incompleto → 400 con `missing: [...]`
- [ ] Test 4 — template inaccesible: temporarily cambiar `CONTRACT_TEMPLATE_DOC_ID` a ID inválido → 500 con error claro
- [ ] Verificar que el doc generado tiene **todos** los placeholders reemplazados (no quedan `{{X}}` sin rellenar)

## Deploy checklist

- [ ] Env vars en Railway bridge: `CONTRACT_TEMPLATE_DOC_ID=1cyep0RqWAAXAwJV5BeYoLLJ1tFNDaPNXG774zcBI-Ko`, `CONTRACT_OUTPUT_FOLDER_ID=1AnXdU9EOMUeWj4RAAS9G_GMI84eyYSrm`
- [ ] Aplicar migración 099 via Supabase Management API
- [ ] Redeploy bridge en Railway (push branch `chief-agent-platform`)
- [ ] Redeploy chief-agents (mismo repo/branch)
- [ ] Smoke test desde WhatsApp

## Riesgos / gotchas

- **Placeholders dentro de tablas:** `replaceAllText` sí funciona en tablas de Google Docs (probado en skill-system anterior). Verificar en Fase 6.
- **Template drift:** si el usuario edita el template y cambia nombres de placeholders, skill rompe silenciosamente (quedan `{{X}}` literal en el doc generado). Mitigación: Fase 6 verifica no quedar placeholders sin reemplazar.
- **BC vieja con pricing desactualizado:** si hay BC de hace 3 meses pero el pricing cambió, usuario debe usar `overrides`. Chief debe mostrar qué jaló del BC antes de generar (parte del Phase A del skill_definition).
- **Permisos del template:** el template tiene que estar accesible al access token del usuario (o su cuenta de Google). Si el template es del equipo legal y el usuario no tiene permiso, `drive.files.copy` falla con 403.
- **Campos NO en BC:** registration number, dirección, contactos → SIEMPRE se piden al usuario. Chief no los debe inventar (skill_definition ya lo dice explícito).

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `openclaw/bridge/generate_contract.js` | **Crear** |
| `openclaw/bridge/server.js` | Modificar — añadir endpoint ~línea 1075 |
| `supabase/migrations/099_contract_draft_skill.sql` | **Crear** |
| `chief-agents/src/mcp-tools/skill-tools.ts` | Modificar — 1 línea en BRIDGE_SKILLS |

## Estimación

~2h de trabajo una vez aprobado + setup manual del template (15min del usuario).

## Preparación manual del template (usuario, 5-10 min)

El template en Drive (`1cyep0RqWAAXAwJV5BeYoLLJ1tFNDaPNXG774zcBI-Ko`) tiene placeholders en formato `[X]` del PDF original. Hay que cambiarlos a `{{X}}` para que `replaceAllText` los encuentre. Find/replace en el doc:

| Buscar en el template | Reemplazar por |
|---|---|
| `[COMPANY NAME]` | `{{COMPANY_NAME}}` |
| `[Country]` | `{{COUNTRY}}` |
| `[Registration Number]` | `{{REGISTRATION_NUMBER}}` |
| `[Company Address]` | `{{COMPANY_ADDRESS}}` |
| `[Date]` (primera ocurrencia, Effective Date) | `{{EFFECTIVE_DATE}}` |
| `[Date]` (segunda, Signature Date) | `{{SIGNATURE_DATE}}` |
| `[Specify countries/regions]` | `{{TERRITORY}}` |
| `[API, SDK, hosted checkout]` | `{{INTEGRATION_TYPE}}` |
| `USD 3,800` | `{{MONTHLY_PLATFORM_FEE}}` |
| `USD 0.04 per successful transaction` | `{{TX_FEE_PAYMENT}}` |
| `USD 0.01 per successful transaction` | `{{TX_FEE_FRAUD}}` |
| `USD 0.025 per successful transaction` | `{{TX_FEE_3DS}}` |
| `USD 200` (dentro del Minimum Monthly Guaranteed) | `{{MIN_MONTHLY_GUARANTEE}}` |
| `5,000` (approved payment transactions) | `{{MIN_TX_COUNT}}` |
| `Primary Contact Information: [Name, Title, Email]` | `Primary Contact Information: {{PRIMARY_CONTACT}}` |
| `Technical Contact Information: [Name, Title, Email]` | `Technical Contact Information: {{TECHNICAL_CONTACT}}` |
| `Billing Contact Information: [Name, Title, Email]` | `Billing Contact Information: {{BILLING_CONTACT}}` |
| `10 platform users` | `{{AUTHORIZED_USERS}} platform users` |
| `12 months` | `{{SUBSCRIPTION_TERM}}` |

Además: escribe literal el nombre/título/email del signatario Yuno donde dice `Name: / Title: / Email: / Date:` (debajo de "YUNO TECNOLOGÍAS S.A.P.I. DE C.V.").

**Caveat importante:** el doc puede estar guardado como `.docx` (Word) en lugar de Google Doc nativo (el URL tiene `rtpof=true&sd=true` que sugiere upload de Word). Si es así, `docs.batchUpdate` va a fallar. Solución rápida: abrir el doc → **Archivo → Guardar como Documento de Google** → usar el ID del nuevo doc (será diferente).
