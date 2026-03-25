# OpenClaw Dev Agent — Telegram + Claude SDK

## Objetivo
Bot de Telegram que actúa como Senior Developer + Senior QA para Chief.
Recibe instrucciones por Telegram → ejecuta tareas en el repo usando Claude API con tools → reporta resultado.

## Arquitectura

```
Telegram (tú) → Bot Node.js (Railway)
                    ↓
              Claude API (Anthropic SDK)
              con tools: read, edit, write, bash, glob, grep
                    ↓
              /repo/laiky-ai/ (clone del repo en el servidor)
                    ↓
              git commit + push + crear PR
                    ↓
              Respuesta resumida → Telegram
```

## Stack
- **Runtime:** Node.js 20 + TypeScript
- **Telegram:** grammy (moderno, TypeScript-first)
- **AI:** @anthropic-ai/sdk (Anthropic Messages API con tool use)
- **Model:** claude-sonnet-4-5-20250514 (configurable via env)
- **Deploy:** Railway (nuevo servicio en proyecto existente `openclaw-chief`)

## Archivos a crear

```
openclaw-dev/
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts           # Entry: health server + bot start
│   ├── bot.ts             # Telegram bot - message handling + conversation mgmt
│   ├── agent.ts           # Claude agentic loop (messages API + tool execution)
│   ├── tools.ts           # Tool definitions (Anthropic format) + implementations
│   └── config.ts          # Environment config + constants
```

## Tools del agente
1. `read_file` — leer archivos del repo
2. `write_file` — crear/sobreescribir archivos
3. `edit_file` — editar archivos (search & replace)
4. `bash` — ejecutar comandos shell (sandboxed al repo)
5. `list_directory` — listar archivos/carpetas
6. `search_files` — buscar archivos por patron glob
7. `search_content` — buscar contenido en archivos (grep)
8. `git_command` — operaciones git (add, commit, push, branch, PR via gh)

## System Prompt
- Incluye el CLAUDE.md del proyecto como contexto
- Rol: Senior Developer + Senior QA para Chief (Laiky AI)
- Capacidades: crear features, mejorar código, correr tests, revisar logs, fix bugs, QA iterativo
- Flujo QA: probar sección → ver si funciona → si falla ver logs → corregir → re-testear
- Respuestas en español, código en inglés
- Siempre trabaja en feature branch, nunca push directo a main

## Seguridad
- Bash sandboxed: solo ejecuta dentro de /repo
- Telegram: solo responde a chat IDs autorizados (env var ALLOWED_CHAT_IDS)
- API key como env var en Railway, nunca en código
- Git push solo a branches, nunca force push a main
- Max tokens y max turns como guardrails

## Deploy
- Nuevo servicio en Railway project `openclaw-chief`
- Dockerfile: Node.js 20 + git + gh CLI + clone repo
- Env vars: TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, GITHUB_PAT, ALLOWED_CHAT_IDS, etc.

## Checkboxes
- [ ] Plan aprobado
- [ ] Crear directorio openclaw-dev/ con package.json y tsconfig.json
- [ ] Crear src/config.ts — environment config
- [ ] Crear src/tools.ts — tool definitions + implementations
- [ ] Crear src/agent.ts — Claude agentic loop
- [ ] Crear src/bot.ts — Telegram bot con grammy
- [ ] Crear src/index.ts — entry point (health + bot)
- [ ] Crear Dockerfile + railway.json + .env.example + .gitignore
- [ ] Deploy a Railway como nuevo servicio
- [ ] Verificar que el bot responde en Telegram
