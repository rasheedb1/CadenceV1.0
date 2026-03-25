---
name: enviar-mensaje
version: "1.0"
description: Envía un mensaje directo por LinkedIn a un prospecto o lead
---

# Enviar Mensaje

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Enviar un mensaje directo por LinkedIn a alguien
- Mandar un InMail
- Enviar una solicitud de conexión con nota
- Contactar manualmente a un prospecto fuera de cadencia

## API Endpoint

```
POST https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/linkedin-send-message
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
  "sender_account_id": "uuid",
  "recipient_provider_id": "ACoAAA...",
  "message": "Hola Juan, vi que están creciendo el equipo de tech...",
  "message_type": "message"
}
```

### Message Types
- `message` — Mensaje directo (requiere conexión previa)
- `inmail` — InMail de Sales Navigator
- `connection_request` — Solicitud de conexión con nota (max 300 chars)

### Response
```json
{
  "success": true,
  "message_id": "msg_abc123",
  "provider": "unipile"
}
```

## Parámetros requeridos
- `org_id` — ID de la organización
- `sender_account_id` — ID de la cuenta de LinkedIn del remitente
- `recipient_provider_id` — Provider ID de LinkedIn del destinatario (formato: ACoAAA...)
- `message` — Texto del mensaje
- `message_type` — Tipo de mensaje

## Advertencias
- Las solicitudes de conexión tienen un límite de 300 caracteres en la nota
- Respetar rate limits de LinkedIn (no más de 100 conexiones/día, 150 mensajes/día)
- Si no se tiene el provider_id, primero enriquecer el prospecto

## Ejemplo de conversación

**Usuario:** Manda un mensaje a Juan García de TechCo diciendo que me gustaría agendar una llamada
**Chief:** Enviando mensaje a Juan García...

✅ Mensaje enviado a **Juan García** por LinkedIn:

> "Hola Juan, me encantaría agendar una llamada para platicar sobre cómo podemos ayudar a TechCo con automatización de ventas. ¿Tienes disponibilidad esta semana?"

¿Necesitas algo más?
