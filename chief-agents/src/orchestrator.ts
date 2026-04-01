/**
 * Orchestrator — Main process that manages all agent event loops
 * Loads active agents from Supabase, spawns concurrent loops, monitors health.
 * Runs in 1 Railway container instead of 4.
 */

import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import { sbGet } from './supabase-client.js';
import { loadAgentConfig } from './agent-config.js';
import { runEventLoop } from './event-loop.js';
import type { AgentRow } from './types.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

interface AgentLoopHandle {
  name: string;
  agentId: string;
  promise: Promise<void>;
  startedAt: Date;
  restarts: number;
}

const activeLoops = new Map<string, AgentLoopHandle>();
let shuttingDown = false;

async function main(): Promise<void> {
  console.log('[Orchestrator] Starting chief-agents runtime');

  // Load all active agents for the org
  const agents = await sbGet<AgentRow[]>(
    'agents?status=in.(active,deploying)&select=*',
  );

  if (!Array.isArray(agents) || agents.length === 0) {
    console.error('[Orchestrator] No active agents found. Exiting.');
    process.exit(1);
  }

  console.log(`[Orchestrator] Found ${agents.length} active agents: ${agents.map((a) => a.name).join(', ')}`);

  // Ensure workspace directories exist
  for (const agent of agents) {
    const dir = `/workspace/${agent.name.toLowerCase()}`;
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    console.log(`[Orchestrator] Workspace ready: ${dir}`);
  }

  // Start all event loops concurrently with auto-restart
  for (const agent of agents) {
    spawnAgentLoop(agent);
  }

  // Health check HTTP server
  startHealthServer();

  // Graceful shutdown
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  console.log(`[Orchestrator] All ${agents.length} agent loops started. Health check on :${PORT}`);

  // Keep the process alive
  await new Promise<void>(() => {});
}

function spawnAgentLoop(agentRow: AgentRow, restartCount = 0): void {
  const config = loadAgentConfig(agentRow);
  const maxRestarts = 10;

  const promise = runWithRestart(config.name, async () => {
    await runEventLoop(config);
  }, maxRestarts, restartCount);

  activeLoops.set(agentRow.id, {
    name: config.name,
    agentId: agentRow.id,
    promise,
    startedAt: new Date(),
    restarts: restartCount,
  });
}

async function runWithRestart(
  name: string,
  fn: () => Promise<void>,
  maxRetries: number,
  initialRetries = 0,
): Promise<void> {
  let retries = initialRetries;
  while (retries < maxRetries && !shuttingDown) {
    try {
      await fn();
      // If fn() returns normally, the loop was stopped gracefully
      break;
    } catch (err: any) {
      retries++;
      console.error(`[Orchestrator] ${name} loop crashed (${retries}/${maxRetries}): ${err.message}`);
      if (retries < maxRetries && !shuttingDown) {
        const backoffMs = Math.min(5000 * retries, 60_000);
        console.log(`[Orchestrator] Restarting ${name} in ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
      }
    }
  }
  if (retries >= maxRetries) {
    console.error(`[Orchestrator] ${name} reached max retries (${maxRetries}), agent stopped permanently`);
  }
}

function startHealthServer(): void {
  const server = http.createServer((_req, res) => {
    const status = {
      status: 'ok',
      uptime: process.uptime(),
      agents: Array.from(activeLoops.values()).map((h) => ({
        name: h.name,
        agentId: h.agentId,
        startedAt: h.startedAt.toISOString(),
        restarts: h.restarts,
      })),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  });

  server.listen(PORT, () => {
    console.log(`[Orchestrator] Health check listening on :${PORT}`);
  });
}

async function gracefulShutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[Orchestrator] Graceful shutdown initiated...');

  // Give loops a chance to finish their current tick
  await sleep(2000);

  // Wait for all loops to stop (with timeout)
  const timeout = sleep(10_000).then(() => {
    console.log('[Orchestrator] Shutdown timeout reached, forcing exit');
  });

  await Promise.race([
    Promise.allSettled(Array.from(activeLoops.values()).map((h) => h.promise)),
    timeout,
  ]);

  console.log('[Orchestrator] Shutdown complete');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Entry point ---
main().catch((err) => {
  console.error('[Orchestrator] Fatal error:', err);
  process.exit(1);
});
