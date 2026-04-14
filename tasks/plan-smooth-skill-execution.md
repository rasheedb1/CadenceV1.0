# Plan: Smooth Skill Execution (Eliminar Fricción)

## Problema
Paula necesitó ~15 mensajes de WhatsApp para ejecutar 1 skill. El usuario recibió preguntas repetidas, errores técnicos, y fricciones que hacen el sistema inutilizable a escala.

## Root Causes (5 puntos de fricción)

### F1: THINK trunca description a 150 chars → pierde el skill context
**Dónde:** `think.ts:30` → `fmtTask()` → `.substring(0, 150)`
**Efecto:** El task dice "EXECUTE THIS SKILL: Business Case Generator, params: clientName, countries..." pero THINK solo ve "USER REQUEST: Create business case for Gru..." → no sabe que ya tiene datos → elige `ask_human` en vez de `work_on_task`.

### F2: Si el usuario ya respondió, THINK sigue eligiendo ask_human
**Dónde:** `think.ts:42-46` → TASK CONTEXT muestra el JSON raw del scratchpad
**Efecto:** Haiku ve `"last_action":"user_replied"` en un blob JSON pero no entiende que debe pasar a `work_on_task`. No hay una regla explícita: "si user replied → work_on_task".

### F3: Mensajes sin task (Chief envía mensaje, no crea task)
**Dónde:** `bridge/server.js` pre-processing → "dile a Paula" → bypass Chief → solo envía message
**Efecto:** Paula recibe un inbox message pero no tiene task. Opera sin scratchpad, sin estructura. Preguntas y respuestas se pierden.

### F4: Agente usa ask_human sin tener toda la info del skill
**Dónde:** SDK session (work_on_task) → agente ve skill_definition con params requeridos → pero los datos están en el task description, no como params estructurados → decide preguntar
**Efecto:** El agente tiene los datos en texto libre pero no los mapea a los params del skill. Pregunta al usuario "¿cuál es el ticket promedio?" cuando ya lo tiene en la descripción.

### F5: Dockerfile del bridge no incluía generate_business_case.js
**Dónde:** `openclaw/bridge/Dockerfile:18` — ya fixeado ✅

---

## Solución: 4 Cambios

### Cambio 1: THINK respeta scratchpad con user_replied (F2)
**Archivo:** `chief-agents/src/phases/think.ts`
**Qué:** Agregar regla explícita en el system prompt de THINK:

```
CRITICAL: If TASK CONTEXT shows "last_action":"user_replied", the user has ALREADY answered your questions.
DO NOT ask_human again. Use work_on_task to process their response.
```

Y en el user prompt, parsear el scratchpad e inyectar un resumen legible:
```
TASK CONTEXT: User replied with data. Data collected: {clientName: "X", mdr: 3.7%...}
NEXT ACTION: Execute skill with collected data
```

En vez del JSON raw actual.

**Impacto:** THINK deja de elegir ask_human cuando ya tiene respuesta. Aplica a TODOS los skills.

### Cambio 2: Aumentar description en THINK a 500 chars (F1)
**Archivo:** `chief-agents/src/phases/think.ts:30`
**Qué:** Cambiar `.substring(0, 150)` → `.substring(0, 500)`

**Impacto:** THINK ve la instrucción completa incluyendo "EXECUTE THIS SKILL" y los datos. Costo mínimo (~350 tokens extra de Haiku = $0.0001).

### Cambio 3: Pre-route siempre crea task (F3)
**Archivo:** `openclaw/bridge/server.js` (pre-processing layer ~line 4246)
**Qué:** Cuando el pre-route detecta "dile a Paula que X", en vez de solo enviar message:
1. Llamar `delegar_tarea` (que ya crea task + enrichment de skill)
2. NO bypass → usar el mismo flujo que cuando Chief decide delegar

Esto garantiza que Paula SIEMPRE tiene un task con:
- Skill auto-enrichment (si aplica)
- context_summary inicializado
- Estructura para scratchpad

**Impacto:** Elimina el caso de "agente sin task". Todo fluye por la misma pipeline.

### Cambio 4: SDK prompt instruye mapeo datos→params (F4)
**Archivo:** `chief-agents/src/phases/act.ts` (SDK prompt assembly ~line 333)
**Qué:** Cuando el prompt incluye CONVERSATION HISTORY + DATA ALREADY COLLECTED + AVAILABLE SKILLS, agregar instrucción explícita:

```
SKILL EXECUTION RULE: When you have DATA ALREADY COLLECTED and a matching skill in AVAILABLE SKILLS,
map the collected data to the skill's required params and call call_skill immediately.
Do NOT ask the user for data you already have. Do NOT re-ask questions that are already answered in DATA ALREADY COLLECTED.
```

**Impacto:** El SDK (Sonnet/Opus) entiende que debe mapear datos existentes a params del skill sin preguntar de nuevo.

---

## Orden de Implementación

| Fase | Cambio | Archivos | Esfuerzo |
|------|--------|----------|----------|
| 1 | C1 + C2 (THINK rules) | think.ts | 30 min |
| 2 | C3 (pre-route crea task) | bridge/server.js | 30 min |
| 3 | C4 (SDK skill instruction) | act.ts | 15 min |
| 4 | Test end-to-end | WhatsApp → Paula → PPTX | 15 min |

**Total: ~1.5 horas**

## Resultado Esperado

### Antes (hoy):
```
User: "Paula, hazme un business case de Grupo Qualitas"
Paula: "Necesito 9 datos..."
User: [responde los 9 datos]
Paula: "Necesito 9 datos..." (amnesia)
Paula: "Necesito 9 datos..." (otra vez)
[fix manual del scratchpad]
Paula: "Error: module not found"
[fix Dockerfile]
Paula: "Business Case generado!" ← 15 mensajes después
```

### Después:
```
User: "Paula, hazme un business case de Grupo Qualitas"
Paula: "Necesito estos datos: 1. países, 2. MDR, 3. pricing..."
User: [responde]
Paula: "✅ Business Case generado! [Descargar PPTX]" ← 3 mensajes
```

Y esto funciona para CUALQUIER skill, no solo business case.
