# Plan: Reestructura de Plataforma — Skills Dashboard + Cuentas Platform-Wide + App System

## Objetivo
Transformar Chief de "una herramienta de outreach con agentes bolted-on" a "una plataforma con múltiples apps y un equipo de agentes que trabaja en todas".

## Estado actual (lo que ya existe)
- **3 apps** vía Solar Navigation: Chief Outreach, Account Executive, AI Agents
- **Auth** ya es platform-wide (AuthContext + OrgContext) — funciona para todas las apps
- **Feature flags** ya controlan visibilidad por sección
- **Agent detail page** (`/agents/:id`) ya tiene config de modelo, soul_md, tasks, mensajes
- **Roles** existen (Admin, Manager, Member, Viewer) pero se usan poco en la UI
- **8 integraciones** toggleables via WhatsApp (inbox, calendar, drive, sheets, contacts, linkedin, apollo, salesforce)

## Lo que falta

### Fase 1 — Skills Dashboard (en Agent Detail page)
**Scope:** UI para gestionar capabilities/integraciones de cada agente visualmente.
**Dónde:** `/agents/:id` → nueva sección "Skills & Integraciones"

- [ ] **1.1** Componente `AgentSkillsPanel` con toggles visuales por capability
  - Grupo "Google": inbox, calendar, drive, sheets, contacts (con badge "Requires Google OAuth")
  - Grupo "External": linkedin, apollo, salesforce
  - Grupo "Built-in": code, ops, data, design, research, writing, browser, outreach
  - Cada toggle llama `PATCH agents?id=eq.{id}` para actualizar `capabilities[]`
  - MCP cache se invalida automáticamente (ya implementado en sense.ts)

- [ ] **1.2** Estado de conexión inline
  - Al lado de cada grupo OAuth, mostrar si está conectado (verde) o no (link para conectar)
  - Reutiliza `/integrations/status` del bridge

- [ ] **1.3** Personalidad editable
  - Textarea para editar `soul_md` directo desde el dashboard
  - Preview del prompt que verá el agente
  - Botón "Guardar" → `PATCH agents?id=eq.{id}` con `soul_md`

- [ ] **1.4** Template selector (para nuevos agentes o reset)
  - Dropdown con los 9 templates (Developer, UX, QA, Sales, Assistant, etc.)
  - Al seleccionar, pre-llena capabilities + soul_md + model
  - No sobreescribe sin confirmar

**Esfuerzo:** ~4-6h (Juanse implementa, Sofi diseña la UX)
**Dependencias:** Ninguna — usa lo que ya existe

---

### Fase 2 — Navegación unificada + App Selector
**Scope:** Reemplazar la navegación actual para que sea platform-wide, no app-específica.

- [ ] **2.1** Nuevo layout unificado
  - Sidebar izquierdo con secciones por app (colapsables):
    - 🤖 **Agentes** (agents, integrations, projects)
    - 📨 **Outreach** (cadences, leads, templates, workflows)
    - 💼 **Account Executive** (accounts, pipeline, calendar)
    - ⚙️ **Settings** (org, members, billing)
  - Header top con: org switcher, user menu, notifications
  - Eliminar Solar Navigation como home (o dejarla como landing visual opcional)

- [ ] **2.2** App switcher en header
  - Dropdown o tabs que permiten cambiar entre apps
  - Badge con contadores (tareas pendientes, correos no leídos, etc.)
  - Cada app abre su sección en el sidebar

- [ ] **2.3** Eliminar ModeContext (SDR vs AE)
  - Reemplazar por la navegación unificada
  - Todas las secciones visibles según feature flags + roles

- [ ] **2.4** Agents dentro del layout principal
  - Mover `/agents` y `/agents/:id` dentro de `MainLayout`
  - Dejar de ser standalone — quedan como una sección más del sidebar

**Esfuerzo:** ~8-12h (Sofi diseña, Juanse implementa)
**Dependencias:** Fase 1 (skills panel debe estar listo)

---

### Fase 3 — Roles y permisos platform-wide
**Scope:** Roles que aplican a toda la plataforma, no solo outreach.

- [ ] **3.1** Definir permisos por rol
  - **Admin:** todo. Crear agentes, conectar integraciones, gestionar members.
  - **Manager:** ver agentes, crear proyectos, ver integraciones. No crear agentes ni conectar OAuth.
  - **Member:** ver agentes, ver proyectos, interactuar con agentes via dashboard. No config.
  - **Viewer:** solo lectura.

- [ ] **3.2** Migración: tabla `role_permissions`
  - `role, section, action, allowed` (ej: "manager", "agents", "create_project", true)
  - O usar feature flags expandidos por rol

- [ ] **3.3** UI de gestión de miembros
  - Página `/settings/members` con lista de miembros del org
  - Invitar, cambiar rol, remover
  - Ya existe `organization_members` + `organization_invitations` en BD

- [ ] **3.4** Guards en rutas
  - `<RoleRoute requiredRole="admin">` wrapper
  - Sidebar oculta opciones según rol
  - Feature flags + roles combinados

**Esfuerzo:** ~6-8h (Juanse)
**Dependencias:** Fase 2 (necesita la navegación unificada)

---

### Fase 4 — Agent ↔ App Assignment
**Scope:** Asignar agentes a trabajar en apps específicas.

- [ ] **4.1** Concepto de "workspace" o "dominio" por agente
  - Cada agente puede estar asignado a una o más apps
  - Ej: Paula → "Personal" (correo, calendario), Nando → "Outreach" (ventas), Juanse → "Platform" (código)
  - Nuevo campo en `agents`: `assigned_apps: text[]` (default: all)

- [ ] **4.2** UI de asignación
  - En Agent Detail, sección "Apps asignadas" con checkboxes
  - En cada app, mostrar qué agentes están asignados a ella

- [ ] **4.3** Filtrado inteligente
  - Cuando Chief delega tareas, solo considera agentes asignados a la app relevante
  - Task routing: tareas de "outreach" solo van a agentes con app "outreach"

- [ ] **4.4** Dashboard por app
  - Cada app muestra sus agentes, sus tasks, su actividad
  - Vista consolidada en "Agents" muestra todo

**Esfuerzo:** ~4-6h (Juanse + Sofi)
**Dependencias:** Fase 2 + 3

---

## Orden de ejecución recomendado

```
Fase 1 (Skills Dashboard)     → AHORA, independiente, alto valor
    ↓
Fase 2 (Navegación unificada) → Siguiente, requiere diseño de Sofi
    ↓
Fase 3 (Roles/permisos)       → Después de nav, incremental
    ↓
Fase 4 (Agent ↔ App)          → Último, depende de todo lo anterior
```

## Estimado total
- **Fase 1:** 4-6h → yo (Claude Code) puedo hacer ahora
- **Fase 2:** 8-12h → proyecto para Sofi + Juanse (UX + implementación)
- **Fase 3:** 6-8h → Juanse
- **Fase 4:** 4-6h → Juanse + Sofi
- **Total:** ~25-30h de trabajo
- **Costo estimado con agentes:** ~$15-25 (con las optimizaciones de cost activas)

## Decisiones que necesito del usuario
1. ¿Empezamos con Fase 1 ahora (yo lo hago) y Fases 2-4 como proyecto de agentes?
2. ¿La Solar Navigation se queda como landing o se elimina completamente?
3. ¿Hay apps adicionales que quieras agregar al sistema? (ej: Analytics, Marketing, Support)
4. ¿Los roles actuales (Admin/Manager/Member/Viewer) están bien o quieres otros?
