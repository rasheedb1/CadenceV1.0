# Lead Search + Quick Messaging (LinkedIn & Email)

## Objetivo
Crear en Chief un lugar para buscar leads y poder enviarles mensajes por LinkedIn o email directamente. Integrar esto con el bot de WhatsApp (OpenClaw) para que desde WhatsApp se pueda pedir enviar mensajes usando las cuentas conectadas en Chief.

## Contexto Actual
- **Ya existe:** `enviar_mensaje` tool en el Gateway de OpenClaw (LinkedIn DM, InMail, connection request)
- **Ya existe:** `buscar_prospectos` tool en el Gateway (Sales Navigator cascade search)
- **Ya existe:** Edge functions `linkedin-send-message` y `send-email`
- **NO existe:** Página standalone de búsqueda rápida + acción en el frontend
- **NO existe:** Tool de envío de email en el Gateway de OpenClaw
- **NO implementado:** `identificar_usuario` y `guardar_sesion` (referenciados en SOUL.md pero sin código)

---

## Plan

### Fase 1: Página de Lead Search + Quick Actions (Frontend)

- [ ] **1.1** Crear página `LeadSearch.tsx` en `/lead-search`
  - Barra de búsqueda por nombre, empresa, título
  - Llama a `search-sales-navigator` edge function
  - Resultados en tabla/cards con info del lead (nombre, título, empresa, LinkedIn URL)

- [ ] **1.2** Diálogo de "Enviar mensaje LinkedIn"
  - Botón en cada resultado de búsqueda
  - Abre diálogo para componer mensaje
  - Selector de tipo: Connection Request, DM, InMail
  - Envía via `linkedin-send-message` edge function
  - Usa la cuenta LinkedIn conectada del usuario (`unipile_accounts`)

- [ ] **1.3** Diálogo de "Enviar email"
  - Botón en cada resultado (si tiene email o tras enriquecer)
  - Abre diálogo para componer email (To, Subject, Body)
  - Envía via `send-email` edge function
  - Usa la cuenta Gmail conectada del usuario (`ae_integrations`)

- [ ] **1.4** Agregar al Sidebar + Feature Flag
  - Nueva entrada en Sidebar: "Lead Search" en sección "Daily Use"
  - Feature flag: `section_lead_search`
  - Ruta protegida con `FeatureRoute`

- [ ] **1.5** Botón "Enriquecer" por lead
  - Obtener email/teléfono via edge function existente
  - Mostrar datos enriquecidos inline

### Fase 2: WhatsApp Bot — Envío de Email

- [ ] **2.1** Agregar tool `enviar_email` al Gateway de OpenClaw
  - Parámetros: org_id, sender_user_id, to_email, subject, body
  - Llama a `send-email` edge function
  - Actualizar SOUL.md y AGENTS.md con la nueva tool

### Fase 3: WhatsApp Bot — Identificación de Usuario

- [ ] **3.1** Crear edge function `identificar-usuario`
  - Input: org_id, email
  - Output: user_id, member_id, display_name, connected accounts (LinkedIn, Gmail)
  - Busca en `profiles` + `org_members` + `unipile_accounts` + `ae_integrations`

- [ ] **3.2** Crear edge function `guardar-sesion-whatsapp`
  - Input: whatsapp_number, org_id, user_id, member_id, display_name
  - Guarda mapping en nueva tabla `whatsapp_sessions`
  - Permite al bot recordar quién es el usuario en futuras conversaciones

- [ ] **3.3** Agregar tools `identificar_usuario` y `guardar_sesion` al Gateway
  - Conectar con los edge functions creados
  - El bot ya tiene las instrucciones en SOUL.md, solo falta la implementación

---

## Notas Técnicas
- La búsqueda usa Sales Navigator via Unipile (existente)
- LinkedIn messaging resuelve provider_id automáticamente (cadena: lead cache → prospect → Unipile lookup)
- Email requiere Gmail OAuth token (auto-refresh si expira)
- Todas las operaciones logueadas en `activity_log`
- Multi-tenancy: todo scoped por `org_id`

## Review
_Pendiente_
