# Spike S1 — AbortSignal end-to-end del Claude Agent SDK

**Fecha:** 2026-05-04
**Estado:** ✅ VERDE
**Tiempo:** 0.2 días (resuelto sin necesitar harness — el SDK lo soporta nativamente)

## Pregunta

¿`query()` del Claude Agent SDK (`@anthropic-ai/claude-agent-sdk@^0.1.0`) honra cancelación para detener token generation y tool execution?

## Hallazgo

**Sí, nativo.** La API de opciones expone `abortController?: AbortController`.

Fuente: `chief-agents/node_modules/@anthropic-ai/claude-agent-sdk/entrypoints/sdk/runtimeTypes.d.ts:229-234`:

```ts
export type Options = {
  /**
   * Controller for cancelling the query. When aborted, the query will stop
   * and clean up resources.
   */
  abortController?: AbortController;
  // ...
};
```

Implementación interna en `sdk.mjs`:
- Línea 7597: `this.abortController = options.abortController || createAbortController();`
- Línea 7820-7824: cuando `signal.aborted`, lanza `AbortError("Claude Code process aborted by user")` y termina el process.
- Línea 8456-8484: el message-loop revisa `abortController?.signal.aborted` entre iteraciones y rompe limpiamente.
- Hook callbacks (línea 8490-8496) propagan `abortSignal` a tools custom.

## Decisión

**Propagamos `AbortSignal` end-to-end** en `streamWithSDK`:

```ts
export async function* streamWithSDK(
  agent: AgentConfig,
  taskPrompt: string,
  channel: 'whatsapp' | 'web',
  threadContext: { threadId: string; userId: string; orgId: string; turnId: string },
  log: Logger,
  resumeSessionId?: string,
  signal?: AbortSignal,  // ← NEW
): AsyncGenerator<SDKEvent> {
  const ac = new AbortController();
  signal?.addEventListener('abort', () => ac.abort(signal.reason), { once: true });

  for await (const message of query({
    prompt: ...,
    options: {
      // ...existing opts
      abortController: ac,
    },
  })) {
    // emit events as SDKEvent
    if (signal?.aborted) break;
  }
}
```

El `chat-bridge` propaga el signal así:
1. Cliente cierra SSE → `req.on('close', () => abortController.abort())`.
2. Cliente llama `POST /cancel` → bridge dispara abort en el AbortController del turno.
3. Wallclock budget timeout (90s default) → `setTimeout(() => abortController.abort(), 90_000)`.

## Riesgo residual

- **No verificamos en runtime** cuánto tarda en parar tras `abort()`. Si los MCP tools tienen calls bloqueantes (ej. Apollo cascade), el abort podría tardar segundos en propagar al subprocess. Mitigación: `setTimeout` de 5s después del abort para forzar `process.kill()` si no terminó.
- **AbortError vs CleanExit:** la SDK propaga `AbortError` por la AsyncIterable. Nuestro `streamWithSDK` lo captura y emite un evento `turn_aborted` final en vez de propagar excepción a SSE.

## Acceptance criteria

- [x] Verificado que `Options.abortController` existe en types.
- [x] Verificado en código fuente (sdk.mjs) que el SDK reacciona al abort.
- [ ] **(Diferido a Fase 2)** Test runtime midiendo time-to-stop con un task de 60s y abort a los 5s. Acceptance: tool execution se detiene en <2s del abort.

## Implicaciones

- No necesitamos fallback wallclock-only. Aún así, **mantenemos el wallclock 90s/turno** como red de seguridad (defense-in-depth).
- Per-tool 30s timeout queda como decisión separada (lo controlamos en los wrappers MCP, no en el SDK).
