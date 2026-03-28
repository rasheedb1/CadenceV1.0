---
name: crear-cadencia
version: "1.0"
description: Crea una cadencia de outreach con pasos secuenciales (LinkedIn, email, llamadas)
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

# Crear Cadencia

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Crear una nueva cadencia o secuencia de outreach
- Configurar pasos de contacto automáticos
- Armar un flujo de LinkedIn + email + llamadas
- Programar seguimientos automáticos

## API Endpoint

Crear la cadencia:
```
POST https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/cadences
```

Crear los pasos:
```
POST https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/cadence_steps
```

### Headers
```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
apikey: {SUPABASE_SERVICE_ROLE_KEY}
Content-Type: application/json
Prefer: return=representation
```

### Cadence Body
```json
{
  "org_id": "uuid",
  "name": "Cadencia Enterprise Q1",
  "description": "Cadencia para prospectos enterprise",
  "status": "draft",
  "created_by": "uuid"
}
```

### Cadence Step Body
```json
{
  "cadence_id": "uuid",
  "step_number": 1,
  "step_type": "linkedin_connect",
  "delay_days": 0,
  "template": "Hola {{first_name}}, vi que trabajas en {{company}}...",
  "subject": null,
  "org_id": "uuid"
}
```

## Tipos de pasos disponibles
- `linkedin_connect` — Enviar solicitud de conexión con nota
- `linkedin_message` — Enviar mensaje directo de LinkedIn
- `linkedin_inmail` — Enviar InMail (Sales Navigator)
- `email` — Enviar email
- `manual_task` — Tarea manual (llamada, investigación, etc.)
- `linkedin_like` — Dar like a un post
- `linkedin_comment` — Comentar en un post

## Variables de plantilla
- `{{first_name}}` — Nombre del prospecto
- `{{last_name}}` — Apellido
- `{{company}}` — Empresa
- `{{title}}` — Título/cargo
- `{{research}}` — Investigación de la empresa

## Parámetros requeridos
- `org_id` — ID de la organización
- `name` — Nombre de la cadencia
- Al menos 1 paso con `step_type` y `template`

## Ejemplo de conversación

**Usuario:** Crea una cadencia de 5 pasos para prospectos enterprise
**Chief:** Voy a crear la cadencia "Enterprise Outreach" con estos pasos:

1. 📤 **Día 0** — LinkedIn Connect: solicitud con nota personalizada
2. 💬 **Día 3** — LinkedIn Message: seguimiento si aceptó
3. 📧 **Día 5** — Email: presentación formal con propuesta de valor
4. 💬 **Día 8** — LinkedIn Message: compartir caso de éxito relevante
5. 📞 **Día 12** — Manual Task: llamada de seguimiento

¿Te parece bien estos pasos o quieres ajustar algo antes de crearla?

**Usuario:** Perfecto, créala
**Chief:** ✅ Cadencia "Enterprise Outreach" creada con 5 pasos. ID: abc-123

Para activarla, agrega leads y cámbiala a estado "active".
