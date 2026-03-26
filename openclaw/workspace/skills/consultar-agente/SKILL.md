---
name: consultar-agente
version: "1.0"
description: Pregunta rápida a un agente sin crear tarea formal
---

# Consultar Agente

## Cuando usar
Cuando el usuario quiere hacerle una pregunta conversacional a un agente sin crear una tarea formal. Frases como "pregúntale a X...", "¿qué opina X?", "consulta con el CFO...".

## Diferencia con delegar_tarea
- **delegar_tarea**: Crea registro de tarea, tiene seguimiento, para acciones concretas
- **consultar_agente**: Conversación rápida, no crea tarea, para preguntas y opiniones

## API del agente hijo
POST {railway_url}/api/chat

### Request
```json
{
  "message": "¿Qué opinas sobre priorizar la integración con Slack?",
  "context": { "org_id": "uuid" }
}
```

### Response
```json
{
  "success": true,
  "reply": "Como CPO, considero que la integración con Slack debería ser prioridad..."
}
```

## Parametros requeridos
- org_id
- message (la pregunta)

## Parametros opcionales
- agent_id o agent_name

## Ejemplo de conversación
**Usuario:** Pregúntale al CPO qué opina sobre lanzar el feature de reportes
**Chief:** 🔍 Consultando al **CPO Agent**...

💬 **CPO Agent dice:**
"Lanzar reportes ahora es arriesgado — tenemos 3 bugs críticos pendientes en el módulo de datos. Sugiero cerrar esos bugs primero y lanzar reportes en la siguiente sprint. Si quieres, puedo crear los tickets."

¿Quieres que le diga que cree los tickets?
