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

## Lesson 002 — Managers ven todas las cadencias del org (mezcla de usuarios)
**Fecha:** 2026-03-04

### Qué pasó
La política RLS "Managers can view all org cadences" hacía que Magdalena (manager) viera las cadencias de Alejandro y viceversa. Esto causó que alguien borrara cadencias del otro usuario sin saberlo.

### Regla
**La query de cadencias en CadenceContext SIEMPRE debe filtrar por `owner_id = user.id`.**
El RLS de manager es un permiso de acceso (permite la query), pero el frontend debe explícitamente limitar la vista a los datos del propio usuario.

Aplica igual a: leads, templates, schedules, workflows — cualquier tabla donde cada usuario tenga su propio mundo.

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
