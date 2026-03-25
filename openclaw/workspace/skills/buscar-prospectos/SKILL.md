---
name: buscar-prospectos
version: "1.0"
description: Busca prospectos usando búsqueda en cascada (LinkedIn Sales Navigator L1→L2→L3)
---

# Buscar Prospectos

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Buscar prospectos o contactos en una empresa específica
- Encontrar personas con ciertos títulos o roles
- Ejecutar una búsqueda en cascada de Sales Navigator
- Encontrar decision-makers en una cuenta

## API Endpoint

```
POST https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/cascade-search-company
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
  "company_name": "Empresa S.A.",
  "company_domain": "empresa.com",
  "buyer_persona_id": "uuid (optional)",
  "titles": ["CEO", "CTO", "VP Sales"],
  "seniority_levels": ["Director", "VP", "C-Suite"],
  "limit": 10,
  "account_mapping_company_id": "uuid (optional)"
}
```

### Response
```json
{
  "success": true,
  "prospects": [
    {
      "id": "uuid",
      "first_name": "Juan",
      "last_name": "García",
      "title": "CEO",
      "company": "Empresa S.A.",
      "linkedin_url": "https://linkedin.com/in/juangarcia",
      "search_level": "L1"
    }
  ],
  "total_found": 5,
  "search_levels_used": ["L1", "L2"]
}
```

## Parámetros requeridos
- `org_id` — ID de la organización (preguntar si no se tiene)
- `company_name` — Nombre de la empresa a buscar

## Parámetros opcionales
- `titles` — Lista de títulos/cargos a buscar
- `seniority_levels` — Niveles de seniority
- `limit` — Máximo de resultados (default: 10)
- `buyer_persona_id` — ID de persona compradora para filtrar
- `company_domain` — Dominio web de la empresa
- `account_mapping_company_id` — ID de la empresa en account mapping

## Ejemplo de conversación

**Usuario:** Busca prospectos en Mercado Libre, necesito VPs de ingeniería
**Chief:** Buscando prospectos en Mercado Libre con título VP de Ingeniería...

*[Llama cascade-search-company con company_name: "Mercado Libre", titles: ["VP Engineering", "VP Ingeniería"]]*

Encontré 3 prospectos:
1. 👤 **María López** — VP Engineering @ Mercado Libre
2. 👤 **Carlos Ruiz** — VP Platform Engineering @ Mercado Libre
3. 👤 **Ana Torres** — VP Software Engineering @ Mercado Libre

¿Quieres que los enriquezca o los agregue a una cadencia?
