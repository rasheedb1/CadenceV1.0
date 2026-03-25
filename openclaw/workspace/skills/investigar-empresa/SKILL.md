---
name: investigar-empresa
version: "1.0"
description: Investiga una empresa a fondo — scraping web, noticias, financieros, competidores
---

# Investigar Empresa

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Investigar una empresa antes de contactarla
- Obtener información actualizada de una cuenta
- Preparar un approach personalizado
- Conocer noticias recientes, competidores, o situación financiera

## API Endpoint

```
POST https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/company-research
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
  "company_linkedin_url": "https://linkedin.com/company/rappi",
  "depth": "deep"
}
```

### Response
```json
{
  "success": true,
  "research": {
    "company_name": "Rappi",
    "description": "...",
    "industry": "Delivery/Tech",
    "employee_count": 5000,
    "founded": 2015,
    "headquarters": "Bogotá, Colombia",
    "recent_news": ["..."],
    "competitors": ["..."],
    "technologies": ["..."],
    "key_insights": ["..."],
    "financial_info": "..."
  }
}
```

## Parámetros requeridos
- `org_id` — ID de la organización
- `company_name` — Nombre de la empresa

## Parámetros opcionales
- `company_domain` — Dominio web (mejora la precisión del scraping)
- `company_linkedin_url` — URL de LinkedIn de la empresa
- `depth` — Profundidad: "quick" (rápido) o "deep" (completo, default)

## Ejemplo de conversación

**Usuario:** Investiga Kavak antes de contactar a su VP de Tech
**Chief:** Investigando Kavak...

📊 **Kavak** — Marketplace de autos usados
- 🏢 Industria: Automotive Tech / Marketplace
- 👥 ~5,000 empleados
- 📍 HQ: Ciudad de México
- 💰 Última ronda: $700M Serie E (2021)
- 🔧 Tech stack: React, Node.js, AWS, Kubernetes

📰 **Noticias recientes:**
- Reestructuración y reducción de personal en 2023
- Expansión en Brasil y Turquía
- Nuevo enfoque en rentabilidad

💡 **Insights para el approach:**
- Están optimizando costos — propuesta de ahorro resonaría
- El equipo de tech está en modo eficiencia
- Buena oportunidad de hablar de ROI y automatización

¿Quieres que prepare un business case personalizado?
