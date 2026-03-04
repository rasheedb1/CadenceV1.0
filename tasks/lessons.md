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

### Fix inmediato para Magdalena
Ver [supabase/migrations/048_fix_cadence_owner_visibility.sql](../supabase/migrations/048_fix_cadence_owner_visibility.sql):
- STEP 1: SQL diagnóstico para identificar las cadencias afectadas
- STEP 2: UPDATE para corregir `owner_id` en cadences, cadence_steps, cadence_leads, etc.
- STEP 3: Trigger preventivo para futuros inserts
- STEP 4: Vista `orphaned_cadences` para monitoreo continuo
