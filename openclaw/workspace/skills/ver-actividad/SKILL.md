---
name: ver-actividad
version: "1.0"
description: Consulta el log de actividades — mensajes enviados, respuestas, conexiones, errores
---

# Ver Actividad

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Ver actividad reciente de cadencias
- Revisar qué mensajes se enviaron
- Verificar si hubo respuestas
- Diagnosticar errores en ejecución de pasos
- Ver el historial de interacciones con un lead

## API Endpoint

```
GET https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/activity_log?select=*&org_id=eq.{org_id}&order=created_at.desc&limit=20
```

### Headers
```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
apikey: {SUPABASE_SERVICE_ROLE_KEY}
```

### Filtros disponibles (query params)
- `org_id=eq.{uuid}` — Filtrar por organización (REQUERIDO)
- `lead_id=eq.{uuid}` — Filtrar por lead específico
- `cadence_id=eq.{uuid}` — Filtrar por cadencia
- `activity_type=eq.{type}` — Filtrar por tipo
- `status=eq.{status}` — Filtrar por estado
- `created_at=gte.{timestamp}` — Desde cierta fecha
- `limit={n}` — Limitar resultados
- `order=created_at.desc` — Orden descendente

### Tipos de actividad
- `linkedin_connect` — Solicitud de conexión enviada
- `linkedin_message` — Mensaje de LinkedIn enviado
- `linkedin_inmail` — InMail enviado
- `email_sent` — Email enviado
- `reply_detected` — Respuesta detectada
- `connection_accepted` — Conexión aceptada
- `email_opened` — Email abierto
- `error` — Error en ejecución

### Estados
- `success` — Ejecutado exitosamente
- `failed` — Falló
- `pending` — Pendiente
- `skipped` — Saltado

## Parámetros requeridos
- `org_id` — ID de la organización

## Ejemplo de conversación

**Usuario:** ¿Qué actividad hubo hoy?
**Chief:** Revisando actividad del día...

📊 **Actividad de hoy** (últimas 24h):

✅ 12 mensajes de LinkedIn enviados
✅ 3 solicitudes de conexión enviadas
📨 2 respuestas detectadas
  - **Juan García** (TechCo): "Interesante, agendemos una llamada"
  - **Ana Ruiz** (DataCorp): "Envíame más info por favor"
❌ 1 error: InMail fallido para Carlos López (sin créditos SN)

¿Quieres ver detalle de alguna actividad?
