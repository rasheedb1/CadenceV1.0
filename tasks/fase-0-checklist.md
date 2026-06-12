# Fase 0 — Checklist de setup (Chief Prospecting Pipeline)

> Owner: rasheed@y.uno · Plan padre: [plan-chief-prospecting-pipeline.md](plan-chief-prospecting-pipeline.md)

Fase 0 es **setup base sin código nuevo de runtime**. Solo seeds + verificaciones manuales.

## ✅ A — Migración aplicada (2026-05-05) — FINAL en rasheedbayter's Team

**Decisión 2026-05-05**: el pipeline vive en `rasheedbayter's Team`, NO en Yuno. Razón: toda la actividad real (606 leads, 15 cadencias, 5 agentes) está en esa org. Yuno estaba casi vacía. Se hizo cleanup en Yuno y re-aplicación en rasheedbayter's Team.

| Recurso | UUID |
|---|---|
| Org rasheedbayter's Team | `553315b5-42d0-4518-a461-e4cb12914c54` |
| Owner user (rasheedbayter@gmail.com) | `76403628-d906-45e1-b673-c4231264da5c` |
| ICP profile "Chief Pipeline Yuno v1" | `e6cb3a18-0b69-44e9-93c1-71442c41fed6` |
| Account map "Chief Pipeline Yuno" | `3d19df65-8e68-413a-b067-20e674e15134` |
| Personas creadas | 7 (4 core req + 3 adyacentes opt) |

**7 personas verificadas** (priority / name / role / required / # keywords):
1. Head of Payments / decision_maker / req / 10 kw
2. CFO / Head of Finance / budget_holder / req / 8 kw
3. CPO / Head of Product / decision_maker / req / 8 kw
4. Head of Ecommerce / Digital / champion / req / 8 kw
5. COO / Head of Operations / influencer / opt / 5 kw
5. CTO / VP Engineering / technical_evaluator / opt / 5 kw
5. Head of Growth / Revenue Ops / influencer / opt / 5 kw

Migración es idempotente — si necesitas re-correr para agregar más keywords/personas, ya está armada con `ON NOT EXISTS`.

---

## (Histórico) Cómo se aplicó la migración

- [x] Aplicada vía Supabase Management API (`POST /v1/projects/{ref}/database/query`)
- Comando alternativo si quieres re-aplicar idempotente:
  ```bash
  SUPABASE_ACCESS_TOKEN=<SUPABASE_PAT — ver memoria tokens.md, NUNCA en el repo> \
    npx supabase db push --project-ref arupeqczrxmfkcbjwyad
  ```
  o vía Management API según tu workflow habitual.
- [ ] Verificar output: la migración hace `RAISE NOTICE` con los UUIDs creados (org, ICP, account_map). Capturar para referencia.

**Qué crea la migración:**
- ICP profile **"Chief Pipeline Yuno v1"** con la descripción que pegaste.
- 7 buyer personas priorizados:
  - `priority=1` Head of Payments (decision_maker, required)
  - `priority=2` CFO / Head of Finance (budget_holder, required)
  - `priority=3` CPO / Head of Product (decision_maker, required)
  - `priority=4` Head of Ecommerce / Digital (champion, required)
  - `priority=5` COO, CTO, Head of Growth (influencers, no required → solo se activan en pase 3 cuando los core no llegan a 10 emails)
- Account map **"Chief Pipeline Yuno"** (reusable, único, linkeado al ICP).

**Idempotente**: re-correr no duplica nada. Self-resolving: encuentra org Yuno por nombre/slug y user rasheed por email, falla con error claro si no existe.

---

## ✅ B1 — 3 agentes creados (2026-05-05)

| Agente | UUID | Status | Capabilities |
|---|---|---|---|
| **Hernando (Nando)** — sales | `5a8aae02-3fd7-4129-8269-c551362c2f80` | active (preexistente) | outreach, research, writing, browser, linkedin, salesforce, apollo, gong, inbox, calendar, drive, sheets, contacts, presentations |
| **Andrés** — research (nuevo) | `ee6af509-54d4-4713-affe-0721ffb44a50` | active | research, writing, business_cases, drive, browser, apollo, linkedin, data, sheets |
| **Enrique** — BC specialist (nuevo) | `429c0b49-ad32-4c96-9f89-9f1e8de99e30` | active | business_cases, drive, presentations, writing, research |

Cost caps: Nando $1/turn, Andrés $2/turn (research consume tokens), Enrique $3/turn (BC + research lookup).

---

## B2 — Lo que falta verificar manualmente (UI Chief)

### Histórico — instrucción original de B1 (ya hecho)

Por cada uno: ir a Solar Navigation → Agentes → "Crear Agente".

| Agente | Role / descripción | Capabilities a activar (toggle en AgentSkillsPanel) |
|---|---|---|
| **Nando** (puede que ya exista) | Sales / Outreach. Ejecuta los 7 steps de outreach en cadencia. Owner del lead durante el flujo. | `linkedin`, `inbox` (Gmail), `apollo`, `salesforce` (opt) |
| **Andrés** (nuevo) | Research. Pre-cadencia: investiga empresas + orquesta cascade-search 3 pases + Apollo + promote-prospects-bulk + asigna a cadencia. | `business_cases`, `drive`, `firecrawl`, `apollo`, `linkedin` (solo search, no send) |
| **Enrique** (nuevo) | Business Case Specialist. Día 7 noche: genera BC personalizado por empresa vía bridge. | `business_cases`, `drive`, `presentations` |

**Importante**: si Nando ya existe, **NO crearlo de nuevo**. Solo verificar que tiene las capabilities listadas. Si le faltan algunas, agregarlas con el toggle.

### B2 — Verificar integraciones de la org Yuno

- [ ] **Gmail OAuth conectado**: ir a `/integrations` → Gmail → debe estar verde / "Connected". Esto define el `from_email` del PN11. Si no está conectado, las cadencias no podrán mandar email.
- [ ] **Unipile cuenta LinkedIn activa**: `/integrations` → LinkedIn → "Connected". Verificar que tiene **Sales Navigator activo** (logo SN visible o feature flag). Sin SN, el InMail fallback del PN1 falla.
- [ ] **Apollo API key**: `/integrations` → Apollo → "Connected". Sin esto, `enrich-prospect` no funciona y nunca encontramos emails.
- [ ] **Anthropic / OpenAI keys**: para los AI prompts del cadencia. Ya deberían estar (`ANTHROPIC_API_KEY` y `OPENAI_API_KEY` en env de edge functions).

### B3 — Confirmar que el ICP profile está bien (visual check)

- [ ] Ir a `/account-mapping` o donde gestiones ICP profiles (ruta puede variar, busca el modulo de ICP).
- [ ] Abrir "Chief Pipeline Yuno v1" → verificar:
  - Descripción tiene el texto del ICP enterprise/scale-up que pegaste.
  - 7 personas listadas con prioridades correctas.
  - Filtros de discover: 40-60 empresas (buffer semanal).
- [ ] Si quieres ajustar título keywords de alguna persona (ej: agregar "Head of Checkout"), hacelo desde la UI — no rompe nada.

---

## C — Verificación post-Fase 0 (antes de pasar a Fase 1)

Dime "OK" cuando hayas:
1. Aplicado la migración 099 sin errores.
2. Visto los 3 UUIDs en el output (org, ICP, account_map).
3. Creado/verificado los 3 agentes en UI.
4. Confirmado que las 4 integraciones (Gmail, Unipile+SN, Apollo, LLM keys) están green.

Una vez confirmado, arranco **Fase 1**: migración `100_icp_pipeline_queue.sql` con la cola de empresas + `claim_next_n_companies` SQL function + `org_chief_settings` table (F6).

---

## Notas

- Si algún agente ya tiene un `railway_url` asignado, no tocar — significa que está corriendo. Solo tocar capabilities.
- La migración 099 NO toca código de edge functions. Es solo data. Bajo riesgo.
- Si la migración falla con "Org Yuno no encontrada", verifica el nombre exacto en `organizations` (puede ser "Yuno", "Yuno Payments", etc) y avísame para ajustar el ILIKE.
