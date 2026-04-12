/**
 * ACT phase — execute the decision
 * Ported from event-loop.js lines 365-723.
 * KEY CHANGE: callGateway() replaced with executeWithSDK().
 * KEY CHANGE: send_message via a2a-send.js replaced with direct Supabase insert.
 */

import type { AgentConfig, LoopState, SenseContext, ParsedAction } from '../types.js';
import { MIN_INTERVAL, MAX_INTERVAL, STALL_CLAIM_LIMIT, MSG_CIRCUIT_LIMIT, MSG_CIRCUIT_WINDOW } from '../types.js';
import { sbGet, sbPatch, sbPost, sbPostReturn, sbRpc, getSupabaseUrl, getSupabaseHeaders } from '../supabase-client.js';
import { getTokenCost } from '../utils/budget.js';
import { executeWithSDK } from '../sdk-runner.js';
import type { Logger } from '../utils/logger.js';

const safe = <T>(arr: unknown): T[] => (Array.isArray(arr) ? arr : []);

// Circuit breaker for agent-to-agent messaging (ported from event-loop.js)
const messageCounts: Record<string, { count: number; resetAt: number }> = {};

// ask_human dedup uses DB query (no in-memory state needed)

/** Log to agent_activity_events (Mission Control depends on this) */
async function logActivity(agentId: string, orgId: string, eventType: string, toolName: string, content: string): Promise<void> {
  sbPost('agent_activity_events', {
    agent_id: agentId,
    org_id: orgId,
    event_type: eventType,
    tool_name: toolName,
    content: (typeof content === 'string' ? content : JSON.stringify(content)).substring(0, 3000),
  }).catch(() => {});
}

/** Log to agent_messages */
async function logMessage(
  orgId: string,
  fromId: string | null,
  toId: string | null,
  role: string,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  sbPost('agent_messages', {
    org_id: orgId,
    from_agent_id: fromId,
    to_agent_id: toId,
    role,
    content: (content || '').substring(0, 2000),
    metadata,
  }).catch(() => {});
}

export async function act(
  decision: ParsedAction,
  context: SenseContext,
  agent: AgentConfig,
  state: LoopState,
  log: Logger,
): Promise<string | null> {
  const { action, params = {} } = decision;
  log.info(`ACT: ${action} — ${decision.reasoning || ''}`);

  if (action !== 'idle') {
    logActivity(agent.id, agent.orgId, 'event_loop_action', action,
      `${decision.reasoning || ''} | ${JSON.stringify(params).substring(0, 200)}`);
  }

  switch (action) {
    // ==============================
    // CLAIM TASK — exact port with v2 RPC + legacy fallback
    // ==============================
    case 'claim_task': {
      if (!params.task_id) break;

      // Guard: max 1 task per agent
      const existingTask = await sbGet<Array<{ id: string }>>(
        `agent_tasks_v2?assigned_agent_id=eq.${agent.id}&status=in.(claimed,in_progress)&limit=1&select=id`,
      ).catch(() => []);
      if (Array.isArray(existingTask) && existingTask.length > 0) {
        log.info('Already have an active task, skipping claim');
        return 'already_has_task';
      }

      // Phase 2.3: SERIAL CODE EXECUTION (Cognition pattern)
      // Only ONE code task in_progress at a time across the org to avoid
      // 17× error amplification when multiple agents edit the same files.
      if (agent.capabilities.includes('code')) {
        const codeInProgress = await sbGet<Array<{ id: string }>>(
          `agent_tasks_v2?org_id=eq.${agent.orgId}&task_type=eq.code&status=in.(claimed,in_progress)&limit=1&select=id`,
        ).catch(() => []);
        if (Array.isArray(codeInProgress) && codeInProgress.length > 0) {
          log.info('[serial] Another code task in progress — waiting');
          state.interval = MIN_INTERVAL * 2;
          return 'waiting_serial';
        }
      }

      // ALWAYS use v2 RPC first (atomic, capability-matched)
      const capabilities = state.agentConfig?.capabilities || agent.capabilities;
      const claimed = await sbRpc<Array<{ id: string; title: string; priority: number }>>(
        'claim_task_v2',
        { p_org_id: agent.orgId, p_agent_id: agent.id, p_capabilities: capabilities },
      );
      if (claimed && Array.isArray(claimed) && claimed.length > 0) {
        state.consecutiveFailedClaims = 0;
        log.info(`Claimed v2 task: ${claimed[0].id} — ${claimed[0].title}`);
        state.interval = MIN_INTERVAL;
        return 'claimed_v2';
      }

      // v2 claim returned nothing — try legacy blackboard as fallback
      try {
        const claimRes = await fetch(`${getSupabaseUrl()}/functions/v1/blackboard`, {
          method: 'PATCH',
          headers: getSupabaseHeaders(),
          body: JSON.stringify({ entry_id: params.task_id, action: 'claim', agent_id: agent.id }),
        });
        const claimData = await claimRes.json().catch(() => ({}));
        if ((claimData as any).entry?.status === 'claimed') {
          state.consecutiveFailedClaims = 0;
          return 'claimed';
        }
      } catch {}

      // Both failed — track consecutive failures
      state.consecutiveFailedClaims++;
      log.warn(`Claim failed (${state.consecutiveFailedClaims}/${STALL_CLAIM_LIMIT})`);
      if (state.consecutiveFailedClaims >= STALL_CLAIM_LIMIT) {
        log.warn('Claim stall detected — forcing idle to avoid loop');
        state.consecutiveFailedClaims = 0;
        state.interval = MAX_INTERVAL;
        return 'claim_stalled';
      }
      return 'claim_failed';
    }

    // ==============================
    // WORK ON TASK — KEY CHANGE: SDK instead of callGateway
    // ==============================
    case 'work_on_task': {
      if (!params.task_id) break;

      // Auto-fill instruction from task description if THINK didn't provide it
      if (!params.instruction) {
        try {
          const taskRows = await sbGet<Array<{ description: string; title: string; context_summary: string; parent_result_summary: string }>>(
            `agent_tasks_v2?id=eq.${params.task_id}&select=description,title,context_summary,parent_result_summary`,
          );
          if (Array.isArray(taskRows) && taskRows.length > 0) {
            const t = taskRows[0];
            params.instruction = [
              t.description || t.title,
              t.parent_result_summary ? `\nCONTEXT FROM DEPENDENCIES:\n${t.parent_result_summary}` : '',
              t.context_summary ? `\nPREVIOUS REVIEW FEEDBACK:\n${t.context_summary}` : '',
            ].join('').trim();
            log.info(`Auto-filled instruction from task description (${(params.instruction as string).length} chars)`);
          }
        } catch {}
      }
      if (!params.instruction) {
        log.warn(`work_on_task: no instruction and task ${params.task_id} not found, skipping`);
        break;
      }

      // ============================================
      // BUDGET HARD CAP — block before executing
      // ============================================
      try {
        const budgetCheck = await sbRpc<{
          allowed: boolean; reason?: string;
          spent_today?: number; cap?: number;
          user_spent_today?: number; user_cap?: number;
        }>(
          'check_budget_allows_task',
          { p_agent_id: agent.id }
        );
        if (budgetCheck && budgetCheck.allowed === false) {
          const isUserCap = budgetCheck.reason === 'user_daily_cap_reached';
          const spent = isUserCap ? budgetCheck.user_spent_today : budgetCheck.spent_today;
          const cap = isUserCap ? budgetCheck.user_cap : budgetCheck.cap;
          const label = isUserCap ? 'USER daily cap' : 'Agent daily cap';
          log.warn(`[budget] Task BLOCKED: ${label} — spent $${spent}/$${cap}`);
          // Mark task back to ready so another agent (or tomorrow) can pick it up
          await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
            status: 'ready',
            assigned_agent_id: null,
            updated_at: new Date().toISOString(),
          });
          // Notify human via backlog (deduplicates automatically)
          await sbPost('agent_backlog', {
            org_id: agent.orgId,
            agent_id: agent.id,
            category: 'blocker',
            title: `${agent.name} hit ${label} ($${cap})`,
            details: `Spent $${spent} today. Task released back to queue. Cap resets in 24h.`,
          }).catch(() => {});
          state.interval = MAX_INTERVAL; // back off
          return 'budget_capped';
        }
      } catch (e: any) {
        log.warn(`[budget] Check failed: ${e.message}, allowing task`);
      }

      const isV2 = await sbGet<Array<{ id: string }>>(`agent_tasks_v2?id=eq.${params.task_id}&select=id`).catch(() => []);
      if (Array.isArray(isV2) && isV2.length > 0) {
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, { status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      } else {
        await sbPatch(`project_board?id=eq.${params.task_id}`, { status: 'working' });
      }

      const instruction = params.instruction as string;
      const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const cwd = `/workspace/${safeName}`;
      const repoDir = `${cwd}/repo`;
      const isCodeAgent = agent.capabilities.includes('code');
      const shellEnv = { ...process.env, HOME: process.env.HOME || '/home/agent' };
      let preExecContext = '';

      // Shell helper using execFile (safe, no shell injection)
      const { execFile: _execFile } = await import('node:child_process');
      const { promisify: _promisify } = await import('node:util');
      const runCmd = _promisify(_execFile);
      const shell = async (cmd: string, args: string[], runCwd?: string): Promise<string> => {
        try {
          const { stdout, stderr } = await runCmd(cmd, args, { cwd: runCwd || repoDir, timeout: 180_000, env: shellEnv } as any);
          const out = String(stdout || '').trim();
          const err = String(stderr || '').trim();
          return `${out}${err ? '\n' + err : ''}`;
        } catch (e: any) {
          return `ERROR: ${(e.stderr || e.message || '').substring(0, 300)}`;
        }
      };

      // ================================================================
      // PRE-EXEC: All bash runs HERE, not in the SDK
      // ================================================================
      if (isCodeAgent) {
        log.info(`[pre-exec] Setting up repo for ${agent.name}...`);

        // 1. Clone or pull
        try {
          await runCmd('test', ['-d', `${repoDir}/.git`], { cwd } as any);
          const pullOut = await shell('git', ['pull', '--rebase']);
          preExecContext += `git pull → ${pullOut.substring(0, 100)}\n`;
          log.info(`[pre-exec] git pull OK`);
        } catch {
          const ghToken = process.env.GITHUB_TOKEN || '';
          const url = ghToken ? `https://${ghToken}@github.com/rasheedb1/CadenceV1.0.git` : 'https://github.com/rasheedb1/CadenceV1.0.git';
          log.info(`[pre-exec] Cloning...`);
          const cloneOut = await shell('git', ['clone', url, repoDir], cwd);
          preExecContext += `git clone → ${cloneOut.substring(0, 150)}\n`;
        }

        // 2. npm install if needed
        try {
          await runCmd('test', ['-d', `${repoDir}/node_modules`], { cwd } as any);
          log.info(`[pre-exec] node_modules exists`);
        } catch {
          log.info(`[pre-exec] npm install...`);
          const npmOut = await shell('npm', ['install', '--include=dev']);
          preExecContext += `npm install → ${npmOut.substring(0, 200)}\n`;
          log.info(`[pre-exec] npm install result: ${npmOut.substring(0, 100)}`);
        }
      }

      // 3. Team artifacts by REFERENCE (Phase 2.2 — Anthropic pattern)
      // Don't inject full markdown content (~50KB each = inflates context).
      // Instead, write only an INDEX with summaries. Agent reads full file with Read tool ONLY if needed.
      let artifactsIndex = '';
      try {
        const projId = agent.currentProjectId;
        if (projId) {
          const arts = await sbGet<Array<{ id: string; filename: string; content: string; content_summary: string; artifact_type: string; created_by: string }>>(
            `agent_artifacts?project_id=eq.${projId}&created_by=neq.${agent.id}&order=created_at.desc&limit=8&select=id,filename,content,content_summary,artifact_type,created_by`,
          ).catch(() => []);
          if (Array.isArray(arts) && arts.length > 0) {
            const { writeFile, mkdir } = await import('node:fs/promises');
            const artDir = `${cwd}/team-artifacts`;
            await mkdir(artDir, { recursive: true }).catch(() => {});

            // Write each artifact as a file (full content available on demand)
            for (const a of arts) {
              await writeFile(`${artDir}/${a.filename}.md`, a.content || '', 'utf-8').catch(() => {});
            }

            // Build a compact INDEX for the prompt (only summaries, ~200 chars each)
            artifactsIndex = `\nAvailable team artifacts (use Read tool to load full content if needed):\n`;
            for (const a of arts) {
              const sizeKb = Math.ceil((a.content?.length || 0) / 1024);
              const summary = (a.content_summary || '').substring(0, 150);
              artifactsIndex += `- ${a.filename}.md (${sizeKb}KB, ${a.artifact_type}) — ${summary}\n`;
            }
            preExecContext += `Team artifacts: ${arts.length} files indexed (loaded on-demand)\n`;
            log.info(`[pre-exec] Indexed ${arts.length} team artifacts (by reference, not inline)`);
          }
        }
      } catch {}

      // ================================================================
      // SDK: Read/Write/Edit only — NO Bash
      // ================================================================
      const workDir = isCodeAgent ? repoDir : cwd;
      const sdkPrompt = `${instruction}

ENVIRONMENT:
- Working directory: ${workDir}
${isCodeAgent ? `- Repo cloned, npm installed, ready to edit code.
- Do NOT use Bash tool. Git, npm, build, deploy are automated after you finish.
- Just use Read, Edit, Write, Grep, Glob to modify code. Describe what you changed when done.` : `- Use Read, Write, Grep, Glob, WebSearch, screenshot_page as needed.`}
${artifactsIndex}
${preExecContext ? `SETUP:\n${preExecContext}` : ''}`;

      const result = await executeWithSDK(agent, sdkPrompt, log);
      state.budget.tokens += result.tokensUsed;
      log.info(`Task ${(params.task_id as string).substring(0, 8)} (${result.numTurns} turns, $${result.costUsd.toFixed(4)})`);
      logActivity(agent.id, agent.orgId, 'task_result', 'work_on_task',
        `Task: ${params.task_id} | Turns: ${result.numTurns} | Cost: $${result.costUsd.toFixed(4)} | Result: ${result.text.substring(0, 300)}`);

      // Record cost in DB (updates daily counter, returns cap status)
      try {
        const costRecord = await sbRpc<{
          spent_today: number; cap: number; over_cap: boolean; over_80: boolean;
          user_spent_today?: number; user_cap?: number; user_over_cap?: boolean;
        }>(
          'record_task_cost',
          { p_agent_id: agent.id, p_cost: result.costUsd, p_tokens: result.tokensUsed }
        );
        if (costRecord?.user_over_cap) {
          log.warn(`[budget] USER CAP REACHED: $${costRecord.user_spent_today}/$${costRecord.user_cap}`);
        } else if (costRecord?.over_cap) {
          log.warn(`[budget] AGENT CAP after task: $${costRecord.spent_today}/$${costRecord.cap}`);
        } else if (costRecord?.over_80) {
          log.warn(`[budget] Agent 80%+ used: $${costRecord.spent_today}/$${costRecord.cap}`);
        }
      } catch (e: any) {
        log.warn(`[budget] Cost recording failed: ${e.message}`);
      }

      // ================================================================
      // POST-EXEC: Build → commit → push → deploy (FIX #3)
      // ================================================================
      let postLog = '';
      if (isCodeAgent && result.numTurns > 0 && !result.text.startsWith('(error:')) {
        log.info(`[post-exec] Deterministic QA → Build → commit → push → deploy...`);

        // ================================================================
        // DETERMINISTIC QA — runs FREE checks before invoking expensive QA agents
        // (Phase 2.4: replaces 50-70% of agent QA calls with $0 tooling)
        // ================================================================
        const qaResults: { check: string; ok: boolean; output: string }[] = [];

        // 1. TypeScript check (catches type errors immediately)
        const tscOut = await shell('npx', ['--no-install', 'tsc', '--noEmit']);
        const tscOk = !tscOut.startsWith('ERROR:') && !tscOut.includes('error TS');
        qaResults.push({ check: 'tsc', ok: tscOk, output: tscOut.substring(0, 200) });
        log.info(`[qa] tsc: ${tscOk ? 'OK' : 'FAIL'}`);

        // 2. Build (Vite)
        const buildOut = await shell('npx', ['--no-install', 'vite', 'build']);
        const buildOk = !buildOut.startsWith('ERROR:') && !buildOut.includes('not found');
        qaResults.push({ check: 'build', ok: buildOk, output: buildOut.substring(0, 200) });
        log.info(`[qa] build: ${buildOk ? 'OK' : 'FAIL'}`);

        // 3. Tests (if test script exists in package.json)
        let testsOk = true;
        try {
          const pkgRaw = await runCmd('cat', [`${repoDir}/package.json`], { cwd: repoDir, env: shellEnv } as any);
          const pkg = JSON.parse(String(pkgRaw.stdout || '{}'));
          if (pkg.scripts?.test && !pkg.scripts.test.includes('no test')) {
            const testOut = await shell('npm', ['test', '--', '--run']);
            testsOk = !testOut.startsWith('ERROR:') && !testOut.includes('FAIL ') && !testOut.includes('failed');
            qaResults.push({ check: 'tests', ok: testsOk, output: testOut.substring(0, 200) });
            log.info(`[qa] tests: ${testsOk ? 'OK' : 'FAIL'}`);
          }
        } catch {}

        // Aggregate QA result
        const allQaPassed = qaResults.every(r => r.ok);
        const qaSummary = qaResults.map(r => `${r.check}: ${r.ok ? '✅' : '❌'}`).join(' · ');
        postLog += `qa: ${qaSummary}\n`;

        // Only push if ALL deterministic checks pass
        if (allQaPassed) {
          // 4. Check for changes
          const diff = await shell('git', ['diff', '--stat']);
          const untracked = await shell('git', ['ls-files', '--others', '--exclude-standard']);
          if (diff.trim() || untracked.trim()) {
            // 5. Commit + push
            await shell('git', ['add', '-A']);
            const title = ((await sbGet<Array<{ title: string }>>(`agent_tasks_v2?id=eq.${params.task_id}&select=title`).catch(() => []))?.[0]?.title || 'update').substring(0, 50);
            await shell('git', ['-c', 'user.name=Chief Agent', '-c', 'user.email=agents@chief.ai', 'commit', '-m', `${title} — ${agent.name}`]);
            const pushOut = await shell('git', ['push']);
            postLog += `push: ${pushOut.substring(0, 80)}\n`;
            log.info(`[post-exec] pushed`);

            // 6. Deploy
            const vToken = process.env.VERCEL_TOKEN;
            if (vToken) {
              const dArgs = ['--prod', '--yes', `--token=${vToken}`, '--name', process.env.VERCEL_PROJECT_NAME || 'chief.ai'];
              if (process.env.VERCEL_SCOPE) dArgs.push('--scope', process.env.VERCEL_SCOPE);
              const dOut = await shell('vercel', dArgs);
              postLog += `deploy: ${dOut.includes('vercel.app') || dOut.includes('Production') ? 'OK' : dOut.substring(0, 80)}\n`;
              log.info(`[post-exec] deployed`);
            }

            // 7. Auto-tag as QA-passed (saves invoking QA agent later)
            postLog += `qa_status: AUTO_PASSED — no agent QA needed\n`;
          } else {
            postLog += `no changes\n`;
          }
        } else {
          // Save failures so the agent can fix in next iteration
          const failedChecks = qaResults.filter(r => !r.ok);
          postLog += `❌ QA FAILED — push/deploy blocked\n`;
          for (const f of failedChecks) {
            postLog += `  ${f.check}: ${f.output}\n`;
          }
          log.warn(`[post-exec] QA failed (${failedChecks.length} checks), not pushing`);
        }
      }

      // ================================================================
      // AUTO-COMPLETE
      // ================================================================
      if (result.numTurns > 0 && !result.text.startsWith('(error:') && Array.isArray(isV2) && isV2.length > 0) {
        const ti = ((await sbGet<Array<{ title: string; task_type: string }>>(`agent_tasks_v2?id=eq.${params.task_id}&select=title,task_type`).catch(() => [])) as any)?.[0];
        if (ti?.title?.startsWith('[REVIEW]') || ti?.task_type === 'review') return result.text;

        const fullResult = postLog ? `${result.text.substring(0, 1500)}\n\n--- Pipeline ---\n${postLog}` : result.text.substring(0, 2000);
        const summary = fullResult.length > 400 ? fullResult.substring(0, 400) + '...' : fullResult;
        let artId: string | null = null;
        try {
          artId = ((await sbPostReturn<{ id: string }>('agent_artifacts', {
            org_id: agent.orgId, task_id: params.task_id,
            filename: `${((ti?.title || 'output').substring(0, 40)).replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}-result`,
            version: 1, artifact_type: ti?.task_type || 'general',
            content: fullResult, content_summary: summary, created_by: agent.id,
          })) as any)?.id || null;
        } catch {}

        // Save REAL per-task cost/tokens (from SDK), not the agent's running total
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
          status: 'done', completed_at: new Date().toISOString(),
          result: { summary: fullResult },
          tokens_used: result.tokensUsed,
          cost_usd: result.costUsd,
          artifact_ids: artId ? [artId] : [], updated_at: new Date().toISOString(),
        });
        state.tasksCompletedSinceCheckin++;
        state.interval = MIN_INTERVAL;
        log.info(`Auto-completed ${(params.task_id as string).substring(0, 8)}`);

        // Notify user via WhatsApp that task is done
        const CALLBACK_URL_DONE = process.env.CALLBACK_URL ||
          'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback';
        fetch(CALLBACK_URL_DONE, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: params.task_id,
            agent_name: agent.name,
            result: { text: summary },
            whatsapp_number: null,
          }),
        }).catch((e) => log.warn(`Callback failed: ${e.message}`));

        return 'auto_completed';
      }

      // If task ran but had errors or blockers, notify user
      if (result.numTurns > 0 && result.text && result.text.length > 10) {
        const CALLBACK_URL_ERR = process.env.CALLBACK_URL ||
          'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback';
        const errSummary = result.text.substring(0, 500);
        fetch(CALLBACK_URL_ERR, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: params.task_id,
            agent_name: agent.name,
            error: errSummary,
            whatsapp_number: null,
          }),
        }).catch((e) => log.warn(`Error callback failed: ${e.message}`));
      }

      return result.text;
    }

    // ==============================
    // COMPLETE TASK — exact port with artifact creation
    // ==============================
    case 'complete_task': {
      if (!params.task_id) break;

      const isV2c = await sbGet<Array<{ id: string; title: string; task_type: string }>>(
        `agent_tasks_v2?id=eq.${params.task_id}&select=id,title,task_type`,
      ).catch(() => []);

      if (Array.isArray(isV2c) && isV2c.length > 0) {
        const task = isV2c[0];
        const taskTokens = state.budget.tokens;
        const taskCost = getTokenCost(taskTokens, state.agentConfig?.model as string || 'claude-sonnet-4-6');
        const resultText = (params.result_summary as string) || 'Done';

        // Create artifact from the result
        const contentSummary = resultText.length > 400
          ? resultText.substring(0, 400) + '...'
          : resultText;
        let artifactId: string | null = null;
        try {
          const artData = await sbPostReturn<{ id: string }>('agent_artifacts', {
            org_id: agent.orgId,
            task_id: params.task_id,
            filename: `${(task.title || 'output').substring(0, 40).replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}-result`,
            version: 1,
            artifact_type: task.task_type || 'general',
            content: resultText.substring(0, 10000),
            content_summary: contentSummary,
            created_by: agent.id,
          });
          artifactId = artData?.id || null;
        } catch (e: any) {
          log.error(`Artifact creation failed: ${e.message}`);
        }

        // Update task with result + artifact
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
          status: 'done',
          completed_at: new Date().toISOString(),
          result: { summary: resultText },
          tokens_used: taskTokens,
          cost_usd: taskCost,
          artifact_ids: artifactId ? [artifactId] : [],
          updated_at: new Date().toISOString(),
        });
        state.tasksCompletedSinceCheckin++;
        log.info(`Completed v2 task ${(params.task_id as string).substring(0, 8)}${artifactId ? ' + artifact ' + artifactId.substring(0, 8) : ''} (${state.tasksCompletedSinceCheckin} since last check-in)`);
      } else {
        // Legacy blackboard
        await fetch(`${getSupabaseUrl()}/functions/v1/blackboard`, {
          method: 'PATCH',
          headers: getSupabaseHeaders(),
          body: JSON.stringify({ entry_id: params.task_id, action: 'complete', result: params.result_summary || 'Done' }),
        }).catch(() => {});
        state.tasksCompletedSinceCheckin++;
      }

      state.interval = MIN_INTERVAL;
      return 'completed';
    }

    // ==============================
    // REQUEST REVIEW — exact port
    // ==============================
    case 'request_review': {
      if (!params.task_id) break;
      const resultText = (params.result_summary as string) || 'Work completed, ready for review';

      // Create artifact from the work
      let artId: string | null = null;
      try {
        const taskInfo = await sbGet<Array<{ title: string; task_type: string; review_iteration: number; org_id: string }>>(
          `agent_tasks_v2?id=eq.${params.task_id}&select=title,task_type,review_iteration,org_id`,
        ).catch(() => []);
        const ti = safe(taskInfo)[0] as any;
        if (ti) {
          const version = (ti.review_iteration || 0) + 1;
          const artData = await sbPostReturn<{ id: string }>('agent_artifacts', {
            org_id: agent.orgId,
            task_id: params.task_id,
            filename: (ti.title || 'output').substring(0, 40).replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase(),
            version,
            artifact_type: ti.task_type || 'general',
            content: resultText.substring(0, 10000),
            content_summary: resultText.substring(0, 400),
            created_by: agent.id,
          });
          artId = artData?.id || null;
        }
      } catch (e: any) {
        log.error(`Artifact for review failed: ${e.message}`);
      }

      // Set task to review status
      await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
        status: 'review',
        result: { summary: resultText },
        artifact_ids: artId ? [artId] : [],
        updated_at: new Date().toISOString(),
      });

      // Create a review task for another agent to claim
      try {
        const taskInfo = await sbGet<Array<{ title: string; org_id: string; project_id: string; review_iteration: number }>>(
          `agent_tasks_v2?id=eq.${params.task_id}&select=title,org_id,project_id,review_iteration`,
        ).catch(() => []);
        const ti = safe(taskInfo)[0] as any;
        if (ti) {
          await sbPost('agent_tasks_v2', {
            org_id: agent.orgId,
            project_id: ti.project_id,
            title: `[REVIEW] ${ti.title}`,
            description: `Review work by ${agent.name}: ${((params.review_notes as string) || resultText).substring(0, 300)}`,
            task_type: 'review',
            required_capabilities: [],
            priority: 5,
            status: 'ready',
            parent_result_summary: `Artifact to review: ${resultText.substring(0, 400)}`,
            context_summary: `This is a review of task "${ti.title}". Evaluate quality, give score 0-1, list issues and suggestions. Use submit_review.`,
            depends_on: [],
          });
          log.info(`Review requested for task ${(params.task_id as string).substring(0, 8)}, artifact ${artId?.substring(0, 8) || 'none'}`);
        }
      } catch (e: any) {
        log.error(`Review task creation failed: ${e.message}`);
      }

      logActivity(agent.id, agent.orgId, 'event_loop_action', 'request_review',
        `Review requested for: ${params.task_id} | ${resultText.substring(0, 100)}`);
      return 'review_requested';
    }

    // ==============================
    // SUBMIT REVIEW — exact port
    // ==============================
    case 'submit_review': {
      if (!params.task_id) break;
      const score = typeof params.score === 'number' ? params.score : 0.5;
      const passed = params.passed === true;
      const issues = Array.isArray(params.issues)
        ? (params.issues as string[]).map((i) => ({ issue: i, severity: 'medium' }))
        : [];
      const suggestions = Array.isArray(params.suggestions)
        ? (params.suggestions as string[]).map((s) => ({ suggestion: s, priority: 'medium' }))
        : [];

      // Resolve the ORIGINAL task ID
      let originalTaskId = params.task_id as string;
      const reviewTaskRows = await sbGet<Array<{ id: string; depends_on: string[]; title: string }>>(
        `agent_tasks_v2?id=eq.${params.task_id}&select=id,depends_on,title`,
      ).catch(() => []);
      const reviewTask = safe(reviewTaskRows)[0] as any;
      if (reviewTask?.depends_on?.length > 0 && reviewTask.title?.startsWith('[REVIEW]')) {
        originalTaskId = reviewTask.depends_on[0];
        log.info(`submit_review: resolved original task ${originalTaskId} from review task ${params.task_id}`);
      }

      // Get original task's latest artifact
      const artRows = await sbGet<Array<{ id: string }>>(
        `agent_artifacts?task_id=eq.${originalTaskId}&order=version.desc&limit=1&select=id`,
      ).catch(() => []);
      const artifactId = (safe(artRows)[0] as any)?.id || null;

      // Get current review iteration from ORIGINAL task
      const taskRows = await sbGet<Array<{ review_iteration: number; max_review_iterations: number }>>(
        `agent_tasks_v2?id=eq.${originalTaskId}&select=review_iteration,max_review_iterations`,
      ).catch(() => []);
      const taskInfo = safe(taskRows)[0] as any;
      const iteration = ((taskInfo?.review_iteration as number) || 0) + 1;
      const maxIter = (taskInfo?.max_review_iterations as number) || 3;

      // Create review record
      await sbPost('agent_reviews', {
        org_id: agent.orgId,
        task_id: originalTaskId,
        artifact_id: artifactId,
        reviewer_agent_id: agent.id,
        score, passed, issues, suggestions, iteration, max_iterations: maxIter,
      });

      // Mark the review task itself as done
      if (originalTaskId !== params.task_id) {
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
          status: 'done',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          result: { summary: `Review: score=${score}, passed=${passed}, issues=${issues.length}` },
        });
      }

      const CALLBACK_URL = process.env.CALLBACK_URL ||
        'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback';

      if (passed) {
        await sbPatch(`agent_tasks_v2?id=eq.${originalTaskId}`, {
          status: 'done', review_score: score, review_iteration: iteration,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        log.info(`Review APPROVED: original task ${originalTaskId} (score ${score})`);
        state.tasksCompletedSinceCheckin++;
      } else if (iteration >= maxIter) {
        await sbPatch(`agent_tasks_v2?id=eq.${originalTaskId}`, {
          status: 'failed', review_score: score, review_iteration: iteration,
          error: `Review failed after ${iteration} iterations. Last issues: ${issues.map((i) => i.issue).join('; ')}`,
          updated_at: new Date().toISOString(),
        });
        fetch(CALLBACK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: agent.name,
            result: { text: `⚠️ Task "${originalTaskId}" failed review after ${iteration} iterations.\nScore: ${score}\nIssues: ${issues.map((i) => i.issue).join(', ')}\nNeeds human intervention.` },
            whatsapp_number: null,
          }),
        }).catch(() => {});
        log.info(`Review FAILED after ${iteration} iterations, escalating`);
      } else {
        await sbPatch(`agent_tasks_v2?id=eq.${originalTaskId}`, {
          status: 'in_progress', review_score: score, review_iteration: iteration,
          context_summary: `Review #${iteration} (score ${score}, NOT APPROVED):\nIssues: ${issues.map((i) => i.issue).join('; ')}\nSuggestions: ${suggestions.map((s) => s.suggestion).join('; ')}\nFix these issues and request_review again.`,
          updated_at: new Date().toISOString(),
        });
        log.info(`Review NOT PASSED (iter ${iteration}/${maxIter}), sent back for revision`);
      }

      logActivity(agent.id, agent.orgId, 'event_loop_action', 'submit_review',
        `Review for ${params.task_id}: score=${score}, passed=${passed}, issues=${issues.length}`);
      return passed ? 'approved' : 'revision_needed';
    }

    // ==============================
    // ASK HUMAN — exact port (writes to outbound_human_messages)
    // ==============================
    case 'ask_human': {
      if (!params.question) break;
      const question = params.question as string;

      // --- Smart dedup: check if a similar question was already sent in the last 2 hours ---
      try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const recentMsgs = await sbGet<Array<{ message: string }>>(
          `outbound_human_messages?from_agent_id=eq.${agent.id}&created_at=gt.${twoHoursAgo}&select=message`,
        ).catch(() => []);

        if (Array.isArray(recentMsgs) && recentMsgs.length > 0) {
          // Check if any recent message is >60% similar (shared words)
          const questionWords = new Set(question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          const isDuplicate = recentMsgs.some((m) => {
            const msgWords = new Set((m.message || '').toLowerCase().split(/\s+/).filter(w => w.length > 3));
            const shared = [...questionWords].filter(w => msgWords.has(w)).length;
            const similarity = shared / Math.max(questionWords.size, 1);
            return similarity > 0.6;
          });

          if (isDuplicate) {
            log.info(`ask_human dedup: similar question already sent in last 2h, skipping`);
            return 'dedup_skipped';
          }
        }
      } catch {}

      // Not a duplicate — send it
      try {
        await sbPost('outbound_human_messages', {
          org_id: agent.orgId,
          from_agent_id: agent.id,
          message: question,
          priority: params.priority || 'normal',
          context: { task_id: params.task_id || null, agent_name: agent.name },
        });
        log.info(`ask_human: "${question.substring(0, 80)}"`);
        logActivity(agent.id, agent.orgId, 'event_loop_action', 'ask_human',
          `Question to human: ${question.substring(0, 200)}`);
      } catch (e: any) {
        log.error(`ask_human failed: ${e.message}`);
      }
      // Back off after asking — don't tick again for 2 minutes to avoid loop
      state.interval = MAX_INTERVAL;
      return 'question_sent';
    }

    // ==============================
    // SEND MESSAGE — CHANGED: direct Supabase insert instead of A2A
    // ==============================
    case 'send_message': {
      if (!params.to_agent || !params.message) break;
      const now = Date.now();
      const mc = messageCounts[params.to_agent as string];
      if (mc && mc.resetAt > now) {
        if (mc.count >= MSG_CIRCUIT_LIMIT) {
          log.warn(`Circuit breaker: ${mc.count} msgs to ${params.to_agent}, skipping`);
          return 'circuit_breaker';
        }
        mc.count++;
      } else {
        messageCounts[params.to_agent as string] = { count: 1, resetAt: now + MSG_CIRCUIT_WINDOW };
      }

      // Resolve agent ID by name
      const toRows = await sbGet<Array<{ id: string }>>(
        `agents?org_id=eq.${agent.orgId}&name=ilike.%${encodeURIComponent(params.to_agent as string)}%&limit=1&select=id`,
      ).catch(() => []);
      const toAgentId = Array.isArray(toRows) && toRows[0] ? toRows[0].id : null;

      // Insert message directly (replaces A2A protocol)
      await sbPost('agent_messages', {
        org_id: agent.orgId,
        from_agent_id: agent.id,
        to_agent_id: toAgentId,
        role: 'user',
        content: (params.message as string).substring(0, 3000),
        message_type: (params.message_type as string) || 'info',
        project_id: agent.currentProjectId,
        metadata: { direct: true, from_agent_name: agent.name, to_agent_name: params.to_agent },
      });

      logMessage(agent.orgId, agent.id, toAgentId, 'user',
        `→ ${params.to_agent}: ${(params.message as string).substring(0, 3000)}`,
        { direct: true, to_agent_name: params.to_agent });

      log.info(`Message sent to ${params.to_agent}`);
      return 'message_sent';
    }

    // ==============================
    // CREATE SUBTASK — NEW action
    // ==============================
    case 'create_subtask': {
      if (!params.title) break;
      const assignTo = params.assign_to as string || 'auto';
      let assigneeId: string | null = null;
      if (assignTo === 'self') {
        assigneeId = agent.id;
      } else if (assignTo !== 'auto') {
        const rows = await sbGet<Array<{ id: string }>>(
          `agents?org_id=eq.${agent.orgId}&name=ilike.%${encodeURIComponent(assignTo)}%&limit=1&select=id`,
        ).catch(() => []);
        assigneeId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
      }

      const taskType = (params.task_type as string) || 'general';
      const TYPE_CAPS: Record<string, string[]> = {
        code: ['code', 'ops'], design: ['design'], research: ['research'],
        qa: ['research', 'outreach'], writing: ['writing'], general: [],
      };

      await sbPost('agent_tasks_v2', {
        org_id: agent.orgId,
        project_id: agent.currentProjectId,
        parent_task_id: agent.currentTaskId,
        title: params.title,
        description: params.description || '',
        task_type: taskType,
        required_capabilities: TYPE_CAPS[taskType] || [],
        priority: (params.priority as number) || 50,
        status: assigneeId ? 'claimed' : 'ready',
        assigned_agent_id: assigneeId,
        assigned_at: assigneeId ? new Date().toISOString() : null,
        depends_on: params.depends_on_task_id ? [params.depends_on_task_id] : [],
      });

      log.info(`Subtask created: "${params.title}" → ${assignTo}`);
      return 'subtask_created';
    }

    // ==============================
    // REPLY MESSAGE — NEW action
    // ==============================
    case 'reply_message': {
      if (!params.to_agent_id || !params.message) break;
      await sbPost('agent_messages', {
        org_id: agent.orgId,
        from_agent_id: agent.id,
        to_agent_id: params.to_agent_id,
        content: (params.message as string).substring(0, 2000),
        message_type: 'answer',
        thread_id: params.thread_id || params.original_message_id,
        project_id: agent.currentProjectId,
      });
      log.info(`Reply sent to ${(params.to_agent_id as string).substring(0, 8)}`);
      return 'reply_sent';
    }

    // ==============================
    // LEGACY: post_to_board
    // ==============================
    case 'post_to_board': {
      if (!params.title) break;
      await fetch(`${getSupabaseUrl()}/functions/v1/blackboard`, {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({
          org_id: agent.orgId, entry_type: 'note',
          title: params.title, content: { text: params.content || '' },
          written_by: agent.id,
        }),
      }).catch(() => {});
      return 'posted';
    }

    case 'idle':
    default:
      return null;
  }
  return null;
}
