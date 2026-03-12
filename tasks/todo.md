# UX Restructure: 3-Section Sidebar

## Objetivo
Reorganizar el sidebar en 3 secciones claras para mejorar usabilidad.
Sin cambios en lógica de negocio. Solo UX/navegación.

## Análisis de impacto
- ✅ Todos los routes existentes se mantienen
- ✅ Feature flags funcionan igual
- ✅ Notificaciones badge se preserva
- ✅ Admin/Super Admin gating se mantiene
- ✅ Modo AE (Account Executive) no cambia
- ⚠️ Account Research (Daily) y Company Research (Tracker) = mismo `/company-research` - OK
- ⚠️ ICP Setup → `/account-mapping?tab=icp-profiles` (tab ya existe)
- ⚠️ Buying Persona → `/account-mapping?tab=buyer-personas` (NUEVO tab, datos ya en DB)

## Nueva Estructura del Sidebar

### Daily Use
- Dashboard → `/`
- Account Mapping → `/account-mapping` (ff: section_account_mapping)
- Account Research → `/company-research` (ff: section_company_research)
- Cadences → `/cadences` (ff: section_cadences)
- Notifications → `/notifications` [badge] (ff: section_notifications)
- LinkedIn Inbox → `/inbox` (ff: section_linkedin_inbox)
- Outreach Activity → `/outreach` (ff: section_cadences)

### One Time Use
- ICP Setup → `/account-mapping?tab=icp-profiles` (ff: section_account_mapping)
- Buying Persona → `/account-mapping?tab=buyer-personas` (ff: section_account_mapping)
- AI Prompts → `/ai-prompts` (ff: section_ai_prompts)
- Business Cases → `/business-cases` (ff: section_business_cases)
- Templates → `/templates` (ff: section_templates)
- Workflows → `/workflows` (ff: section_workflows)

### Tracker
- Leads → `/leads` (ff: section_leads)
- Company Research → `/company-research` (ff: section_company_research)
- Company Registry → `/company-registry` (ff: section_company_registry)

### Bottom (siempre visible)
- Settings → `/settings`
- Admin → `/admin` (admin only)
- Super Admin → `/super-admin/organizations` (super admin only)

## Checkboxes
- [x] Plan escrito
- [ ] Sidebar.tsx - Restructurar en 3 secciones colapsibles
- [ ] AccountMapping.tsx - Agregar tab buyer-personas + URL query param

## Archivos a modificar
1. `src/components/layout/Sidebar.tsx`
2. `src/pages/AccountMapping.tsx`
