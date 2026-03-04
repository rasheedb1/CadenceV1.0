# Plan: Soft Delete para Cadencias (prevención de pérdida permanente)

## Diagnóstico realizado — 2026-03-04

### Qué encontramos
- Las cadencias de Magdalena Torrealba **NO están en la base de datos**. No es un problema de RLS/visibilidad — fueron **borradas permanentemente** (hard delete).
- Magdalena es **manager** del org "Alejandro Albarracin Team", así que SÍ tiene visibilidad de todas las cadencias del org. El problema no es permisos.
- Solo hay UNA cadencia en su org: "Zalando Cadence" (creada hoy por Alejandro).
- Toda la actividad de Magdalena en `activity_log` tiene `cadence_id: null`, lo que confirma que sus cadencias ya estaban eliminadas antes del 2 de marzo.
- El actual `handleDelete` hace un `confirm()` de browser + `DELETE FROM cadences WHERE id = ?` sin posibilidad de recuperación.

### Ya desplegado en producción
- ✅ Trigger `trg_validate_cadence_owner` — impide crear cadencias con `owner_id` que no sea miembro del org
- ✅ View `orphaned_cadences` — monitoreo continuo de cadencias con owner desvinculado del org

---

## Plan: Implementar Soft Delete en Cadencias

### Por qué
Un hard delete sin audit trail hace imposible recuperar datos borrados por error.
Con soft delete, los registros quedan en la DB con `deleted_at` y se pueden restaurar.

### Cambios necesarios

- [ ] **Migration 049**: Agregar `deleted_at TIMESTAMPTZ` a `cadences` (y `cadence_steps` por coherencia)
- [ ] **Migration 049**: Actualizar RLS SELECT policies para filtrar `deleted_at IS NULL`
- [ ] **Migration 049**: Agregar función `restore_cadence(id)` para admins/managers
- [ ] **CadenceContext.tsx**: Cambiar query para filtrar `deleted_at IS NULL` (respaldo del RLS)
- [ ] **CadenceContext.tsx**: Cambiar `deleteCadence` para hacer `UPDATE SET deleted_at = NOW()` en vez de `DELETE`
- [ ] **Cadences.tsx**: Mejorar UI de confirmación — mostrar nombre de la cadencia en el dialog

### Scope
- Solo afecta tabla `cadences` y `cadence_steps` (pasos dependen de la cadencia)
- NO afecta `cadence_leads`, `lead_step_instances`, `schedules` (esos se pueden hard-delete si la cadencia se elimina)
- Los datos existentes (Zalando Cadence, test) no se ven afectados

### Riesgo
- Bajo: es additive change (nueva columna nullable)
- El trigger `ON DELETE CASCADE` en `cadence_steps` sigue funcionando igual para otros contextos

---

## Aprobación requerida antes de implementar
Esperando confirmación del usuario para proceder con los cambios de código y migración.
