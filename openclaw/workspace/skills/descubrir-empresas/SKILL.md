---
name: descubrir-empresas
version: "1.0"
description: Descubre empresas que coinciden con el perfil de cliente ideal (ICP)
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

# Descubrir Empresas

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Encontrar empresas que encajen con su ICP (perfil de cliente ideal)
- Descubrir nuevas cuentas para prospectar
- Buscar empresas por industria, tamaño, ubicación u otros criterios
- Generar listas de empresas target

## API Endpoint

```
POST https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/discover-icp-companies
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
  "icp_profile_id": "uuid",
  "criteria": {
    "industries": ["SaaS", "FinTech"],
    "employee_range": "50-500",
    "revenue_range": "$10M-$100M",
    "locations": ["LATAM", "Mexico", "Colombia"],
    "technologies": ["Salesforce", "HubSpot"]
  },
  "limit": 20,
  "exclude_existing": true
}
```

### Response
```json
{
  "success": true,
  "companies": [
    {
      "name": "TechCo",
      "domain": "techco.com",
      "industry": "SaaS",
      "employee_count": 200,
      "location": "Ciudad de México",
      "description": "Plataforma de pagos digitales"
    }
  ],
  "total_found": 15
}
```

## Parámetros requeridos
- `org_id` — ID de la organización
- Al menos un criterio de búsqueda (industria, tamaño, ubicación, etc.)

## Parámetros opcionales
- `icp_profile_id` — ID del perfil ICP para usar sus criterios
- `limit` — Máximo de resultados (default: 20)
- `exclude_existing` — Excluir empresas ya en el pipeline (default: true)

## Ejemplo de conversación

**Usuario:** Busca empresas SaaS en México con más de 100 empleados
**Chief:** Buscando empresas que coincidan con tus criterios...

*[Llama discover-icp-companies]*

Encontré 12 empresas que encajan:

1. 🏢 **PayClip** — FinTech/SaaS, 350 empleados, CDMX
2. 🏢 **Konfío** — FinTech/SaaS, 500 empleados, CDMX
3. 🏢 **Clara** — FinTech/SaaS, 400 empleados, CDMX
...

¿Quieres que busque prospectos en alguna de estas empresas?
