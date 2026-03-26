---
name: delegar-tarea
version: "1.0"
description: Delega una tarea a un agente hijo (activo o pendiente)
---

# Delegar Tarea a Agente

## Cuando usar
Cuando el usuario quiere que un agente ejecute una tarea específica. Detectar frases como "dile a X que...", "pídele a X que...", "que el CPO haga...", "manda al developer a...".

## Flujo

```
Chief recibe instrucción → Resuelve agente (por nombre o ID)
→ Crea registro de tarea en agent_tasks
→ Si agente activo y desplegado: POST /api/task al agente
→ Si agente no desplegado: Informa que tarea queda pendiente
→ Devuelve resultado al usuario por WhatsApp
```

## API del agente hijo
POST {railway_url}/api/task

### Request
```json
{
  "instruction": "Analiza el feedback de clientes y prioriza features para Q2",
  "context": { "org_id": "uuid" },
  "task_id": "uuid"
}
```

### Response
```json
{
  "success": true,
  "result": "Análisis completado. Top 3 features: ..."
}
```

## Parametros requeridos
- org_id
- instruction (la tarea en lenguaje natural)

## Parametros opcionales
- agent_id (ID del agente)
- agent_name (nombre del agente — búsqueda flexible)

## Ejemplo de conversación
**Usuario:** Dile al CPO que analice el feedback de los últimos clientes
**Chief:** 📤 Enviando tarea al **CPO Agent**...

✅ **Tarea completada:**
El CPO Agent reporta:

📊 Análisis de feedback (últimos 30 días):
1. **Integración con Slack** — 12 menciones, alta demanda
2. **Dashboard de métricas** — 8 menciones, media
3. **API pública** — 5 menciones, baja

Recomendación: Priorizar integración con Slack para Q2.

---

**Usuario:** Dile al CFO que me traiga el reporte de gastos
**Chief:** ⏳ El **CFO Agent** no está desplegado aún. La tarea quedó registrada como pendiente y se ejecutará cuando el agente esté activo.

¿Quieres que lo despliegue? (Esto requiere configuración en Railway)
