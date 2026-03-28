---
name: ver-metricas
version: "1.0"
description: Consulta métricas de cadencias — tasas de respuesta, conexión, apertura, conversión
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

# Ver Métricas

## Cuándo usar
Usa esta skill cuando el usuario quiera:
- Ver métricas de una cadencia específica
- Conocer tasas de respuesta, conexión o apertura
- Evaluar el rendimiento de sus cadencias
- Comparar rendimiento entre cadencias
- Ver estadísticas generales de outreach

## API Endpoints

### Métricas de cadencia específica
```
GET https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/cadences?select=*,cadence_leads(count),cadence_leads(status)&id=eq.{cadence_id}&org_id=eq.{org_id}
```

### Actividad agregada para métricas
```
GET https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/activity_log?select=activity_type,status&org_id=eq.{org_id}&cadence_id=eq.{cadence_id}
```

### Leads por estado en cadencia
```
GET https://arupeqczrxmfkcbjwyad.supabase.co/rest/v1/cadence_leads?select=status,count&org_id=eq.{org_id}&cadence_id=eq.{cadence_id}
```

### Headers
```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
apikey: {SUPABASE_SERVICE_ROLE_KEY}
```

## Métricas a calcular
- **Tasa de conexión** = conexiones aceptadas / solicitudes enviadas
- **Tasa de respuesta** = respuestas / mensajes enviados
- **Tasa de apertura** = emails abiertos / emails enviados
- **Tasa de conversión** = leads convertidos / total leads en cadencia
- **Leads activos** = leads en estado "active" en la cadencia
- **Leads completados** = leads que terminaron todos los pasos
- **Leads respondidos** = leads que respondieron en cualquier paso

## Parámetros requeridos
- `org_id` — ID de la organización

## Parámetros opcionales
- `cadence_id` — ID de cadencia específica (si no, muestra todas)
- `date_from` — Fecha inicio para filtrar
- `date_to` — Fecha fin para filtrar

## Ejemplo de conversación

**Usuario:** ¿Cómo van las métricas de la cadencia "Enterprise Q1"?
**Chief:** Consultando métricas de "Enterprise Q1"...

📊 **Cadencia: Enterprise Q1**
📅 Activa desde: 15 Ene 2026

| Métrica | Valor |
|---------|-------|
| Total leads | 85 |
| Activos | 42 |
| Completados | 28 |
| Respondidos | 15 |

**Tasas:**
- 🔗 Conexión: 62% (53/85)
- 💬 Respuesta: 18% (15/85)
- 📧 Apertura email: 45% (38/85)
- ✅ Conversión: 8% (7/85)

**Top respuestas recientes:**
1. Juan García (TechCo) — "Agendemos llamada"
2. Ana Ruiz (DataCorp) — "Envíame propuesta"

¿Quieres que ajuste la cadencia basado en estos resultados?
