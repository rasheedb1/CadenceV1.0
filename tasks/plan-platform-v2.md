# Plan: Chief Platform — Reestructura completa

## Visión del usuario
> "Al hacer login entro a ver TODO, no solo Chief Outreach. Cada organización tiene sus agentes, cada persona tiene sus agentes dentro de la organización. Las apps (Outreach, AE, etc.) son módulos dentro de la plataforma, no la experiencia principal."

## Cambio fundamental
**ANTES:** Chief = Sales Automation tool. Agents es un add-on. Login → Outreach.
**DESPUÉS:** Chief = AI Platform. Las apps (Outreach, AE, etc.) son módulos. Login → Platform home con org overview.

## Arquitectura propuesta

### Nivel 1: Platform Home (post-login)
```
/                    → Platform Home (overview de la org)
├── Mis agentes activos + estado
├── Actividad reciente (tasks, correos, leads)
├── Integraciones conectadas
├── Acceso rápido a las apps
└── Métricas clave
```

### Nivel 2: Apps como módulos
```
/agents              → AI Agents (gestión de agentes, projects, skills)
/agents/:id          → Agent Detail (skills, personalidad, workload)
/outreach            → Chief Outreach (cadences, leads, templates)
/account-executive   → Account Executive (accounts, CRM, calendar)
/settings            → Platform Settings (org, members, integrations, billing)
```

### Nivel 3: Org & Members
```
Organization
├── Members (con roles: Admin, Manager, Member, Viewer)
├── Agents (compartidos por toda la org)
├── Integrations (compartidas por org)
└── Apps habilitadas (feature flags por org)

Cada member:
├── Puede ver/usar los agentes de la org según su rol
├── Puede tener integraciones personales (ej: su propio Gmail)
└── Ve las apps según sus permisos
```

## Fases de implementación

### Fase 1 — Platform Home + Layout nuevo (~8h)
**Objetivo:** Login → ves tu org, no una app específica.

1. **Nuevo AppShell** (reemplaza MainLayout):
   - Header: logo, org switcher, user menu, notifications
   - Sidebar izquierdo con app icons (tipo Slack/Linear):
     ```
     🏠 Home
     🤖 Agents
     📨 Outreach
     💼 AE
     ⚙️ Settings
     ```
   - Click en app → carga el contenido + sub-navegación de esa app
   - App activa highlighted en sidebar

2. **Platform Home** (`/`):
   - Reemplaza AppLauncher (Solar Navigation → opcional, no bloqueante)
   - Cards: Agentes activos, Tasks en progreso, Correos no leídos, Próximas reuniones
   - Quick actions: "Crear agente", "Nueva cadencia", "Conectar integración"

3. **Cada app tiene su sub-layout**:
   - Outreach: sidebar con sus secciones (cadences, leads, etc.) — lo que ya existe
   - AE: su propia sub-nav
   - Agents: su propia sub-nav (Grid, Org, Activity, Kanban, Rendimiento, Integraciones)

### Fase 2 — Org-scoped everything (~6h)
**Objetivo:** Todo vive dentro de la org, no dentro de una app.

1. **Integrations scoped a org** (ya hecho con `agent_integrations`)
2. **Agents scoped a org** (ya hecho — `agents.org_id`)
3. **Settings centralizados**:
   - `/settings/org` — nombre, logo, plan
   - `/settings/members` — invitar, roles, permisos
   - `/settings/integrations` — conectar/desconectar (lo que hoy está en tab Integraciones de Agents)
   - `/settings/billing` — plan, uso, costos

### Fase 3 — Roles y permisos reales (~4h)
**Objetivo:** Cada member ve según su rol.

1. **Admin:** todo. Crear agentes, conectar integraciones, gestionar members.
2. **Manager:** usar agentes, crear proyectos, ver integraciones. No crear agentes.
3. **Member:** interactuar con agentes, usar apps. No config.
4. **Viewer:** solo lectura.
5. Guards en rutas + sidebar filtra por rol.

### Fase 4 — Agent ownership (~3h)
**Objetivo:** Los agentes pertenecen a la org, pero pueden asignarse a personas.

1. Campo `assigned_to_user_id` opcional en `agents`
2. "Mis agentes" vs "Agentes del equipo" en la vista de Agents
3. Paula puede ser "mi asistente personal" vs Juanse es "del equipo"

## Lo que NO se toca
- Backend de agentes (chief-agents/, event loop, SDK)
- Bridge (openclaw/bridge/)
- Integraciones (ya hechas, se quedan)
- Skills panel (ya hecho, se queda)
- Cost optimization (Fases 1-3, ya activas)

## Decisiones pendientes
1. ¿Solar Navigation se queda como animación en Home o se elimina?
2. ¿El sidebar de apps es iconos (tipo Slack) o texto (tipo Linear)?
3. ¿Outreach y AE son apps separadas o se fusionan en una sola "Sales"?
4. ¿Cada member puede tener SU propia conexión Gmail, o es una por org?

## Quién lo ejecuta
- **Opción A:** Claude Code (yo) en sesiones dedicadas
- **Opción B:** Los agentes (Sofi diseña → Juanse implementa)
- **Opción C:** Híbrido — yo hago la estructura (AppShell, routing, contexts), los agentes hacen la UI/UX

## Estimado
- Fase 1: ~8h (el más grande)
- Fase 2: ~6h
- Fase 3: ~4h
- Fase 4: ~3h
- **Total: ~21h**
