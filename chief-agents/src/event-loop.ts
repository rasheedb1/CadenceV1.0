/**
 * Event Loop — SENSE → THINK → ACT → REFLECT cycle with setTimeout
 * Ported from event-loop.js tick/start/stop/reschedule (lines 952-1119).
 * Timing preserved exactly: 10s fast, 20s default, 120s max, 5min deep sleep.
 */

import type { AgentConfig, LoopState, ParsedAction } from './types.js';
import { DEFAULT_INTERVAL, MIN_INTERVAL, MAX_INTERVAL, DEEP_SLEEP_INTERVAL } from './types.js';
import { isConfigured, sbGet, sbRpc } from './supabase-client.js';
import { refreshBudgetFromDB, checkBudgetExceeded } from './utils/budget.js';
import { updateHeartbeat } from './utils/heartbeat.js';
import { createLogger, type Logger } from './utils/logger.js';
import { sense } from './phases/sense.js';
import { think } from './phases/think.js';
import { act } from './phases/act.js';
import { reflect } from './phases/reflect.js';
import { sbPatch } from './supabase-client.js';

function createInitialState(): LoopState {
  return {
    running: false,
    busy: false,
    iteration: 0,
    interval: DEFAULT_INTERVAL,
    consecutiveIdles: 0,
    consecutiveErrors: 0,
    lastAction: null,
    lastActionTime: null,
    budget: { tokens: 0, cost: 0, iterations: 0 },
    maxIterations: parseInt(process.env.EVENT_LOOP_MAX_ITERATIONS || '10000', 10),
    agentConfig: null,
    tasksCompletedSinceCheckin: 0,
    budgetAlertSent: false,
    recentTickActions: [],
    recentActions: [],
    consecutiveFailedClaims: 0,
    lastSenseTime: null,
    budgetFromDB: null,
  };
}

export async function runEventLoop(agent: AgentConfig): Promise<void> {
  const log = createLogger(agent.name);
  const state = createInitialState();

  if (!isConfigured()) {
    log.warn('No Supabase config — event loop disabled');
    return;
  }

  log.info(`v2 Starting event loop, model=${agent.model}, interval=${DEFAULT_INTERVAL / 1000}s`);
  state.running = true;

  // Initial delay (5s, same as original)
  await sleep(5000);

  while (state.running) {
    await tick(agent, state, log);
    await sleep(state.interval);
  }

  log.info('Event loop stopped');
}

async function tick(agent: AgentConfig, state: LoopState, log: Logger): Promise<void> {
  if (!state.running) return;
  if (state.busy) {
    log.info('Skipping tick — busy');
    return;
  }

  state.iteration++;
  log.tick(state.iteration, Math.round(state.interval / 1000));

  // Max iterations → deep sleep (not stop)
  if (state.iteration > state.maxIterations) {
    log.warn('Max iterations reached — deep sleep (probe every 5min)');
    state.interval = DEEP_SLEEP_INTERVAL;
    state.iteration = 0;
    return;
  }

  // Budget enforcement (refreshed every 10 iterations)
  await refreshBudgetFromDB(agent.id, state);
  if (checkBudgetExceeded(state, log)) {
    // Deep sleep instead of hard stop — agent probes every 5 min for budget reset
    log.warn('Budget exceeded — entering deep sleep (probing every 5min for reset)');
    state.interval = DEEP_SLEEP_INTERVAL;
    // Don't set running=false — allow recovery when budget resets (new day)
    return;
  }

  state.busy = true;
  let decision: ParsedAction = { action: 'idle', reasoning: 'default', params: {} };
  let tickError = false;

  try {
    const context = await sense(agent, state, log);

    // --- Check if agent already has a task (enforce max 1 at a time) ---
    const myActiveTasks = await sbGet<Array<{ id: string }>>(
      `agent_tasks_v2?assigned_agent_id=eq.${agent.id}&status=in.(claimed,in_progress)&limit=1&select=id`,
    ).catch(() => []);
    const alreadyHasTask = Array.isArray(myActiveTasks) && myActiveTasks.length > 0;

    const hasMyTasks = context.myTasks && context.myTasks.length > 0;
    const hasAvailableV2 = context.isV2Available;

    // --- FAST PATH: only if NO active task and v2 tasks available ---
    if (!alreadyHasTask && !hasMyTasks && hasAvailableV2) {
      log.info('FAST PATH: v2 tasks available, claiming directly (skip THINK)');
      const capabilities = state.agentConfig?.capabilities || agent.capabilities;
      const claimed = await sbRpc<Array<{ id: string; title: string; priority: number; description: string }>>(
        'claim_task_v2',
        { p_org_id: agent.orgId, p_agent_id: agent.id, p_capabilities: capabilities },
      );
      if (claimed && Array.isArray(claimed) && claimed.length > 0) {
        const task = claimed[0];
        log.info(`FAST CLAIM: ${task.id} — ${task.title}`);
        decision = {
          action: 'claim_task',
          reasoning: 'Fast path: v2 task available',
          params: { task_id: task.id },
        };
        state.interval = MIN_INTERVAL;
      } else {
        log.info('FAST PATH: claim returned nothing (capabilities mismatch or race)');
        decision = await think(agent, context, state, log);
        await act(decision, context, agent, state, log);
      }
    } else if (hasMyTasks) {
      // Has assigned tasks — use THINK to decide what to do with them
      log.info('Has assigned tasks, using THINK');
      decision = await think(agent, context, state, log);
      await act(decision, context, agent, state, log);
    } else {
      // No v2 tasks, check legacy or truly idle
      decision = await think(agent, context, state, log);
      await act(decision, context, agent, state, log);
    }
  } catch (err: any) {
    log.error(`Tick error: ${err.message}`);
    tickError = true;
  } finally {
    state.busy = false;
  }

  // Error recovery: 3 consecutive errors → pause 10min
  if (tickError && decision.action !== 'idle') {
    state.consecutiveErrors++;
  } else {
    state.consecutiveErrors = 0;
  }
  if (state.consecutiveErrors >= 3) {
    log.error('3 consecutive errors, pausing 10min');
    state.interval = 600_000;
    state.consecutiveErrors = 0;
  }

  await reflect(decision, agent, state, log);
}

/** Stop the event loop for a specific agent */
export function createStopFunction(state: LoopState, agent: AgentConfig, log: Logger) {
  return () => {
    log.info('Stopping event loop');
    state.running = false;
    sbPatch(`agents?id=eq.${agent.id}`, { availability: 'offline' }).catch(() => {});
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
