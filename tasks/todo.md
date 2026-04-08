# Plan: Paralelismo + Plan-Aprobación + Delegación Inteligente + Paula (email)

**Objetivo:** Chief corre múltiples proyectos en paralelo con subconjuntos distintos de agentes, propone plan antes de ejecutar, y tiene un agente nuevo (Paula) para triage de correos.

**Restricciones:** No tocar fases 1-3 de cost optimization. No tocar event loop. No tocar RLS/esquema de agentes existente.

---

## Fase A — Paralelismo de proyectos

- [ ] **A.1** Quitar regla "solo 1 proyecto activo a la vez" del system prompt de Chief
- [ ] **A.2** Cambiar dedup en `crear_proyecto`: solo cerrar proyectos que compartan al menos 1 agente con el nuevo
- [ ] **A.3** Deploy bridge a Railway y validar paralelismo

## Fase B — Flujo plan → aprobación → ejecución

- [ ] **B.1** Migración SQL: tabla `project_drafts`
- [ ] **B.2** Tool `proponer_proyecto` (guarda draft, NO crea proyecto)
- [ ] **B.3** Tool `aprobar_proyecto(draft_id)` (promueve draft a proyecto real)
- [ ] **B.4** Tool `rechazar_proyecto(draft_id, razon)`
- [ ] **B.5** Prompt de Chief: forzar `proponer_proyecto` primero

## Fase C — Delegación inteligente

- [ ] **C.1** Prompt forza: listar capabilities necesarias → elegir subset mínimo → justificar → decir quién queda libre

## Fase D — Paula (asistente / correos)

- [ ] **D.1** Migración: role `assistant` + capability `inbox` + crear Paula (Haiku, $1/día cap)
- [ ] **D.2** Tool MCP `list_unread_emails(since?, limit?)` vía Unipile
- [ ] **D.3** Tool MCP `read_email(email_id)`
- [ ] **D.4** Tool MCP `summarize_inbox(hours?)`
- [ ] **D.5** Verificar Gmail conectado en Unipile

## Prueba end-to-end

- [ ] Chief recibe: *"Optimiza UX de Agents + Mission Control, y resumen de correos no leídos"*
- [ ] Chief propone 2 planes separados
- [ ] Aprobar ambos
- [ ] Validar ambos proyectos `active` simultáneos
- [ ] Validar agentes correctos por proyecto
- [ ] Validar coste final

## Review
_Se llena al terminar_
