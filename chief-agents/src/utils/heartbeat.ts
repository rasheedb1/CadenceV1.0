/**
 * Heartbeat — updates agent_heartbeats table every tick
 * task-hygiene edge function depends on this to detect offline agents.
 */

import { sbUpsert } from '../supabase-client.js';

export async function updateHeartbeat(
  agentId: string,
  action: string,
  taskId: string | null,
  iteration: number,
): Promise<void> {
  await sbUpsert('agent_heartbeats', {
    agent_id: agentId,
    status: action === 'idle' ? 'idle' : 'working',
    current_task: action === 'idle' ? null : (taskId || action),
    last_seen: new Date().toISOString(),
    loop_iteration: iteration,
  }).catch(() => {});
}
