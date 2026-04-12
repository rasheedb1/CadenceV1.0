/**
 * SENSE phase — gather context from DB
 * Ported from event-loop.js lines 120-193 + new queries for migration.
 */

import type { AgentConfig, LoopState, SenseContext, AgentRow, SkillDef } from '../types.js';
import { sbGet, sbRpc } from '../supabase-client.js';
import { clearMcpCache } from '../sdk-runner.js';
import type { Logger } from '../utils/logger.js';

const safe = <T>(arr: unknown): T[] => (Array.isArray(arr) ? arr : []);

export async function sense(
  agent: AgentConfig,
  state: LoopState,
  log: Logger,
): Promise<SenseContext> {
  const since = state.lastSenseTime || new Date(Date.now() - 600_000).toISOString();
  const now = new Date().toISOString();
  state.lastSenseTime = now;

  // Refresh agent config every 10 iterations
  if (!state.agentConfig || state.iteration % 10 === 0) {
    const agentRows = await sbGet<Partial<AgentRow>[]>(
      `agents?id=eq.${agent.id}&select=model,capabilities,tier,team,availability,temperature,max_tokens`,
    ).catch(() => []);
    state.agentConfig = Array.isArray(agentRows) && agentRows[0] ? agentRows[0] : null;
    // Sync capabilities back to config — and invalidate MCP cache if changed
    if (state.agentConfig?.capabilities) {
      const newCaps = state.agentConfig.capabilities as string[];
      const oldCaps = agent.capabilities || [];
      if (JSON.stringify(newCaps.sort()) !== JSON.stringify(oldCaps.sort())) {
        log.info(`Capabilities changed: [${oldCaps}] → [${newCaps}] — rebuilding MCP tools`);
        clearMcpCache(agent.id);
      }
      agent.capabilities = newCaps;
    }
  }

  const capabilities = state.agentConfig?.capabilities || agent.capabilities || [];

  // --- Core queries (parallel) — exact port from event-loop.js ---
  const [
    inbox,
    myTasksV2,
    availableTasksV2,
    myTasksLegacy,
    availableTasksLegacy,
    budget,
    heartbeats,
    // New queries for migration:
    unreadMessages,
    projectContext,
  ] = await Promise.all([
    sbGet(
      `agent_messages?to_agent_id=eq.${agent.id}&created_at=gt.${since}&order=created_at.desc&limit=5&select=id,from_agent_id,content,created_at,message_type,thread_id`,
    ).catch(() => []),
    sbGet(
      `agent_tasks_v2?assigned_agent_id=eq.${agent.id}&status=in.(claimed,in_progress)&order=priority.asc&limit=5&select=id,title,description,task_type,status,priority,parent_result_summary,context_summary,review_iteration,depends_on,project_id`,
    ).catch(() => []),
    sbGet(
      `agent_tasks_v2?status=eq.ready&assigned_agent_id=is.null&org_id=eq.${agent.orgId}&order=priority.asc&limit=5&select=id,title,description,task_type,priority,required_capabilities,parent_result_summary,context_summary,project_id`,
    ).catch(() => []),
    sbGet(
      `project_board?assignee_agent_id=eq.${agent.id}&status=in.(claimed,working)&order=priority.desc&limit=5&select=id,title,content,status,priority`,
    ).catch(() => []),
    sbGet(
      `project_board?status=eq.available&entry_type=eq.task&org_id=eq.${agent.orgId}&order=priority.desc&limit=5&select=id,title,content,priority`,
    ).catch(() => []),
    sbGet(
      `agent_budgets?agent_id=eq.${agent.id}&limit=1&select=tokens_used,max_tokens,cost_usd,max_cost_usd,iterations_used,max_iterations`,
    ).catch(() => []),
    sbGet(
      `agent_heartbeats?last_seen=gt.${new Date(Date.now() - 300_000).toISOString()}&select=agent_id,status,current_task`,
    ).catch(() => []),
    // Unread messages (to me or broadcast, not yet read by me)
    sbGet(
      `agent_messages?or=(to_agent_id.eq.${agent.id},to_agent_id.is.null)&order=created_at.desc&limit=10&select=id,from_agent_id,to_agent_id,content,message_type,thread_id,read_by,project_id,created_at`,
    ).catch(() => []),
    // Project context view
    sbGet(
      `project_context?org_id=eq.${agent.orgId}&limit=3`,
    ).catch(() => []),
  ]);

  // Filter unread messages (not yet in read_by)
  const unread = safe(unreadMessages).filter(
    (m: any) => !m.read_by || !m.read_by.includes(agent.id),
  );

  // Mark unread messages as read
  if (unread.length > 0) {
    sbRpc('mark_messages_read', {
      p_agent_id: agent.id,
      p_message_ids: unread.map((m: any) => m.id),
    }).catch(() => {});
  }

  // --- Load agent skills (every 10 ticks or first time) ---
  let skills: SkillDef[] = state.cachedSkills || [];
  if (!state.cachedSkills || state.iteration % 10 === 0) {
    try {
      const skillRows = await sbGet<Array<{ skill_name: string; enabled: boolean }>>(
        `agent_skills?agent_id=eq.${agent.id}&enabled=eq.true&select=skill_name`,
      );
      const skillNames = safe<{ skill_name: string }>(skillRows).map(s => s.skill_name);
      if (skillNames.length > 0) {
        const nameFilter = skillNames.map(n => `name.eq.${n}`).join(',');
        const defs = await sbGet<SkillDef[]>(
          `skill_registry?or=(${nameFilter})&select=name,display_name,description,skill_definition,category`,
        );
        skills = safe<SkillDef>(defs);
        state.cachedSkills = skills;
      } else {
        skills = [];
        state.cachedSkills = [];
      }
    } catch {
      // Keep cached skills on error
    }
  }

  // --- Memory queries (parallel, only if agent has tasks or every 5 ticks) ---
  const myV2 = safe(myTasksV2);
  let latestArtifact = null;
  let latestReview = null;
  let knowledge: any[] = [];
  let pendingFeedback: any[] = [];

  if (myV2.length > 0 || state.iteration % 5 === 0) {
    const taskId = (myV2[0] as any)?.id;
    const [artifactRes, reviewRes, knowledgeRes, feedbackRes] = await Promise.all([
      taskId
        ? sbGet(`agent_artifacts?task_id=eq.${taskId}&order=version.desc&limit=1&select=id,filename,version,content_summary,artifact_type`).catch(() => [])
        : [],
      taskId
        ? sbGet(`agent_reviews?task_id=eq.${taskId}&order=iteration.desc&limit=1&select=score,passed,issues,suggestions,iteration`).catch(() => [])
        : [],
      sbGet(
        `agent_knowledge?or=(agent_id.eq.${agent.id},agent_id.is.null)&org_id=eq.${agent.orgId}&valid_until=is.null&order=importance.desc&limit=5&select=content,category,importance`,
      ).catch(() => []),
      sbGet(
        `agent_checkins?agent_id=eq.${agent.id}&status=eq.rejected&order=created_at.desc&limit=2&select=feedback,summary`,
      ).catch(() => []),
    ]);
    latestArtifact = safe(artifactRes)[0] || null;
    latestReview = safe(reviewRes)[0] || null;
    knowledge = safe(knowledgeRes);
    pendingFeedback = safe(feedbackRes).filter((f: any) => f.feedback);
  }

  // Update currentTaskId / currentProjectId on config
  if (myV2.length > 0) {
    agent.currentTaskId = (myV2[0] as any).id;
    agent.currentProjectId = (myV2[0] as any).project_id || null;
  } else {
    agent.currentTaskId = null;
    agent.currentProjectId = null;
  }

  const myTasks = [...myV2, ...safe(myTasksLegacy)] as any[];
  const availableTasks = [...safe(availableTasksV2), ...safe(availableTasksLegacy)] as any[];

  return {
    inbox: safe(inbox),
    myTasks,
    availableTasks,
    budget: Array.isArray(budget) && (budget as any[])[0] ? (budget as any[])[0] : null,
    onlineAgents: safe(heartbeats),
    capabilities: capabilities as string[],
    isV2Available: safe(availableTasksV2).length > 0,
    latestArtifact,
    latestReview,
    knowledge,
    pendingFeedback,
    unreadMessages: unread as any[],
    projectContext: safe(projectContext),
    skills,
  };
}
