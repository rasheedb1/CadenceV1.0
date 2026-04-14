/**
 * REFLECT phase — update state, heartbeat, check-in, auto-pause
 * Exact port from event-loop.js lines 753-949.
 */

import type { AgentConfig, LoopState, ParsedAction } from '../types.js';
import {
  MIN_INTERVAL, MAX_INTERVAL, IDLE_PAUSE_THRESHOLD,
  IDLE_RATIO_WINDOW, IDLE_RATIO_THRESHOLD, STALL_WINDOW,
  CHECKIN_EVERY_N_TASKS, DEEP_SLEEP_INTERVAL,
} from '../types.js';
import { sbGet, sbPatch, sbPost, sbUpsert } from '../supabase-client.js';
import { updateHeartbeat } from '../utils/heartbeat.js';
import { syncBudget, checkBudgetAlert } from '../utils/budget.js';
import type { Logger } from '../utils/logger.js';

const CALLBACK_URL = process.env.CALLBACK_URL ||
  'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback';

const safe = <T>(arr: unknown): T[] => (Array.isArray(arr) ? arr : []);

export async function reflect(
  decision: ParsedAction,
  agent: AgentConfig,
  state: LoopState,
  log: Logger,
): Promise<void> {
  const action = decision?.action || 'idle';
  const taskId = (decision?.params?.task_id as string) || null;

  // --- Adaptive interval (exact port) ---
  if (action === 'idle') {
    state.consecutiveIdles++;
    state.interval = Math.min(state.interval * 1.5, MAX_INTERVAL);
  } else {
    state.consecutiveIdles = 0;
    state.interval = MIN_INTERVAL;
    state.lastAction = action;
    state.lastActionTime = new Date().toISOString();
  }

  // --- Idle ratio guard: deep sleep if 80%+ idle in last 20 ticks ---
  state.recentTickActions.push(action);
  if (state.recentTickActions.length > IDLE_RATIO_WINDOW) state.recentTickActions.shift();
  if (state.recentTickActions.length === IDLE_RATIO_WINDOW) {
    const idleCount = state.recentTickActions.filter((a) => a === 'idle').length;
    const ratio = idleCount / IDLE_RATIO_WINDOW;
    if (ratio >= IDLE_RATIO_THRESHOLD) {
      log.warn(`Idle ratio ${(ratio * 100).toFixed(0)}% — entering deep sleep (probe every 5min)`);
      state.interval = DEEP_SLEEP_INTERVAL;
      state.recentTickActions = []; // reset window
      // Do NOT stop — agent stays alive and probes for new work
    }
  }

  // --- Update agent availability ---
  const newAvailability = action === 'idle' ? 'available' : 'working';
  sbPatch(`agents?id=eq.${agent.id}`, {
    availability: newAvailability,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  // --- Extract knowledge from completed tasks ---
  const isCompletion = action === 'complete_task' || (action === 'submit_review' && decision?.params?.passed === true);
  if (isCompletion && taskId) {
    try {
      const resultSummary = (decision?.params?.result_summary as string) || '';
      if (resultSummary.length > 50) {
        await sbPost('agent_knowledge', {
          org_id: agent.orgId,
          agent_id: agent.id,
          scope: '/',
          category: 'lesson',
          content: `Task "${taskId}": ${resultSummary.substring(0, 500)}`,
          importance: 0.5,
          source_task_id: taskId,
          source_type: 'task_completion',
        });
        log.info('Knowledge extracted from completed task');
      }
    } catch (e: any) {
      log.error(`Knowledge extraction failed: ${e.message}`);
    }
  }

  // --- Auto-pause inactive projects ---
  if (action === 'idle' && state.consecutiveIdles === IDLE_PAUSE_THRESHOLD) {
    log.info(`${IDLE_PAUSE_THRESHOLD} consecutive idles — auto-pausing active projects`);
    try {
      const activeProjects = await sbGet<Array<{ id: string; name: string }>>(
        `agent_projects?status=eq.active&assigned_agents=cs.{${agent.id}}&select=id,name`,
      ).catch(() => []);
      for (const proj of safe<{ id: string; name: string }>(activeProjects)) {
        log.warn(`Auto-pausing project "${proj.name}" (${proj.id})`);
        await sbPatch(`agent_projects?id=eq.${proj.id}`, {
          status: 'paused',
          updated_at: new Date().toISOString(),
        });
        fetch(CALLBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: agent.name,
            result: { text: `⏸️ Project "${proj.name}" paused — ${agent.name} has no more tasks. Send a message to reactivate.` },
            whatsapp_number: null,
          }),
        }).catch(() => {});
      }
    } catch (err: any) {
      log.error(`Auto-pause error: ${err.message}`);
    }
  }

  // --- Check-in engine: every N completed tasks → generate summary ---
  if (state.tasksCompletedSinceCheckin >= CHECKIN_EVERY_N_TASKS) {
    log.info(`Check-in: ${state.tasksCompletedSinceCheckin} tasks completed, generating summary`);
    state.tasksCompletedSinceCheckin = 0;
    try {
      const recentDone = await sbGet<Array<{ title: string; result: unknown }>>(
        `agent_tasks_v2?assigned_agent_id=eq.${agent.id}&status=eq.done&order=completed_at.desc&limit=${CHECKIN_EVERY_N_TASKS}&select=title,result`,
      ).catch(() => []);
      const taskNames = safe(recentDone).map((t: any) => t.title).join(', ');

      const pending = await sbGet<Array<{ id: string }>>(
        `agent_tasks_v2?assigned_agent_id=eq.${agent.id}&status=in.(ready,backlog)&select=id`,
      ).catch(() => []);
      const pendingCount = Array.isArray(pending) ? pending.length : 0;

      const summary = `Completed ${CHECKIN_EVERY_N_TASKS} tasks: ${taskNames || 'various'}. ${pendingCount > 0 ? `${pendingCount} more in backlog.` : 'Backlog is empty.'}`;

      await sbPost('agent_checkins', {
        org_id: agent.orgId,
        agent_id: agent.id,
        checkin_type: 'standup',
        summary,
        next_steps: pendingCount > 0 ? 'Continue with next backlog tasks' : 'Waiting for new tasks',
        needs_approval: pendingCount === 0,
        fallback_action: 'continue',
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      });

      // Notify via WhatsApp
      fetch(CALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: agent.name,
          result: { text: `📋 Check-in from ${agent.name}: ${summary}` },
          whatsapp_number: null,
        }),
      }).catch(() => {});

      sbPost('agent_activity_events', {
        agent_id: agent.id, org_id: agent.orgId,
        event_type: 'checkin', tool_name: 'standup',
        content: summary,
      }).catch(() => {});
    } catch (err: any) {
      log.error(`Check-in error: ${err.message}`);
    }
  }

  // --- Stall detection (action loops) ---
  state.recentActions.push({ action, taskId });
  if (state.recentActions.length > STALL_WINDOW) state.recentActions.shift();

  if (state.recentActions.length === STALL_WINDOW) {
    const allSame = state.recentActions.every(
      (a) => a.action === state.recentActions[0].action && a.taskId === state.recentActions[0].taskId,
    );
    // Skip stall on: idle, ask_human, and work_on_task when scratchpad has recent user reply
    const isWaitingForConvo = action === 'work_on_task' && state.cachedSkills && state.cachedSkills.length > 0;
    if (allSame && action !== 'idle' && action !== 'ask_human' && !isWaitingForConvo) {
      log.warn(`STALL detected: repeated ${action} on ${taskId} — forcing idle`);
      state.interval = MAX_INTERVAL;
      state.recentActions = [];
      fetch(CALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: agent.name,
          result: { text: `⚠️ ${agent.name} is stuck on: ${action} on ${taskId}. Needs help.` },
          whatsapp_number: null,
        }),
      }).catch(() => {});
    }
  }

  // --- Phase 3.3: RUNAWAY COST DETECTION ---
  // If agent is burning money fast without completing tasks, force pause.
  // Tracks rolling cost in a 30-min window and aborts if it exceeds threshold
  // without proportional task completions.
  if (action !== 'idle' && state.budgetFromDB) {
    const costToday = (state.budgetFromDB as any).cost_usd_today || 0;
    const dailyCap = (state.budgetFromDB as any).max_cost_usd_today || 5;
    const ratio = costToday / dailyCap;

    // If we hit 50% of daily cap with fewer than 5 tasks completed → likely loop
    if (ratio >= 0.5 && state.tasksCompletedSinceCheckin < 2 && state.iteration > 20) {
      log.warn(`RUNAWAY: ${(ratio * 100).toFixed(0)}% of daily cap used with only ${state.tasksCompletedSinceCheckin} tasks completed — forcing pause`);
      state.interval = DEEP_SLEEP_INTERVAL;
      state.recentActions = [];
      // Notify via backlog (deduplicates)
      sbPost('agent_backlog', {
        org_id: agent.orgId,
        agent_id: agent.id,
        category: 'blocker',
        title: `${agent.name} runaway detected: $${costToday.toFixed(2)} burned with ${state.tasksCompletedSinceCheckin} tasks done`,
        details: `Used ${(ratio * 100).toFixed(0)}% of daily cap. Forced into deep sleep (5min probe). Investigate task loops.`,
      }).catch(() => {});
    }

    // Hard stop at 100% cap (extra safety net)
    if (ratio >= 1.0) {
      log.error(`HARD STOP: Daily cap reached ($${costToday.toFixed(2)}/$${dailyCap})`);
      state.running = false;
      sbPatch(`agents?id=eq.${agent.id}`, { availability: 'offline' }).catch(() => {});
    }
  }

  // --- Heartbeat ---
  await updateHeartbeat(agent.id, action, taskId, state.iteration);

  // --- Sync budget ---
  if (action !== 'idle') {
    await syncBudget(agent.id, agent.orgId, state);
  }

  // --- Budget alert ---
  await checkBudgetAlert(agent.name, state, log);
}
