# Lessons Learned

## Lesson 001 — Cadencias desaparecen tras migraciones de RLS
**Fecha:** 2026-03-04
**Org afectada:** Alejandro Albarracin Steam (usuario: Magdalena Torrealba)

### Qué pasó
La migración `040_per_user_data_isolation.sql` eliminó la política "Org members can view cadences"
(cualquier miembro de la org ve todas las cadencias) y la reemplazó con "Users can view own cadences"
(`auth.uid() = owner_id`). Cadencias cuyo `owner_id` apuntaba a otro usuario (el admin que las creó)
se volvieron invisibles para la usuaria destinataria.

### Causa raíz
**RLS migrations que cambian la semántica de owner_id son breaking changes silenciosos.**
Los datos no desaparecen — solo quedan filtrados por la nueva política. Los registros con
`owner_id` incorrecto (e.g., creados por admin en lugar del usuario final) se vuelven inaccesibles.

### Reglas para prevenir recurrencia

1. **Antes de cualquier migración RLS que filtre por `owner_id`:**
   - Ejecutar el diagnóstico de `orphaned_cadences` view (ver migración 048)
   - Verificar que todos los registros del org tienen `owner_id` = el usuario correcto
   - Si hay registros "huérfanos", corregirlos ANTES de aplicar la migración RLS

2. **Al crear datos en nombre de otro usuario (admin flow):**
   - Siempre especificar `owner_id` del usuario destinatario, NO el del admin
   - Verificar en código que `owner_id` = usuario que usará el dato, no quien lo creó

3. **Al escribir una migración RLS:**
   - Si cambia de "visible a todos del org" a "visible solo al owner": SIEMPRE incluir
     un bloque de backfill o al menos una nota sobre registros que podrían quedar huérfanos
   - Agregar un trigger de validación que impida insertar datos con `owner_id` que no
     sea miembro del org (ver función `validate_cadence_owner_is_org_member` en mig 048)

### Fix aplicado (2026-03-04)
- **Migración 048**: trigger `trg_validate_cadence_owner` + view `orphaned_cadences` → desplegado
- **Migración 049**: soft delete (`deleted_at`) + RLS actualizado + restauración de cadencias de Magdalena (2 cadencias, 432 leads asignados) → desplegado
- **CadenceContext.tsx**: añadido `.eq('owner_id', user.id)` → cada usuario ve SOLO sus propias cadencias
- **Cadences.tsx**: confirmación de borrado muestra nombre de la cadencia + mensaje informativo

## Lesson 002 — Un usuario no debe poder modificar/borrar datos de otro usuario del mismo org
**Fecha:** 2026-03-04

### Qué pasó (doble problema)
1. **SELECT mezclado**: La política "Managers can view all org cadences" + la query sin `owner_id` hacía que managers vieran las cadencias de todos los usuarios del org.
2. **DELETE cruzado**: La política "Owner or manager can delete" permitía a cualquier manager borrar datos de cualquier otro usuario. Esto causó la pérdida de las cadencias de Magdalena.

### Reglas

**Regla A — Frontend**: SIEMPRE filtrar por `owner_id = user.id` en queries de datos propios del usuario.
El RLS de manager da permiso de acceso técnico, pero el frontend debe limitar lo que el usuario ve.

**Regla B — RLS DELETE/UPDATE**: Las políticas de DELETE y UPDATE NUNCA deben incluir una excepción para managers sobre datos de otros usuarios. Solo el `owner_id` puede modificar o borrar sus propios datos.

Aplica a TODAS las tablas de datos del usuario: cadences, cadence_steps, cadence_leads, lead_step_instances, leads, templates, schedules, ai_prompts, example_sections, example_messages, workflows.

### Patrón correcto

```javascript
// ✅ CORRECTO: cada usuario ve solo sus datos
supabase.from('cadences')
  .eq('org_id', orgId)
  .eq('owner_id', user.id)  // ← siempre incluir esto

// ❌ INCORRECTO: depender solo del RLS para filtrar
supabase.from('cadences')
  .eq('org_id', orgId)  // ← managers ven todo el org
```

```sql
-- ✅ CORRECTO: solo el dueño puede borrar
CREATE POLICY "Owner only can delete cadences" ON public.cadences
  FOR DELETE USING (user_is_org_member(org_id) AND auth.uid() = owner_id);

-- ❌ INCORRECTO: managers pueden borrar datos ajenos
CREATE POLICY "Owner or manager can delete cadences" ON public.cadences
  FOR DELETE USING (
    user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR user_has_org_role(org_id, 'manager'))  -- ← esto es peligroso
  );
```

### Fix aplicado (Migration 050)
- Todas las políticas DELETE de 11 tablas: `"Owner or manager can delete"` → `"Owner only can delete"`
- Todas las políticas UPDATE de 11 tablas: confirmadas como owner-only

## Lesson 003 — Agent communication pipeline completely broken (A2A + wrong table + WhatsApp truncation)
**Fecha:** 2026-04-12

### Qué pasó
Tasks delegados a agentes (Paula, Juanse, etc.) via WhatsApp nunca se ejecutaban. El usuario recibía "tarea enviada" pero el agente nunca la veía, o la respuesta llegaba truncada.

### 3 Causas raíz simultáneas

1. **A2A endpoint no existe:** `delegar_tarea` enviaba via A2A protocol a `chief-agents/a2a/jsonrpc`, pero el orchestrator solo tiene health check HTTP. El health JSON `{status:"ok"}` era interpretado como "tarea completada exitosamente" por el A2A client.

2. **Edge function escribía en tabla equivocada:** `agent-task` insertaba en `agent_tasks` (legacy), pero los agentes solo leen `agent_tasks_v2` en SENSE phase. Tasks eran invisibles.

3. **WhatsApp limit incorrecto (4096 vs 1600):** `splitMessage()` usaba 4096 como max, pero Twilio WhatsApp silently truncates a 1600 chars. Respuestas largas llegaban cortadas sin warning.

### Reglas para prevenir recurrencia

1. **Nunca asumir que un endpoint existe sin verificar.** Antes de usar un protocolo (A2A, pgmq), verificar que el servicio receptor implementa el endpoint.
2. **Una sola tabla por entidad.** Si existen `agent_tasks` y `agent_tasks_v2`, TODO el código debe usar v2. Buscar y eliminar referencias a la tabla legacy.
3. **Validar respuestas de protocolos.** El A2A client ahora rechaza respuestas que no tengan `jsonrpc` o `result.kind` válido.
4. **Verificar límites de APIs externas.** Twilio WhatsApp = 1600 chars, no 4096. Siempre consultar la documentación oficial.
5. **Nunca silenciar errores en callbacks.** `.catch(() => {})` oculta fallos críticos. Siempre loggear.
6. **Incluir IDs de contexto en callbacks.** `task_id` permite resolver `org_id` → `whatsapp_number` de forma confiable.

## Lesson 004 — Amnesia de agente en skills (ask_human_via_whatsapp bugs)
**Fecha:** 2026-04-13
**Agente afectado:** Paula (business case skill)

### Qué pasó
Paula ejecutaba el skill generate-business-case, hacía las preguntas al usuario vía WhatsApp, recibía las respuestas, pero volvía a preguntar lo mismo — como si tuviera amnesia.

### Causa raíz
3 bugs en `chief-tools.ts` → `ask_human_via_whatsapp`:
1. **Campo equivocado:** `agent_id` en vez de `from_agent_id` en `outbound_human_messages`. El bridge lee `from_agent_id` para setear `conversation_control.active_agent_id`. Con NULL, el reply se routeaba al LLM de Chief, no a Paula.
2. **No guardaba al scratchpad:** El outer `ask_human` (act.ts:814) sí guarda la pregunta al `context_summary` del task. Pero `ask_human_via_whatsapp` (SDK tool) no lo hacía. Resultado: próximo ciclo solo veía `[USER REPLIED]` sin `[YOU ASKED]` → agente no sabe qué preguntó → vuelve a preguntar.
3. **Priority 'normal' por defecto:** Hacía que las preguntas del skill se encolaran al digest en vez de enviarse inmediatamente.

### Reglas para prevenir recurrencia
1. **Cualquier herramienta que escribe a `outbound_human_messages` DEBE usar `from_agent_id`, no `agent_id`.** El bridge depende de este campo para conversation_control.
2. **Cualquier herramienta que hace preguntas al usuario DEBE guardar la pregunta al scratchpad** (context_summary del task), no solo el reply.
3. **Hay DOS paths para ask_human — mantenerlos sincronizados:** El outer (THINK→ask_human en act.ts) y el inner (SDK→ask_human_via_whatsapp en chief-tools.ts). Ambos deben: (a) escribir from_agent_id, (b) guardar al scratchpad, (c) usar priority 'urgent'.
