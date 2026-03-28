---
name: gestionar-agentes
version: "1.0"
description: Crea, lista o elimina agentes AI de la organización
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

# Gestionar Agentes AI

## Cuando usar
Cuando el usuario quiere crear un nuevo agente con un rol específico, ver qué agentes tiene, obtener detalles de uno, o eliminar un agente que ya no necesita.

## API Endpoint
POST/GET/PATCH/DELETE https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/manage-agent

### Headers
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
Content-Type: application/json

### Operación: create
```json
{
  "org_id": "uuid",
  "name": "CPO Agent",
  "role": "cpo",
  "description": "Gestiona producto, prioriza features y analiza feedback",
  "soul_md": "...",
  "skills": ["crear-prd", "priorizar-features"]
}
```

### Operación: list
GET ?org_id=uuid

### Operación: delete
```json
{
  "agent_id": "uuid"
}
```

### Response
```json
{
  "success": true,
  "agent": {
    "id": "uuid",
    "name": "CPO Agent",
    "role": "cpo",
    "status": "draft",
    "agent_skills": [...]
  }
}
```

## Parametros requeridos
- org_id (siempre)
- operation: "create", "list", "get", "delete"

## Parametros según operación
- create: name, role, description, skills[]
- get/delete: agent_id

## Ejemplo de conversación
**Usuario:** Crea un agente que sea mi CPO y que se encargue de producto
**Chief:** 👤 Voy a crear un agente CPO. Confirmo los detalles:

- **Nombre:** CPO Agent
- **Rol:** CPO / Product
- **Descripción:** Se encarga de gestión de producto, priorización de features y análisis de feedback de clientes

¿Confirmo? ✅

**Usuario:** Sí dale
**Chief:** ✅ **Agente creado:**
- 👤 CPO Agent (cpo)
- 📋 Status: draft (pendiente de despliegue)

Cuando lo despliegues podrás decirme "dile al CPO que..." y le enviaré la tarea directamente.
