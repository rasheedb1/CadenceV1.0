---
name: enriquecer-prospectos
version: "1.0"
description: Enriquece prospectos con datos adicionales — email, teléfono, LinkedIn profile
---

# Enriquecer Prospectos

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Obtener el email de un prospecto
- Enriquecer datos de contacto (teléfono, email verificado)
- Completar información faltante de un prospecto
- Validar datos de contacto existentes

## API Endpoint

```
POST https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/enrich-prospect
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
  "prospect_id": "uuid",
  "first_name": "María",
  "last_name": "López",
  "company": "TechCo",
  "company_domain": "techco.com",
  "linkedin_url": "https://linkedin.com/in/marialopez",
  "enrich_email": true,
  "enrich_phone": true
}
```

### Response
```json
{
  "success": true,
  "enrichment": {
    "email": "maria.lopez@techco.com",
    "email_verified": true,
    "phone": "+52 55 1234 5678",
    "linkedin_url": "https://linkedin.com/in/marialopez",
    "title": "VP Engineering",
    "seniority": "VP"
  }
}
```

## Parámetros requeridos
- `org_id` — ID de la organización
- Al menos uno de: `prospect_id`, o combinación de `first_name` + `last_name` + `company`

## Parámetros opcionales
- `company_domain` — Dominio de la empresa (mejora precisión del email)
- `linkedin_url` — URL de LinkedIn del prospecto
- `enrich_email` — Buscar email (default: true)
- `enrich_phone` — Buscar teléfono (default: false)

## Ejemplo de conversación

**Usuario:** Enriquece a María López de TechCo, necesito su email
**Chief:** Enriqueciendo datos de María López @ TechCo...

✅ **María López** — VP Engineering @ TechCo
- 📧 Email: maria.lopez@techco.com (verificado ✓)
- 🔗 LinkedIn: linkedin.com/in/marialopez
- 📱 Teléfono: no disponible

¿Quieres agregarla a una cadencia?
