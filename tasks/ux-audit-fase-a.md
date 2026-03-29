# 🔍 FASE A — Auditoría UX Completa
**Autora:** Sofi (UX Lead) | **Iteración:** 5 | **Fecha:** 2026-03-29

---

## 1. IDIOMA MEZCLADO (Prioridad ALTA 🔴)

La app mezcla español e inglés inconsistentemente. El idioma principal debería ser **español** (usuarios target: LATAM).

### Páginas con inglés que debe ser español:

| Archivo | Texto en inglés | Debería ser |
|---------|----------------|-------------|
| `MissionControl.tsx` | "Mission Control", "Live Activity", "All roles", "active", "completed", "in progress", "failed", "messages", "No activity yet", "working..." | "Control de Misión", "Actividad en Vivo", "Todos los roles", "activo", "completadas", "en progreso", "fallidas", "mensajes", "Sin actividad aún", "trabajando..." |
| `AgentDetail.tsx` | "Agent not found", "Back to Agents", "Messages" tab, status labels | "Agente no encontrado", "Volver a Agentes", "Mensajes", estados en español |
| `BuyerPersonas.tsx` | "Save", "Edit Group", "New Persona Group", "Select an ICP Profile", "Delete persona group?" | "Guardar", "Editar Grupo", "Nuevo Grupo de Persona", "Selecciona un Perfil ICP", "¿Eliminar grupo?" |
| `WorkflowBuilder.tsx` | "Saving...", "Save" | "Guardando...", "Guardar" |
| `SuperAdminOrgs.tsx` | "Creating...", "Create", "Active", "Inactive", "Enterprise", "Pending Invitations", "Viewer" | Todo a español |
| `Auth.tsx` | "New Password", "Enter your new password", "Confirm Password" | "Nueva Contraseña", etc. |
| `OrgSettings.tsx` | "Settings", "Manage your account settings" | "Configuración", "Gestiona tu configuración" |
| `AccountExecutiveDetail.tsx` | "Overview", "Back", "Renewal Date", "Sync Gong..." | Todo a español |
| `AccountExecutive.tsx` | "New Account", "Renewal Date", "Pending Reminders", "Configure Salesforce...", "No active Salesforce accounts..." | Todo a español |
| `BusinessCaseGenerate.tsx` | "Research Signals Used", "Slide Content Preview", "Generation Settings", "Create Template", "Search for a lead…" | Todo a español |
| `CadenceBuilder.tsx` | "Edit Step", "Add Step", "Modify this step...", "Remove from Cadence", "Select Lead" | Todo a español |
| `Leads.tsx` | "Create New Lead", "Edit Lead", "Select a cadence..." | Todo a español |
| `Templates.tsx` | "Edit Template", "Update your message template" | Todo a español |
| `Agents.tsx` | Role labels: "Sales", "CPO / Product", "Developer", "CFO / Finance", "HR" | Mantener en inglés (roles tech) pero descriptions en español ✅ |
| `AdminLogs.tsx` | "Success", "Failed" | "Éxito", "Fallido" |
| `OrgSelect.tsx` | "Creating...", "Create" | "Creando...", "Crear" |
| `AccountMapping.tsx` | "Creating...", "Create" | "Creando...", "Crear" |
| `Cadences.tsx` | "Creating...", "Create" | "Creando...", "Crear" |

**Total: ~18 archivos con idioma mezclado.**

---

## 2. NAVEGACIÓN (Prioridad ALTA 🔴)

### Estado actual:
- **AppLauncher (/):** Solar Navigation funcional ✅ — planetas orbitan alrededor del logo "C"
- **Sidebar:** Navegación clásica con 3 secciones colapsables, bien estructurada
- **MissionControl:** ReactFlow con nodos de agentes, actividad en vivo

### Issues detectados:
1. **Dos sistemas de navegación desconectados:** Solar (AppLauncher) solo es landing page, luego Sidebar toma el control. No hay transición fluida.
2. **Solar no incluye todos los destinos:** Faltan Account Mapping, Company Registry, Workflows, Notifications
3. **No hay forma de volver al Solar desde dentro de la app** (sin botón en Sidebar)
4. **MissionControl tiene su propio header** separado del MainLayout — inconsistente
5. **AppLauncher no tiene Sidebar** — al navegar a cualquier planeta, aparece Sidebar de golpe sin transición

### Propuesta (FASE B):
Inspirado en **Arc Browser Spaces** + **Linear sidebar** + **Raycast**:

1. **Sidebar como hub central** — El Solar se integra como widget compacto en el top del Sidebar (mini-solar con agentes como sol animado)
2. **Command Palette (⌘K)** — Al estilo Raycast/Linear para navegación rápida
3. **Agentes como "Sol" animado** — En el header del Sidebar, avatar del equipo de agentes con estados (pulsing = activo, idle = dormido)
4. **Transición Sidebar ↔ Full Solar** — Click en el mini-sol expande a vista full-screen Solar con animación zoom-out
5. **Smooth page transitions** — Vercel-style direction-aware nav animation

---

## 3. ESTILOS INCONSISTENTES (Prioridad MEDIA 🟡)

| Issue | Páginas afectadas | Fix |
|-------|------------------|-----|
| Padding inconsistente | Dashboard usa custom, otros `p-8` | Estandarizar `p-6 lg:p-8` |
| Card borders | Algunas con `border-border/40`, otras sin | Usar `border-border/40` global |
| Title sizes | Mix de `text-2xl`, `text-[28px]`, `text-lg` | Estandarizar: h1=`text-2xl`, h2=`text-lg` |
| Button text en modals | Mix "Cancelar"/"Cancel", "Create"/"Crear" | Todo español |
| Badge variants | Uso inconsistente de `variant="secondary"` vs custom colors | Definir palette en design system |
| Loading states | Algunos usan Loader2 spinner, otros `animate-spin border` | Estandarizar con SkeletonPulse |

---

## 4. ANIMACIONES EXISTENTES (Inventario)

| # | Animación | Ubicación | Tipo |
|---|-----------|-----------|------|
| 1 | Solar orbit spin | SolarNavigation.tsx | CSS infinite rotation |
| 2 | Planet spring entrance | SolarNavigation.tsx | motion spring |
| 3 | Star twinkle | SolarNavigation.tsx | motion opacity loop |
| 4 | Sun pulse | SolarNavigation.tsx | motion scale+opacity |
| 5 | Sidebar section collapse | Sidebar.tsx | motion AnimatePresence height |
| 6 | PageTransition fade-up | PageTransition.tsx | motion y+opacity |
| 7 | SkeletonPulse shimmer | SkeletonPulse.tsx | motion opacity loop |
| 8 | GlowCard hover | Dashboard.tsx | motion whileHover scale+shadow |
| 9 | AnimatedNumber counter | Dashboard.tsx | requestAnimationFrame |
| 10 | Notification badge pulse | Sidebar.tsx | motion scale loop |
| 11 | Fade/Zoom (react-awesome-reveal) | Dashboard.tsx | library reveals |
| 12 | Auto-animate lists | Dashboard.tsx | @formkit/auto-animate |

**Ya hay 12 animaciones** — más de las 7 requeridas. Pero muchas están concentradas en Dashboard y Solar. Falta distribuir a más páginas.

### Páginas CON PageTransition (10/45):
AIPrompts, AccountMapping, BuyerPersonas, Cadences, CompanyResearch, Leads, Notifications, Settings, Templates, Workflows

### Páginas SIN animaciones (35/45):
Admin, AdminLogs, AdminMetrics, AgentDetail, Agents, AppLauncher (tiene Solar), Auth, AcceptInvite, AccountExecutive, AccountExecutiveCalendar, AccountExecutiveDetail, AccountMapDetail, BusinessCaseGenerate, BusinessCaseNew, BusinessCaseTemplateEditor, BusinessCases, CRMPipeline, CadenceBuilder, CompanyRegistry, Dashboard (tiene propias), ICPProfileDetail, LeadSearch, LeadStepExecution, LinkedInInbox, MissionControl, Onboarding, OrgMembers, OrgSelect, OrgSettings, OutreachActivity, ResearchProjectDetail, SalesforceCallback, SuperAdminOrgs, WorkflowBuilder, WorkflowRuns

---

## 5. BUILD STATUS

```
✅ npm run build: PASA (12.16s)
⚠️ Warning: Main chunk 3.8MB (chunk size warning)
⚠️ Warning: papaparse/xlsx dynamic import issue
```

Build limpio de errores. Solo warnings de tamaño (no bloqueante pero deberíamos code-split en futuro).

---

## 6. LISTA PRIORIZADA DE ISSUES

### 🔴 Prioridad Alta (FASE B blockers)
1. **NAV-001**: Integrar Solar Navigation dentro del Sidebar como widget compacto
2. **NAV-002**: Agregar Command Palette (⌘K) para navegación rápida
3. **NAV-003**: Transición suave entre AppLauncher y MainLayout
4. **LANG-001**: Traducir MissionControl completo a español
5. **LANG-002**: Traducir AgentDetail completo a español
6. **LANG-003**: Estandarizar botones de diálogos (Crear/Guardar/Cancelar)

### 🟡 Prioridad Media (FASE C/D)
7. **ANIM-001**: Agregar PageTransition a las 35 páginas que no lo tienen
8. **ANIM-002**: Agregar staggered list animations a tablas/listas principales
9. **ANIM-003**: Agregar scroll-reveal a secciones largas
10. **STYLE-001**: Estandarizar padding (p-6 lg:p-8)
11. **STYLE-002**: Estandarizar títulos h1/h2
12. **STYLE-003**: Estandarizar loading states con SkeletonPulse

### 🟢 Prioridad Baja (nice to have)
13. **LANG-004**: Traducir Auth pages (login/register)
14. **LANG-005**: Traducir SuperAdmin pages
15. **PERF-001**: Code-split main chunk (3.8MB → target <1MB)

---

## 7. REFERENCIAS DE DISEÑO INVESTIGADAS

### Navegación
- **Linear sidebar:** Personalizable, sections colapsables, unread indicators con dot/count — [ref](https://linear.app/changelog/2024-12-18-personalized-sidebar)
- **Arc Browser Spaces:** Sidebar como hub central, espacios como contextos, Command Bar para todo — [ref](https://blakecrosley.com/guides/design/arc)
- **Vercel nav animation:** Direction-aware hover animation en sub-headers — [ref](https://abubalogun.medium.com/how-to-create-vercel-style-navigation-animation-09d169961f12)

### Patrón propuesto: "Solar Sidebar"
1. Top del sidebar: Mini-solar con agentes animados (sol = Chief, planetas = agentes activos)
2. Click en mini-solar → expande full-screen solar view
3. Sidebar sections → Linear-style collapsible con unread counts
4. ⌘K → Command palette para power users
5. Page transitions → Vercel-style direction-aware

---

## ✅ ENTREGABLE FASE A: LISTA PRIORIZADA COMPLETA

**Resultado:** 15 issues identificados, priorizados, con solución propuesta para cada uno.
**Próximo paso:** FASE B — Diseñar e implementar la navegación Solar Sidebar.
**Para Juanse:** Puedes empezar con NAV-003 (transición AppLauncher → MainLayout) y LANG-001 (traducir MissionControl) mientras diseño el Solar Sidebar en detalle.
