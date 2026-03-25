---
name: gestionar-leads
version: "1.0"
description: Operaciones CRUD sobre leads — crear, listar, actualizar estado, asignar a cadencias
---

# Gestionar Leads

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Ver sus leads actuales
- Crear un nuevo lead manualmente
- Actualizar el estado de un lead
- Asignar leads a una cadencia
- Remover leads de una cadencia
- Buscar leads por criterios específicos
- Cambiar etapa o estado de un lead

## API Endpoints

### Listar leads
```
GET https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/leads?select=*&org_id=eq.{org_id}&order=created_at.desc&limit=20
```

### Crear lead
```
POST https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/leads
```

### Actualizar lead
```
PATCH https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/leads?id=eq.{lead_id}&org_id=eq.{org_id}
```

### Asignar a cadencia
```
POST https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/cadence_leads
```

### Headers
```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
apikey: {SUPABASE_SERVICE_ROLE_KEY}
Content-Type: application/json
Prefer: return=representation
```

### Lead Body (crear)
```json
{
  "org_id": "uuid",
  "first_name": "Juan",
  "last_name": "García",
  "email": "juan@techco.com",
  "company": "TechCo",
  "title": "VP Engineering",
  "linkedin_url": "https://linkedin.com/in/juangarcia",
  "provider_id": "ACoAAA...",
  "status": "new",
  "source": "manual"
}
```

### Cadence Lead Body (asignar)
```json
{
  "cadence_id": "uuid",
  "lead_id": "uuid",
  "org_id": "uuid",
  "status": "active",
  "current_step": 1
}
```

### Filtros para listar
- `status=eq.{status}` — new, contacted, replied, qualified, converted, lost
- `company=eq.{company}` — Filtrar por empresa
- `cadence_id=eq.{uuid}` — Leads en una cadencia específica (via cadence_leads join)

## Estados de lead
- `new` — Recién creado/promovido
- `contacted` — Primer contacto realizado
- `replied` — Respondió
- `qualified` — Calificado para seguimiento
- `meeting_booked` — Reunión agendada
- `converted` — Convertido a oportunidad
- `lost` — Descartado/no interesado

## Parámetros requeridos
- `org_id` — ID de la organización

## Ejemplo de conversación

**Usuario:** ¿Cuántos leads nuevos tengo esta semana?
**Chief:** Consultando leads nuevos de esta semana...

📋 **Leads nuevos (últimos 7 días): 23**

| # | Nombre | Empresa | Título | Estado |
|---|--------|---------|--------|--------|
| 1 | María López | TechCo | VP Eng | new |
| 2 | Carlos Ruiz | DataCorp | CTO | contacted |
| 3 | Ana Torres | FinApp | Dir Sales | replied |
| ... | | | | |

**Resumen por estado:**
- 🆕 Nuevos: 15
- 📤 Contactados: 5
- 💬 Respondieron: 3

¿Quieres asignar los nuevos a alguna cadencia?

---

**Usuario:** Asigna a María López a la cadencia Enterprise Q1
**Chief:** ✅ María López asignada a "Enterprise Q1" — empezará en el paso 1 mañana (día hábil).
