---
name: business-case
version: "1.0"
description: Genera un business case personalizado para una empresa objetivo
command-dispatch: tool
metadata:
  openclaw:
    requires:
      env:
        - SUPABASE_URL
        - SUPABASE_SERVICE_ROLE_KEY
      bins:
        - curl
        - jq
---

# Business Case

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Generar un business case para una cuenta específica
- Preparar una propuesta de valor personalizada
- Crear material de ventas para una reunión
- Armar un pitch personalizado basado en research de la empresa

## API Endpoint

```
POST https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/generate-business-case
```

### Headers
```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
Content-Type: application/json
```

### Request Body
```json
{
  "org_id": "uuid",
  "company_name": "Rappi",
  "company_domain": "rappi.com",
  "prospect_name": "María López",
  "prospect_title": "VP Engineering",
  "pain_points": ["Costos altos de infraestructura", "Tiempo de deploy largo"],
  "our_solution": "Plataforma de automatización de ventas con IA",
  "research_data": {},
  "language": "es"
}
```

### Response
```json
{
  "success": true,
  "business_case": {
    "executive_summary": "...",
    "problem_statement": "...",
    "proposed_solution": "...",
    "roi_analysis": "...",
    "timeline": "...",
    "next_steps": "..."
  }
}
```

## Parámetros requeridos
- `org_id` — ID de la organización
- `company_name` — Nombre de la empresa target

## Parámetros opcionales
- `company_domain` — Dominio web
- `prospect_name` — Nombre del contacto principal
- `prospect_title` — Título del contacto
- `pain_points` — Problemas identificados
- `our_solution` — Descripción de nuestra solución
- `research_data` — Datos de investigación previa (de la skill investigar-empresa)
- `language` — Idioma ("es" para español, "en" para inglés)

## Ejemplo de conversación

**Usuario:** Genera un business case para Rappi, voy a hablar con su VP de Engineering
**Chief:** Generando business case personalizado para Rappi...

📋 **Business Case: Rappi**
*Para: María López, VP Engineering*

**Resumen Ejecutivo:**
Rappi está en fase de optimización operativa tras su última reestructuración. Nuestra plataforma puede reducir el costo de adquisición de clientes empresariales en un 40% automatizando el proceso de prospección y outreach.

**Problema Identificado:**
- Equipo de ventas manual con alto costo por lead
- Ciclo de ventas largo (90+ días) en segmento enterprise

**Solución Propuesta:**
- Automatización de cadencias multi-canal
- IA para investigación y personalización
- Integración directa con su CRM

**ROI Estimado:**
- Reducción de 40% en costo por lead
- Ahorro de 20h/semana por SDR
- Incremento de 25% en tasa de respuesta

¿Quieres que lo envíe como PDF o que ajuste algo?
