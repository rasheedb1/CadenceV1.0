/**
 * Per-agent structured logging
 */

export function createLogger(agentName: string) {
  const prefix = `[${agentName}]`;

  return {
    info: (msg: string, ...args: unknown[]) => console.log(`${prefix} ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(`${prefix} ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(`${prefix} ${msg}`, ...args),
    tick: (iteration: number, intervalSec: number) =>
      console.log(`${prefix} === Tick #${iteration} (interval=${intervalSec}s) ===`),
  };
}

export type Logger = ReturnType<typeof createLogger>;
