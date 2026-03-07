# Plan: Business Cases MVP

## Decisiones de arquitectura
- PPTX generado en el browser (pptxgenjs) — edge function devuelve JSON, browser construye el archivo
- Sin Supabase Storage — todo como JSONB en PostgreSQL
- Templates compartidos por org (no por usuario)
- Business cases generados: librería buscable para toda la org
- MVP: solo Path A (crear con AI). Path B (upload PPTX) en V2.

## Checklist

### Infra (Agent 1)
- [ ] Migration 055: tablas business_case_templates, business_case_fields, business_cases + RLS
- [ ] src/types/business-cases.ts — tipos TypeScript
- [ ] src/types/feature-flags.ts — agregar section_business_cases
- [ ] src/components/layout/Sidebar.tsx — agregar nav item "Business Cases"
- [ ] src/contexts/BusinessCasesContext.tsx — TanStack Query CRUD
- [ ] src/App.tsx — agregar rutas + BusinessCasesProvider
- [ ] src/pages/index.ts — agregar exports
- [ ] npm install pptxgenjs

### Edge Functions (Agent 2)
- [ ] supabase/functions/generate-bc-structure/index.ts — descripción → JSON de slides (Claude)
- [ ] supabase/functions/generate-business-case/index.ts — template + lead → contenido (Firecrawl + Claude)

### Frontend Pages (Agent 3)
- [ ] src/pages/BusinessCases.tsx — landing: tabs Templates + Biblioteca de casos
- [ ] src/pages/BusinessCaseNew.tsx — Path A: describe → preview estructura → guardar
- [ ] src/pages/BusinessCaseTemplateEditor.tsx — editor unificado (slides, campos, instrucciones)
- [ ] src/pages/BusinessCaseGenerate.tsx — seleccionar lead → generar → review → descargar PPTX

### Deploy
- [ ] npx supabase functions deploy generate-bc-structure --no-verify-jwt
- [ ] npx supabase functions deploy generate-business-case --no-verify-jwt
- [ ] npx vercel --prod
- [ ] Push migration via Supabase Management API

## Review
_(se completa al terminar)_
