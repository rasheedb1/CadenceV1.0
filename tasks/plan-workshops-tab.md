# Plan: Workshops tab en /presentaciones + edición del business case

> Fecha: 2026-05-13 · Owner: rasheed@y.uno
> Status: **DRAFT — esperando aprobación**

## Objetivo

Agregar un 4to tab "Workshops" en `/presentaciones` (al lado de Yuno BC, SDR BC, SS Deck) para que el equipo pueda:

1. **Crear** un nuevo workshop deck llenando los inputs del business case en un formulario (en vez de tener que invocar la skill `/yuno-workshops-bc` desde Claude Code)
2. **Listar** todos los workshops creados (con su slug, cliente, fecha, total impact)
3. **Editar** los inputs del business case después de creado — el deck se actualiza in-place (mismo slug/URL) con los números recomputados

## Arquitectura propuesta

### Frontend (cambios en `src/`)
| Archivo | Cambio |
|---|---|
| `src/pages/Presentaciones.tsx` | Agregar `'workshop_bc'` al type `BcKind`, nuevo `TabsTrigger`, branch del fetch para leer de `workshops_bc`, render de cards con campos relevantes |
| `src/components/NewWorkshopBcForm.tsx` (nuevo) | Form con todos los inputs del BC (monthly tx, ticket, MDR, antifraud, approval, country, acquirers, etc.) — POSTea a `workshops-bc-generate` |
| `src/components/EditWorkshopBcForm.tsx` (nuevo) | Mismo form pero pre-rellenado con los inputs existentes — PATCHea via nuevo edge fn `workshops-bc-update` |

### Backend
| Archivo | Cambio |
|---|---|
| `supabase/functions/workshops-bc-update/index.ts` (nuevo) | Edge fn que toma `{ slug, inputs }`, valida que el caller sea el `created_by` del row (o org admin), recomputa `business_case` con la misma fn `computeBusinessCase`, hace UPDATE en `workshops_bc`, retorna el business_case nuevo |
| `workshops_bc` table | Ningún cambio de schema necesario — `inputs` y `business_case` ya son jsonb editable |

### Edge function existente (`workshops-bc-generate`)
- Ya retorna `{ id, slug, url, pdf_url, business_case }` — sirve tal cual para el form de creación
- Tiene RLS public read por slug pero writes only via service_role → la edge fn de update debe correr con service_role y hacer auth check ella misma

## UX flow

### Crear workshop
```
[ + Nuevo Workshop ] →
  Modal con tabs/secciones:
  ─ Cliente (nombre, país, idioma es/en, fecha workshop)
  ─ Volumen (transacciones/mes, ticket promedio USD)
  ─ Stack actual (lista de adquirentes, antifraude provider)
  ─ KPIs actuales (MDR%, antifraude $/intento, approval %)
  ─ Targets Yuno (MDR target%, antifraude target $/intento, approval target%)
  ─ Take rate revenue uplift (default 15%)

  [Generar] → llama workshops-bc-generate → toast con URL → cierra modal → refresh list
```

### Listar workshops
Card por workshop con:
- Logo / nombre cliente
- País + idioma
- Created at
- Total annual value (impacto computed)
- Acciones: Open · Copy URL · Open PDF · Edit · Archive

### Editar workshop
```
[ Edit ] → Modal con el MISMO form, pre-rellenado con inputs existentes
       [Recomputar] → workshops-bc-update → nuevo business_case
       URL del deck NO cambia → la persona que ya tiene el link ve los números actualizados
```

## Inputs editables (matching `BCInputs` interface del edge fn)

| Campo | Tipo | Default |
|---|---|---|
| client_name | string | (required) |
| country | enum (MX/BR/AR/CO/PE/CL/US/ES) | MX |
| language | enum (es/en) | es |
| workshop_date | string | `Mayo 2026` |
| monthly_transactions | number | — |
| avg_ticket_usd | number | — |
| current_acquirers | string[] (split por coma) | [] |
| current_antifraud | string | — |
| current_mdr_pct | number | 1.60 |
| target_mdr_pct | number | 1.50 |
| current_antifraud_per_attempt | number | 0.04 |
| target_antifraud_per_attempt | number | 0.03 |
| current_approval_rate_pct | number | 82 |
| target_approval_rate_pct | number | 85 |
| take_rate_pct | number | 15 |
| (opcional para palanca 4 ops) integrations_planned | number | 6 |
| dev_cost_monthly_usd | number | — |
| reconciliation_savings_monthly_usd | number | — |

## Plan de implementación

### Fase A — Backend (~30 min)
- [ ] **A.1** `supabase/functions/workshops-bc-update/index.ts`:
  - Read `{ slug, inputs }` from request
  - Validate org-level auth (caller must be a member of the row's `org_id`)
  - Re-compute `business_case` with the existing `computeBusinessCase` fn (lift it into `_shared/` or inline-copy)
  - UPDATE workshops_bc SET inputs = $inputs, business_case = $bc, updated_at = NOW() WHERE slug = $slug
  - Return `{ ok: true, business_case }`
- [ ] **A.2** Deploy edge fn
- [ ] **A.3** Smoke test: curl con un slug existente + inputs nuevos, verificar que cambia

### Fase B — Frontend (~3h)
- [ ] **B.1** Update `Presentaciones.tsx`:
  - Add `'workshop_bc'` to `BcKind` union
  - Add 4th TabsTrigger
  - Add `KIND_META.workshop_bc` entry
  - Fork the fetch logic to query `workshops_bc` table (parallel to how `merchants_ss` is queried for SS Deck)
  - Render workshop cards with relevant fields (total impact, country, language)
- [ ] **B.2** `src/components/NewWorkshopBcForm.tsx`:
  - Dialog with sectioned form (matches the table above)
  - Validation: required fields (name, monthly_tx, avg_ticket, current_approval)
  - Submit → invoke `workshops-bc-generate` with `{ createdByEmail, client_name, country, language, workshop_date, inputs, attendees }`
  - On success: toast + open URL + close + refresh query
- [ ] **B.3** `src/components/EditWorkshopBcForm.tsx`:
  - Same form, pre-filled from selected row's `inputs`
  - Submit → invoke `workshops-bc-update` with `{ slug, inputs }`
  - On success: toast "Workshop actualizado" + show new business_case total + close + refresh
- [ ] **B.4** Hook up Edit action in the dropdown menu of each Workshop card

### Fase C — Verificación (~30 min)
- [ ] **C.1** Crear workshop nuevo desde el form → verificar URL renderiza, math correcto
- [ ] **C.2** Editar el mismo workshop → cambiar `target_approval_rate_pct` de 85 a 87 → verificar que la URL actual muestra los números nuevos (mismo slug)
- [ ] **C.3** Typecheck + lint + vite build
- [ ] **C.4** Git push (Railway auto-deploys frontend; edge fn deployed via Supabase Management API)

## Decisiones que necesito tu sign-off

1. **¿Patch vía nueva edge fn `workshops-bc-update`, o usar Supabase REST PATCH directo desde el frontend con RLS por org?**
   - **Propuesta:** edge fn nueva — más limpio (recomputa business_case server-side, no client-side), evita que el frontend tenga que tener la lógica de cómputo replicada.

2. **¿Editar in-place (mismo slug/URL) o crear regeneración (nuevo slug, parent_id link al original)?**
   - **Propuesta:** in-place — el cliente ya recibió el link del workshop; si editamos in-place ve los números actualizados sin re-compartir.

3. **¿Modo "preview" antes de guardar las ediciones?**
   - **Propuesta:** NO en v1 — guardar directo. Si hace falta deshacer, se vuelve a editar.

4. **¿Soft-delete (archive) o hard-delete?**
   - **Propuesta:** soft-delete (agregar `archived` boolean a `workshops_bc`) — paralelo a cómo funciona `presentations`.

5. **¿Permission model?**
   - **Propuesta:** caller debe ser miembro del `org_id` del row para editar/archive. Otros orgs leen via public-by-slug pero no editan.

## Time estimate
- Fase A: 30 min
- Fase B: ~3h
- Fase C: 30 min
- **Total: ~4h**
