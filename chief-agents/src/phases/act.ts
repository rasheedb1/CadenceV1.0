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
      if (!params.task_id || !params.instruction) break;

      // Check if v2 task
      const isV2 = await sbGet<Array<{ id: string }>>(
        `agent_tasks_v2?id=eq.${params.task_id}&select=id`,
      ).catch(() => []);
      if (Array.isArray(isV2) && isV2.length > 0) {
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
          status: 'in_progress',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else {
        await sbPatch(`project_board?id=eq.${params.task_id}`, { status: 'working' });
      }

      // --- Pre-execute: run bash setup commands directly (bypass Claude Code CLI) ---
      const instruction = params.instruction as string;
      let preExecContext = '';
      const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const cwd = `/workspace/${safeName}`;

      // For code-capable agents: ALWAYS ensure repo is cloned + pull latest
      if (agent.capabilities.includes('code')) {
        try {
          const { execFile: execFileCb2 } = await import('node:child_process');
          const { promisify: promisify2 } = await import('node:util');
          const execF = promisify2(execFileCb2);
          const repoDir = `${cwd}/repo`;
          const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
          const repoUrl = GITHUB_TOKEN
            ? `https://${GITHUB_TOKEN}@github.com/rasheedb1/CadenceV1.0.git`
            : 'https://github.com/rasheedb1/CadenceV1.0.git';

          // Check if repo exists, clone if not, pull if yes
          try {
            await execF('test', ['-d', `${repoDir}/.git`], { cwd });
            // Repo exists — pull latest
            const { stdout: pullOut } = await execF('git', ['pull', '--rebase'], { cwd: repoDir, timeout: 60_000, env: { ...process.env, HOME: process.env.HOME || '/home/agent' } });
            preExecContext += `\n$ git pull (in ${repoDir})\n${(pullOut || 'Already up to date').trim()}\n`;
            log.info(`[pre-exec] git pull OK in ${repoDir}`);
          } catch {
            // Repo doesn't exist — clone
            log.info(`[pre-exec] Cloning repo to ${repoDir}...`);
            try {
              const { stdout: cloneOut } = await execF('git', ['clone', repoUrl, repoDir], { cwd, timeout: 120_000, env: { ...process.env, HOME: process.env.HOME || '/home/agent' } });
              preExecContext += `\n$ git clone → ${repoDir}\n${(cloneOut || 'Cloned successfully').trim()}\n`;
              log.info(`[pre-exec] Clone OK`);
            } catch (cloneErr: any) {
              preExecContext += `\n$ git clone FAILED: ${(cloneErr.stderr || cloneErr.message || '').substring(0, 200)}\n`;
              log.warn(`[pre-exec] Clone failed: ${(cloneErr.stderr || cloneErr.message || '').substring(0, 100)}`);
            }
          }

          // npm install if node_modules doesn't exist
          try {
            await execF('test', ['-d', `${repoDir}/node_modules`], { cwd });
            preExecContext += `\n$ node_modules exists — skipping npm install\n`;
          } catch {
            log.info(`[pre-exec] Running npm install in ${repoDir}...`);
            try {
              const { stdout: npmOut, stderr: npmErr } = await execF('npm', ['install'], { cwd: repoDir, timeout: 180_000, env: { ...process.env, HOME: process.env.HOME || '/home/agent' } });
              preExecContext += `\n$ npm install (in ${repoDir})\n${(npmOut || '').trim().substring(0, 300)}\n`;
              if (npmErr) preExecContext += `STDERR: ${npmErr.substring(0, 200)}\n`;
              log.info(`[pre-exec] npm install OK`);
            } catch (npmErr: any) {
              preExecContext += `\n$ npm install FAILED: ${(npmErr.stderr || npmErr.message || '').substring(0, 300)}\n`;
              log.warn(`[pre-exec] npm install failed: ${(npmErr.stderr || npmErr.message || '').substring(0, 100)}`);
            }
          }

          // List repo contents for context
          try {
            const { stdout: lsOut } = await execF('ls', ['-la', repoDir], { cwd, timeout: 5_000 });
            preExecContext += `\n$ ls ${repoDir}\n${(lsOut || '').trim()}\n`;
          } catch {}
        } catch (e: any) {
          log.error(`[pre-exec] Repo setup error: ${e.message}`);
        }
      }

      // Auto-detect bash commands in the instruction and run them directly
      const bashPatterns = [
        /git\s+clone\s+\S+/i,
        /git\s+pull/i,
        /git\s+push/i,
        /git\s+add/i,
        /git\s+commit/i,
        /npm\s+(run\s+build|install|test|ci)/i,
        /cd\s+\S+\s*&&/i,
        /ls\s+/i,
        /echo\s+/i,
      ];
      const hasBashCommands = bashPatterns.some(p => p.test(instruction));

      if (hasBashCommands && agent.capabilities.includes('code')) {
        try {
          const { execFile: execFileCb } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execFileAsync = promisify(execFileCb);

          // Extract and run bash commands from the instruction
          const cmdMatches = instruction.match(/(?:^|\n)\s*((?:cd\s+\S+\s*&&\s*)?(?:git|npm|node|echo|ls|cat|pwd|mkdir|rm|cp|mv|find|grep|curl|chmod|whoami)\s+[^\n]*)/gim);
          if (cmdMatches) {
            for (const cmd of cmdMatches.slice(0, 10)) { // Max 10 commands
              const cleanCmd = cmd.trim();
              log.info(`[pre-exec] Running: ${cleanCmd.substring(0, 80)}`);
              try {
                const { stdout, stderr } = await execFileAsync('bash', ['-c', cleanCmd], {
                  cwd,
                  timeout: 120_000,
                  env: { ...process.env, HOME: process.env.HOME || '/home/agent' },
                });
                const output = (stdout || '').trim();
                const errOutput = (stderr || '').trim();
                preExecContext += `\n$ ${cleanCmd}\n${output}${errOutput ? '\nSTDERR: ' + errOutput : ''}\n`;
                log.info(`[pre-exec] OK: ${output.substring(0, 100)}`);
              } catch (cmdErr: any) {
                const errMsg = cmdErr.stderr || cmdErr.message || '';
                preExecContext += `\n$ ${cleanCmd}\nERROR: ${errMsg.substring(0, 200)}\n`;
                log.warn(`[pre-exec] Failed: ${errMsg.substring(0, 100)}`);
              }
            }
          }
        } catch (e: any) {
          log.error(`[pre-exec] Setup error: ${e.message}`);
        }
      }

      // Build the prompt: include pre-exec results + repo location
      const repoPath = agent.capabilities.includes('code') ? `${cwd}/repo` : cwd;
      const sdkInstruction = preExecContext
        ? `${instruction}\n\nENVIRONMENT:\n- Working directory: ${repoPath}\n- The repo is cloned and npm installed. node_modules are ready.\n- You can read/edit files directly using their paths under ${repoPath}/\n\nPRE-EXECUTED SHELL RESULTS:\n${preExecContext}\n\nThe commands above were already executed successfully. Focus on reading/editing code. Do NOT try to run git or npm — they are handled automatically.`
        : `${instruction}\n\nENVIRONMENT:\n- Working directory: ${repoPath}`;

      // *** Agent SDK for reasoning/coding tasks ***
      const result = await executeWithSDK(agent, sdkInstruction, log);

      // Track SDK token usage
      state.budget.tokens += result.tokensUsed;

      log.info(`Task ${(params.task_id as string).substring(0, 8)} result (${result.numTurns} turns, $${result.costUsd.toFixed(4)}): ${result.text.substring(0, 100)}`);
      logActivity(agent.id, agent.orgId, 'task_result', 'work_on_task',
        `Task: ${params.task_id} | Turns: ${result.numTurns} | Cost: $${result.costUsd.toFixed(4)} | Result: ${result.text.substring(0, 300)}`);

      // --- AUTO-COMPLETE: if SDK ran successfully (turns > 0, no error), complete the task ---
      // EXCEPT for [REVIEW] tasks — those need submit_review flow, not auto-complete
      if (result.numTurns > 0 && !result.text.startsWith('(error:') && Array.isArray(isV2) && isV2.length > 0) {
        const taskInfo = await sbGet<Array<{ title: string; task_type: string }>>(
          `agent_tasks_v2?id=eq.${params.task_id}&select=title,task_type`,
        ).catch(() => []);
        const ti = Array.isArray(taskInfo) && taskInfo[0] ? taskInfo[0] : null;

        // Skip auto-complete for review tasks — let THINK decide submit_review
        if (ti?.title?.startsWith('[REVIEW]') || ti?.task_type === 'review') {
          log.info(`Skipping auto-complete for review task — needs submit_review flow`);
          return result.text;
        }
        const resultSummary = result.text.substring(0, 2000);
        const contentSummary = resultSummary.length > 400 ? resultSummary.substring(0, 400) + '...' : resultSummary;

        // Create artifact
        let artifactId: string | null = null;
        try {
          const artData = await sbPostReturn<{ id: string }>('agent_artifacts', {
            org_id: agent.orgId,
            task_id: params.task_id,
            filename: `${((ti?.title || 'output').substring(0, 40)).replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}-result`,
            version: 1,
            artifact_type: ti?.task_type || 'general',
            content: resultSummary,
            content_summary: contentSummary,
            created_by: agent.id,
          });
          artifactId = artData?.id || null;
        } catch {}

        // Mark task done
        const taskCost = getTokenCost(state.budget.tokens, state.agentConfig?.model as string || 'claude-sonnet-4-6');
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
          status: 'done',
          completed_at: new Date().toISOString(),
          result: { summary: resultSummary },
          tokens_used: state.budget.tokens,
          cost_usd: taskCost,
          artifact_ids: artifactId ? [artifactId] : [],
          updated_at: new Date().toISOString(),
        });
        state.tasksCompletedSinceCheckin++;
        state.interval = MIN_INTERVAL; // fast next tick to claim new work
        log.info(`Auto-completed task ${(params.task_id as string).substring(0, 8)} (${result.numTurns} turns, $${result.costUsd.toFixed(4)})`);
        return 'auto_completed';
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
