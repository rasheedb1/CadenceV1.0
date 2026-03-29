---
name: comunicar-agente
version: "4.0"
description: Envía mensajes directos a otros agentes usando A2A Protocol. Comunicación HTTP directa sin colas ni polling.
command-dispatch: tool
metadata:
  openclaw:
    always: true
    requires:
      env:
        - SUPABASE_URL
        - SUPABASE_SERVICE_ROLE_KEY
        - AGENT_ID
      bins:
        - node
---

# Comunicar con Agente (A2A Protocol)

## Cómo enviar un mensaje a otro agente

Usa el script `a2a-send.js` para enviar mensajes A2A directos:

```bash
node /home/node/.openclaw/a2a-send.js "Nombre del agente" "Tu mensaje aquí"
```

El mensaje se envía por HTTP directo (no hay cola ni polling). El agente responde inmediatamente o te avisa cuando termina.

## Ejemplos

### Sofía envía spec a Juanse:
```bash
node /home/node/.openclaw/a2a-send.js "Juanse" "Spec de mejora UX: Cambiar el grid de métricas a staggered entrance con framer-motion. Usa motion.div con staggerChildren: 0.06. Archivo: src/pages/Dashboard.tsx. Clases: gap-4 rounded-xl border p-5. Envíame screenshot cuando implementes."
```

### Juanse envía resultado a Sofía:
```bash
node /home/node/.openclaw/a2a-send.js "Sofi" "Implementado el staggered grid en Dashboard.tsx. Build OK. Los cards entran con 60ms delay y ease-out. ¿Quieres que tome screenshot?"
```

### Enviar por ID de agente:
```bash
node /home/node/.openclaw/a2a-send.js --id "uuid-del-agente" "Tu mensaje"
```

## Cuándo usar
- Cuando necesites enviar trabajo a otro agente
- Cuando necesites pedir feedback
- Cuando estés iterando con otro agente
- Cuando quieras coordinar sin esperar a Chief

## Cómo funciona (A2A Protocol v0.3.0)
1. El script busca al agente por nombre en la base de datos
2. Hace POST HTTP al endpoint A2A del agente (`/a2a/jsonrpc`)
3. El agente procesa con su LLM y responde directamente
4. Si la tarea es larga, el agente responde "working" y puedes consultar después
5. La respuesta aparece en tu stdout para que la leas

## Ventajas sobre el método anterior
- **Sin colas**: HTTP directo, sin pgmq ni polling
- **Sin bloqueos**: No hay "Agent busy" — cada petición es independiente
- **Rápido**: La respuesta llega en la misma conexión HTTP
- **Los mensajes NUNCA se pierden**: Si el agente está caído, recibes error inmediato (no esperas eternamente)
