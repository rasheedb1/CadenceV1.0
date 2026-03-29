---
name: comunicar-agente
version: "3.0"
description: Envía mensajes directos a otros agentes del equipo. Comunicación peer-to-peer sin depender de Chief.
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
        - curl
        - bash
---

# Comunicar con Agente

## IMPORTANTE — Usa estos scripts

Tienes dos scripts en tu workspace para comunicarte con otros agentes:

### Enviar mensaje
```bash
bash ~/. openclaw/workspace/tools/send-to-agent.sh "Nombre del agente" "Tu mensaje aquí"
```

### Leer mensajes recibidos
```bash
bash ~/.openclaw/workspace/tools/read-messages.sh 30
```
(espera hasta 30 segundos por mensajes)

## Ejemplos

### Sofía envía spec a Juanse:
```bash
bash ~/.openclaw/workspace/tools/send-to-agent.sh "Juanse" "Spec de mejora UX: Cambiar el grid de métricas a staggered entrance con framer-motion. Usa motion.div con staggerChildren: 0.06. Archivo: src/pages/Dashboard.tsx. Clases: gap-4 rounded-xl border p-5. Envíame screenshot cuando implementes."
```

### Juanse envía resultado a Sofía:
```bash
bash ~/.openclaw/workspace/tools/send-to-agent.sh "Sofi" "Implementado el staggered grid en Dashboard.tsx. Build OK. Los cards entran con 60ms delay y ease-out. ¿Quieres que tome screenshot?"
```

### Leer respuestas:
```bash
bash ~/.openclaw/workspace/tools/read-messages.sh 30
```

## Cuándo usar
- Cuando necesites enviar trabajo a otro agente
- Cuando necesites pedir feedback
- Cuando estés iterando con otro agente
- Cuando quieras coordinar sin esperar a Chief

## Los mensajes NUNCA se pierden
Si el otro agente está ocupado, el mensaje queda en su cola y lo procesará cuando esté libre.
