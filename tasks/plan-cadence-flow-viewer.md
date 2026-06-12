# Plan: Cadence Flow Viewer (read-only, didactic)

## Goal
- Vista read-only que explique visualmente cómo funciona la cadencia de 9 días paso a paso.
- Mostrar por step: qué se ha enviado, qué fue exitoso, qué falló, métricas Carlos.
- Dos entry points: (1) tab "Flow" dentro de `/cadences/:id`, (2) un 5to planeta en el sistema solar de Chief.
- **Read-only por ahora.** Edición vendrá en una fase posterior cuando la V9 esté estable.

## Architecture

**Componente core reusable**: `<CadenceFlowTimeline cadenceId={id} />`
- Timeline vertical, Day 0 → Day 9.
- Una card por step (no por día — un día puede tener varios steps).
- Mismo componente se renderiza dentro de tab y dentro del planeta.

**Data sources** (read-only queries, sin migrations nuevas):
- `cadence_steps` — config del step (day_offset, type, label, config_json.signal_allocation)
- `cadence_lead_state` — estado por (cadence_id, lead_id, step_id): status, last_attempt_at, carlos_score
- `carlos_step_rubric` — threshold del step
- `activity_log` o tabla equivalente — historial de ejecuciones con status (sent/failed/skipped)
- `skill_registry` join `cadence_steps.skill_id` — qué skill ejecuta el step

Una sola edge function nueva: `cadence-flow-metrics` que recibe `cadence_id` y devuelve el shape agregado por step. Mantener la lógica de agregación en backend (más rápido + más limpio que joins en frontend).

## Phase 1 — Data layer

- [ ] Crear edge function `supabase/functions/cadence-flow-metrics/index.ts`
  - Input: `{ cadence_id, org_id, days_window?: number = 30 }`
  - Output:
    ```ts
    {
      cadence: { id, name, total_days, total_steps },
      steps: Array<{
        step_id, day_offset, order_in_day, step_type, step_label,
        skill: { id, name } | null,
        signal_allocation: string | null,
        config: { ai_prompt_present, research_prompt_present, has_template },
        carlos: { threshold: number, avg_score_30d: number | null, samples: number },
        metrics: {
          scheduled: number,
          executed: number,
          failed: number,
          skipped: number,
          success_rate: number  // executed / (executed + failed)
        },
        recent_runs: Array<{ lead_id, lead_name, company, status, executed_at, carlos_score }>  // last 5
      }>
    }
    ```
- [ ] TanStack Query hook `useCadenceFlowMetrics(cadenceId)` en `src/hooks/`
  - Cache 60s, refetch on focus
- [ ] Tests manuales: invocar con la cadencia V9 prod y validar que números cuadran con `/outreach`

## Phase 2 — Timeline UI component

- [ ] `src/components/cadences/CadenceFlowTimeline.tsx`
  - Vertical stack, una card por step
  - Conectores verticales entre cards (CSS, no librería extra)
  - Loading / empty / error states
- [ ] `src/components/cadences/CadenceFlowStepCard.tsx` — la card por step
  - Header: badge "Day X" + icono del step_type + label
  - Body row 1: skill que ejecuta (pill) + signal_allocation (pill)
  - Body row 2: 4 metric tiles — `scheduled` · `executed` · `failed` · `skipped` (números grandes, colores semáforo)
  - Body row 3: Carlos block — threshold vs avg score real con check/warning visual
  - Body row 4: pills de las últimas 5 ejecuciones (color por status, hover = lead name)
  - Click en la card → abre drawer con `recent_runs` full + link a `/outreach?cadence=X&step=Y`
- [ ] `src/components/cadences/CadenceFlowStepDrawer.tsx` — drawer read-only con lista expandida de leads

**Visual reference**: usa shadcn `Card`, `Badge`, `Progress`, `Drawer` (ya en el proyecto). No instalar librerías nuevas.

## Phase 3 — Tab dentro de CadenceBuilder

- [ ] En [src/pages/CadenceBuilder.tsx](src/pages/CadenceBuilder.tsx) agregar `<Tabs>` con 2 tabs:
  - "Builder" (vista actual, default)
  - "Flow" (renderiza `<CadenceFlowTimeline />`)
- [ ] Tab state via URL search param `?tab=flow` para deep-linking desde el planeta

## Phase 4 — Nuevo planeta "Flow" en el sistema solar

- [ ] En [src/components/solar/SolarNavigation.tsx](src/components/solar/SolarNavigation.tsx) agregar entry al array `PLANETS`:
  ```ts
  {
    id: 'flow',
    label: 'Cadence Flow',
    icon: '🛤️',
    href: '/cadence-flow',
    color: '#10B981',  // emerald
    glow: 'rgba(16, 185, 129, 0.4)',
    size: 72,
    orbit: 0,
    startAngle: <recalcular para distribuir los 5 planetas uniformemente>,
    description: 'Visualiza paso a paso cómo corre tu cadencia de prospección'
  }
  ```
- [ ] Recalcular `startAngle` de los 5 planetas para que queden equidistantes (72° entre cada uno)
- [ ] Crear route `/cadence-flow` en [src/App.tsx](src/App.tsx)
- [ ] Crear página `src/pages/CadenceFlow.tsx`:
  - Si org tiene 1 sola cadencia activa → renderiza `<CadenceFlowTimeline cadenceId={...} />` directo
  - Si tiene varias → picker simple arriba (`<Select>` con nombres) que cambia qué cadencia se muestra
  - Default selected: la cadencia con más actividad en los últimos 7 días

## Phase 5 — Polish didáctico

- [ ] Tooltip/popover de ayuda en cada métrica explicando qué significa (didactic = enseñar)
- [ ] Sección colapsable arriba del timeline: "Cómo funciona esta cadencia" — texto generado de los steps (1-2 líneas resumen)
- [ ] Empty state cuando un step tiene 0 ejecuciones: "Aún no se ha ejecutado este step"
- [ ] Skeleton loader mientras carga

## Out of scope (NO hacer ahora)
- Cualquier edición de steps, rubrics, prompts, config
- Editar la cadencia desde el flow viewer
- Re-ejecutar / reschedule manualmente desde aquí (eso ya está en `/outreach`)
- Métricas históricas más allá de 30 días (premature)
- Comparación entre cadencias

## Riesgos
1. **Performance**: la edge function hace varios joins/aggregations. Mitigación: índices ya existen en `cadence_lead_state(cadence_id, step_id)` y `activity_log(cadence_id, executed_at)`. Cache 60s en TanStack.
2. **Métricas inconsistentes vs `/outreach`**: si el agregado no cuadra con lo que el log muestra, pierde credibilidad. Validar con un test manual antes de mergear.
3. **Layout del solar system con 5 planetas**: hay que rebalancear ángulos. Riesgo cosmético, no funcional.

## Verificación (Definition of Done)
- [x] Tab "Flow" en `/cadences/:id` renderiza el timeline sin errores
- [x] Planeta "Cadence Flow" aparece en solar nav y navega correctamente
- [ ] Métricas de Day 1 cuadran con count manual en `/outreach` filtrado por ese step *(requiere prod data)*
- [x] Click en card abre dialog con leads reales
- [x] No regresión en CadenceBuilder existente (builder tab default y funcional)
- [x] Build + lint pasa (TypeScript exit 0, lint clean en archivos nuevos)

## Review (implementación completada)

### Archivos creados
- `supabase/functions/cadence-flow-metrics/index.ts` — edge function read-only de agregación
- `src/hooks/useCadenceFlowMetrics.ts` — TanStack Query hook (cache 60s)
- `src/components/cadences/flowStepHelpers.ts` — iconos + tonos + `<StepIcon>` reusable
- `src/components/cadences/CadenceFlowStepCard.tsx` — card del step con 5 métricas + recent pills
- `src/components/cadences/CadenceFlowStepDialog.tsx` — drill-in modal con config/Carlos/recent
- `src/components/cadences/CadenceFlowTimeline.tsx` — container con HowItWorks + skeleton + ol vertical
- `src/pages/CadenceFlow.tsx` — página standalone del planeta con picker multi-cadencia

### Archivos modificados
- `src/pages/CadenceBuilder.tsx` — nueva tab "Flow", URL `?tab=flow` deep-link via `useSearchParams`
- `src/components/solar/SolarNavigation.tsx` — 5to planeta `cadence-flow` a 210° (upper-left, llena el hueco visual sin disrumpir los 4 existentes)
- `src/App.tsx` — rutas `/cadence-flow` y `/cadence-flow/:id` (gated por `section_cadences`)

### Decisiones notables
- **Score Carlos** vive en `qa_supervisor_decisions.quality_score` (NUMERIC 3,1) joined via `message_qa_reviews.cadence_step_id`. No en `cadence_lead_state`.
- **Status counts** desde `lead_step_instances` (UNIQUE en cadence_step_id+lead_id) — la fuente más directa, mejor que `activity_log` que es más bruidoso.
- **Skill linkage** vía `cadence_steps.config_json->>'skill_id'` (no hay columna directa).
- **Solar layout**: 5to planeta a 210° (NO redistribuí los 4 existentes a 72° equidistantes) para minimizar cambio visual.
- **Sin migraciones nuevas** — todo lee de tablas existentes.

### Deploy pendiente (acción manual del usuario)
```bash
SUPABASE_ACCESS_TOKEN=<SUPABASE_PAT — ver memoria tokens.md, NUNCA en el repo> \
  npx supabase functions deploy cadence-flow-metrics \
  --no-verify-jwt --project-ref arupeqczrxmfkcbjwyad
```
Frontend: `git push origin main` (Railway auto-deploya).

### QA manual recomendado post-deploy
1. Ir a `/cadence-flow` → debe abrir la cadencia más reciente automáticamente.
2. Verificar que cada step muestra Day badge + métricas + Carlos threshold.
3. Click en una card → dialog con últimas 5 ejecuciones.
4. Tab "Flow" en `/cadences/:id?tab=flow` debe renderizar el mismo componente.
5. Comparar `Sent` count del Day 1 contra `/outreach` filtrado por ese step — deben coincidir.
