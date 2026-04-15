/**
 * Chief Orchestrator Tools — MCP tools for Chief (the orchestrator agent).
 * These replace the inline gwTools from openclaw/bridge/server.js.
 * Chief uses these via the Claude Agent SDK instead of manual API loops.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { sbGet, sbPost, sbPostReturn, sbPatch, sbRpc, getSupabaseUrl, getSupabaseHeaders } from '../supabase-client.js';
import Anthropic from '@anthropic-ai/sdk';

const SB_URL = getSupabaseUrl();
const CHIEF_AGENTS_URL = process.env.CHIEF_AGENTS_URL || 'https://chief-agents-production.up.railway.app';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback';
const BRIDGE_URL = process.env.BRIDGE_URL || process.env.BRIDGE_PUBLIC_URL || 'https://twilio-bridge-production-241b.up.railway.app';

// Helper: fetch with Supabase headers
async function sbFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${SB_URL}/rest/v1/${path}`;
  const headers = { ...getSupabaseHeaders(), ...(opts.headers || {}) };
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text as any; }
}

// Helper: resolve agent by name
async function resolveAgent(orgId: string, nameOrId: string): Promise<{ id: string; name: string; role: string; capabilities: string[]; status: string } | null> {
  // Try by ID first
  if (nameOrId.includes('-')) {
    const rows = await sbGet<any[]>(`agents?id=eq.${nameOrId}&select=id,name,role,capabilities,status`).catch(() => []);
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  // By name
  const rows = await sbGet<any[]>(`agents?org_id=eq.${orgId}&name=ilike.*${encodeURIComponent(nameOrId)}*&status=neq.destroyed&select=id,name,role,capabilities,status&limit=1`).catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export function buildChiefOrchestratorServer(orgId: string) {

  // ================================================================
  // ROUTING TOOLS
  // ================================================================

  const resolverSkill = tool(
    'resolver_skill',
    'Busca un skill en el registry que coincida con lo que el usuario quiere. Retorna el mejor skill + qué agente lo tiene asignado. Usa ANTES de delegar_tarea.',
    {
      query: z.string().describe('Lo que el usuario quiere, en lenguaje natural'),
    },
    async ({ query: skillQuery }) => {
      try {
        const words = skillQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const orClauses = words.map(w => `display_name.ilike.*${w}*,description.ilike.*${w}*,name.ilike.*${w}*`).join(',');
        const skills = await sbGet<any[]>(`skill_registry?or=(${orClauses})&limit=5&select=name,display_name,description,skill_definition,category`);
        if (!Array.isArray(skills) || skills.length === 0) {
          return { content: [{ type: 'text' as const, text: `No encontré un skill que coincida con "${skillQuery}". Puedes crear uno con crear_skill o delegarlo como tarea general con delegar_tarea.` }] };
        }
        const results = [];
        for (const skill of skills) {
          const assignments = await sbGet<any[]>(`agent_skills?skill_name=eq.${skill.name}&enabled=eq.true&select=agent_id`).catch(() => []);
          let agentNames: string[] = [];
          if (Array.isArray(assignments) && assignments.length > 0) {
            const ids = assignments.map((a: any) => a.agent_id);
            const agents = await sbGet<any[]>(`agents?id=in.(${ids.join(',')})&org_id=eq.${orgId}&select=id,name`).catch(() => []);
            agentNames = Array.isArray(agents) ? agents.map((a: any) => a.name) : [];
          }
          results.push({ ...skill, agents: agentNames });
        }
        const best = results.find(r => r.agents.length > 0) || results[0];
        const text = `Skill encontrado: ${best.display_name}\n${best.description}\nAgentes: ${best.agents.length > 0 ? best.agents.join(', ') : 'ninguno'}\n${best.agents.length > 0 ? `Usa delegar_tarea para enviar a ${best.agents[0]}.` : 'No hay agente con este skill asignado.'}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error buscando skill: ${e.message}` }] };
      }
    },
  );

  const delegarTarea = tool(
    'delegar_tarea',
    'Delega una tarea ONE-TIME a un agente. Se ejecuta UNA sola vez, ahora. Usa para acciones inmediatas. NO uses para tareas recurrentes — esas van en crear_workflow_agente.',
    {
      agent_name: z.string().describe('Nombre del agente destino'),
      instruction: z.string().describe('La tarea en lenguaje natural'),
      priority: z.number().optional().describe('0=urgente, 10=normal, 50=bajo'),
    },
    async ({ agent_name, instruction, priority }) => {
      try {
        const agent = await resolveAgent(orgId, agent_name);
        if (!agent) return { content: [{ type: 'text' as const, text: `Agente "${agent_name}" no encontrado.` }] };

        // CHECK FOR FOLLOW-UP: if agent has a recent completed task with a session_id,
        // resume that session instead of creating a new task. This gives the agent full
        // conversation memory (like chatting with Claude normally).
        try {
          const lastTask = await sbGet<any[]>(
            `agent_tasks_v2?assigned_agent_id=eq.${agent.id}&status=eq.done&org_id=eq.${orgId}&order=completed_at.desc&limit=1&select=id,title,session_id,completed_at,context_summary`
          ).catch(() => []);
          if (Array.isArray(lastTask) && lastTask[0]?.session_id) {
            const age = Date.now() - new Date(lastTask[0].completed_at || 0).getTime();
            if (age < 30 * 60 * 1000) {
              // FOLLOW-UP: Reopen the task with the user's new message and resume session
              const taskId = lastTask[0].id;
              let pad: any = {};
              try { pad = JSON.parse(lastTask[0].context_summary || '{}'); } catch { pad = {}; }
              if (!pad.conversation) pad.conversation = [];
              pad.conversation.push({ role: 'user', ts: new Date().toISOString(), content: instruction.substring(0, 1000) });
              pad.last_action = 'user_replied';

              await sbPatch(`agent_tasks_v2?id=eq.${taskId}`, {
                status: 'in_progress',
                context_summary: JSON.stringify(pad),
                updated_at: new Date().toISOString(),
              });

              // Execute with session resumption
              fetch(`${CHIEF_AGENTS_URL}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_id: agent.id, task_id: taskId }),
              }).catch(() => {});

              console.log(`[delegar_tarea] FOLLOW-UP: resumed session ${lastTask[0].session_id.substring(0, 12)} for ${agent.name}`);
              return { content: [{ type: 'text' as const, text: `Follow-up enviado a ${agent.name}. Te llegará la respuesta por WhatsApp.` }] };
            }
          }
        } catch {}

        // NEW TASK: no recent session to resume
        // Skill enrichment
        let enrichedInstruction = instruction;
        try {
          const agentSkills = await sbGet<any[]>(`agent_skills?agent_id=eq.${agent.id}&enabled=eq.true&select=skill_name`).catch(() => []);
          if (Array.isArray(agentSkills) && agentSkills.length > 0) {
            const names = agentSkills.map((s: any) => s.skill_name);
            const orFilter = names.map((n: string) => `name.eq.${n}`).join(',');
            const defs = await sbGet<any[]>(`skill_registry?or=(${orFilter})&select=name,display_name,skill_definition`).catch(() => []);
            if (Array.isArray(defs) && defs.length > 0) {
              const instrLower = instruction.toLowerCase();
              const scored = defs.map((s: any) => {
                const words = `${s.display_name} ${s.name}`.toLowerCase().split(/[\s_-]+/);
                const matches = words.filter((w: string) => w.length > 3 && instrLower.includes(w)).length;
                return { ...s, score: matches };
              }).filter((s: any) => s.score > 0).sort((a: any, b: any) => b.score - a.score);
              if (scored.length > 0) {
                const best = scored[0];
                enrichedInstruction = `USER REQUEST:\n${instruction.substring(0, 2000)}\n\nMATCHING SKILL: "${best.display_name}"\n${best.skill_definition}\n\nRULES:\n- Check which REQUIRED params the user provided vs which are MISSING.\n- If the user provided ALL required params → execute immediately with call_skill.\n- If ANY required params are MISSING → ask the user via ask_human_via_whatsapp BEFORE executing. List exactly which params you need.\n- NEVER invent or estimate params the user didn't provide. Always ask.`;
              }
            }
          }
        } catch {}

        // Create task
        const caps = agent.capabilities || [];
        let taskType = 'general';
        if (caps.includes('code')) taskType = 'code';
        else if (caps.includes('research')) taskType = 'research';
        else if (caps.includes('inbox')) taskType = 'inbox';

        const taskRows = await sbPostReturn<any>('agent_tasks_v2', {
          org_id: orgId,
          title: instruction.substring(0, 120),
          description: enrichedInstruction,
          task_type: taskType,
          required_capabilities: caps,
          assigned_agent_id: agent.id,
          assigned_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          status: 'in_progress', // in_progress (not claimed) so event loop doesn't also pick it up
          priority: priority || 10,
          created_by: 'chief_delegator',
        });
        const taskId = taskRows?.id || (Array.isArray(taskRows) && taskRows[0]?.id) || null;
        if (!taskId) return { content: [{ type: 'text' as const, text: 'Error creando la tarea.' }] };

        // Log message
        sbPost('agent_messages', {
          org_id: orgId, to_agent_id: agent.id, role: 'user', content: instruction,
          message_type: 'task', metadata: { task_id: taskId, delegated_by: 'chief' },
        }).catch(() => {});

        // Direct execution (fire-and-forget)
        fetch(`${CHIEF_AGENTS_URL}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agent.id, task_id: taskId }),
        }).catch(() => {});

        return { content: [{ type: 'text' as const, text: `Tarea asignada a ${agent.name}. Te llegará el resultado por WhatsApp.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error delegando: ${e.message}` }] };
      }
    },
  );

  const consultarAgente = tool(
    'consultar_agente',
    'Pregunta a un agente. Crea una tarea y la ejecuta inmediatamente. Usa para "pregúntale a X", "consulta con X". Funciona igual que delegar_tarea pero para preguntas.',
    {
      agent_name: z.string().describe('Nombre del agente'),
      message: z.string().describe('La pregunta o mensaje'),
    },
    async ({ agent_name, message }) => {
      try {
        const agent = await resolveAgent(orgId, agent_name);
        if (!agent) return { content: [{ type: 'text' as const, text: `Agente "${agent_name}" no encontrado.` }] };

        // CHECK FOR FOLLOW-UP: resume session if agent has recent task
        try {
          const lastTask = await sbGet<any[]>(
            `agent_tasks_v2?assigned_agent_id=eq.${agent.id}&status=eq.done&org_id=eq.${orgId}&order=completed_at.desc&limit=1&select=id,session_id,completed_at,context_summary`
          ).catch(() => []);
          if (Array.isArray(lastTask) && lastTask[0]?.session_id) {
            const age = Date.now() - new Date(lastTask[0].completed_at || 0).getTime();
            if (age < 30 * 60 * 1000) {
              const taskId = lastTask[0].id;
              let pad: any = {};
              try { pad = JSON.parse(lastTask[0].context_summary || '{}'); } catch { pad = {}; }
              if (!pad.conversation) pad.conversation = [];
              pad.conversation.push({ role: 'user', ts: new Date().toISOString(), content: message.substring(0, 1000) });
              pad.last_action = 'user_replied';
              await sbPatch(`agent_tasks_v2?id=eq.${taskId}`, {
                status: 'in_progress', context_summary: JSON.stringify(pad), updated_at: new Date().toISOString(),
              });
              fetch(`${CHIEF_AGENTS_URL}/execute`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_id: agent.id, task_id: taskId }),
              }).catch(() => {});
              console.log(`[consultar_agente] FOLLOW-UP: resumed session for ${agent.name}`);
              return { content: [{ type: 'text' as const, text: `Follow-up enviado a ${agent.name}. Te llegará la respuesta por WhatsApp.` }] };
            }
          }
        } catch {}

        // NEW TASK: no recent session to resume
        const taskRows = await sbPostReturn<any>('agent_tasks_v2', {
          org_id: orgId,
          title: message.substring(0, 120),
          description: message,
          task_type: 'general',
          required_capabilities: agent.capabilities || [],
          assigned_agent_id: agent.id,
          assigned_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          status: 'in_progress', // in_progress so event loop doesn't also pick it up
          priority: 10,
          created_by: 'chief_delegator',
        });
        const taskId = taskRows?.id || null;
        if (!taskId) {
          console.error('[consultar_agente] Task creation failed:', JSON.stringify(taskRows));
          return { content: [{ type: 'text' as const, text: `Error creando la consulta para ${agent.name}.` }] };
        }

        // Direct execution (fire-and-forget)
        fetch(`${CHIEF_AGENTS_URL}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agent.id, task_id: taskId }),
        }).catch(() => {});

        return { content: [{ type: 'text' as const, text: `Consulta enviada a ${agent.name}. Te llegará la respuesta por WhatsApp.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error consultando: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // TEAM MANAGEMENT TOOLS
  // ================================================================

  const gestionarAgentes = tool(
    'gestionar_agentes',
    'Crea, lista o elimina agentes AI. Al crear: infiere capabilities, team y tier del rol. No preguntes al usuario estos campos.',
    {
      operation: z.enum(['create', 'list', 'delete']).describe('Operación'),
      name: z.string().optional().describe('Nombre del agente (para create)'),
      role: z.string().optional().describe('Rol: sales, developer, assistant, qa, marketing, researcher, pm, custom'),
      description: z.string().optional().describe('Descripción del agente'),
      agent_id: z.string().optional().describe('ID del agente (para delete)'),
      model: z.string().optional().describe('Modelo LLM (default: claude-sonnet-4-6)'),
    },
    async ({ operation, name, role, description, agent_id, model }) => {
      try {
        if (operation === 'list') {
          const agents = await sbGet<any[]>(`agents?org_id=eq.${orgId}&status=neq.destroyed&select=id,name,role,status,team,tier,model,capabilities`);
          return { content: [{ type: 'text' as const, text: JSON.stringify(Array.isArray(agents) ? agents : [], null, 2) }] };
        }
        if (operation === 'delete' && agent_id) {
          await sbPatch(`agents?id=eq.${agent_id}`, { status: 'destroyed', updated_at: new Date().toISOString() });
          return { content: [{ type: 'text' as const, text: 'Agente eliminado.' }] };
        }
        if (operation === 'create' && name) {
          const ROLE_DEFAULTS: Record<string, { caps: string[]; team: string; tier: string }> = {
            sales: { caps: ['outreach', 'research', 'writing'], team: 'sales', tier: 'worker' },
            developer: { caps: ['code', 'ops', 'data'], team: 'product', tier: 'worker' },
            assistant: { caps: ['inbox', 'calendar', 'research', 'writing'], team: 'ops', tier: 'worker' },
            qa: { caps: ['research', 'browser'], team: 'product', tier: 'worker' },
            marketing: { caps: ['writing', 'research', 'outreach'], team: 'marketing', tier: 'worker' },
            researcher: { caps: ['research', 'writing', 'browser'], team: 'product', tier: 'worker' },
            pm: { caps: ['research', 'writing', 'calendar', 'sheets'], team: 'product', tier: 'worker' },
          };
          const defaults = ROLE_DEFAULTS[role || 'custom'] || { caps: [], team: 'general', tier: 'worker' };
          const soulMd = `# ${name}\n\n## Identidad\nEres **${name}**, un agente AI con el rol de **${role || 'custom'}**.\n${description ? `\n${description}\n` : ''}\n## Reglas\n- Directo y eficiente.\n- Reporta resultados concisos.\n- Nunca expongas tokens o claves internas.`;
          const res = await sbPostReturn<any>('agents', {
            org_id: orgId, name, role: role || 'custom', description,
            soul_md: soulMd, model: model || 'claude-sonnet-4-6',
            tier: defaults.tier, team: defaults.team, capabilities: defaults.caps, status: 'active',
          });
          const created = res?.id ? res : null;
          return { content: [{ type: 'text' as const, text: created ? `Agente "${name}" creado. Team: ${defaults.team}, Tier: ${defaults.tier}, Capabilities: ${defaults.caps.join(', ')}` : 'Error creando agente.' }] };
        }
        return { content: [{ type: 'text' as const, text: 'Operación no válida.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const cambiarConfigAgente = tool(
    'cambiar_config_agente',
    'Actualiza configuración de un agente (modelo, capabilities, team, tier).',
    {
      agent_name: z.string().describe('Nombre del agente'),
      updates: z.record(z.any()).describe('Campos a actualizar: model, capabilities, team, tier, temperature'),
    },
    async ({ agent_name, updates }) => {
      try {
        const agent = await resolveAgent(orgId, agent_name);
        if (!agent) return { content: [{ type: 'text' as const, text: `Agente "${agent_name}" no encontrado.` }] };
        await sbPatch(`agents?id=eq.${agent.id}`, { ...updates, updated_at: new Date().toISOString() });
        return { content: [{ type: 'text' as const, text: `Configuración de ${agent.name} actualizada: ${JSON.stringify(updates)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // MONITORING TOOLS
  // ================================================================

  const verEquipo = tool(
    'ver_equipo',
    'Dashboard de estado del equipo: quién está disponible, trabajando, bloqueado.',
    {},
    async () => {
      try {
        const standup = await sbGet<any[]>('agent_standup');
        if (!Array.isArray(standup) || standup.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No hay agentes activos.' }] };
        }
        const lines = standup.map((a: any) => {
          const icon = a.availability === 'working' ? '🔵' : a.availability === 'blocked' ? '🔴' : '🟢';
          return `${icon} ${a.agent_name} (${a.agent_role}) — ${a.tasks_done_24h || 0} completadas, ${a.tasks_in_progress || 0} en progreso, ${a.tasks_backlog || 0} backlog${a.tasks_blocked ? `, ⚠️ ${a.tasks_blocked} bloqueadas` : ''}`;
        });
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const verTareaAgente = tool(
    'ver_tarea_agente',
    'Consulta el estado/resultado de la última tarea de un agente.',
    {
      agent_name: z.string().describe('Nombre del agente'),
    },
    async ({ agent_name }) => {
      try {
        const agent = await resolveAgent(orgId, agent_name);
        if (!agent) return { content: [{ type: 'text' as const, text: `Agente "${agent_name}" no encontrado.` }] };
        const tasks = await sbGet<any[]>(`agent_tasks_v2?assigned_agent_id=eq.${agent.id}&order=created_at.desc&limit=1&select=id,title,status,description,created_at`);
        if (!Array.isArray(tasks) || tasks.length === 0) {
          return { content: [{ type: 'text' as const, text: `No hay tareas para ${agent.name}.` }] };
        }
        const t = tasks[0];
        return { content: [{ type: 'text' as const, text: `Tarea: ${t.title}\nEstado: ${t.status}\nCreada: ${t.created_at}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // WORKFLOW TOOLS
  // ================================================================

  const crearWorkflowAgente = tool(
    'crear_workflow_agente',
    'Crea un workflow automatizado RECURRENTE o multi-paso. Usa SIEMPRE que el usuario pida algo periódico ("todos los días", "cada semana", "diario", "rutina") o un proceso multi-paso. NUNCA delegues tareas recurrentes con delegar_tarea.',
    {
      description: z.string().describe('Descripción del workflow en lenguaje natural. Incluye: qué agentes, qué skills, condiciones, schedule.'),
      name: z.string().describe('Nombre corto del workflow'),
      activate: z.boolean().optional().describe('Activar inmediatamente (default: false, guarda como borrador)'),
    },
    async ({ description: desc, name: wfName, activate }) => {
      try {
        // 1. Load agents + their skills — build lookup map
        const agents = await sbGet<any[]>(`agents?org_id=eq.${orgId}&status=eq.active&select=id,name,role,capabilities`).catch(() => []);
        if (!Array.isArray(agents) || agents.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No hay agentes activos.' }] };
        }
        // Build name→id lookup (case-insensitive)
        const agentLookup = new Map<string, { id: string; name: string }>();
        for (const ag of agents) {
          agentLookup.set(ag.name.toLowerCase(), { id: ag.id, name: ag.name });
          // Also map by first name for partial matches
          const firstName = ag.name.split(/[\s(]/)[0].toLowerCase();
          if (!agentLookup.has(firstName)) agentLookup.set(firstName, { id: ag.id, name: ag.name });
        }

        const agentMap: Record<string, any> = {};
        for (const ag of agents) {
          const skills = await sbGet<any[]>(`agent_skills?agent_id=eq.${ag.id}&enabled=eq.true&select=skill_name`).catch(() => []);
          const names = Array.isArray(skills) ? skills.map((s: any) => s.skill_name) : [];
          agentMap[ag.name] = { id: ag.id, role: ag.role, capabilities: ag.capabilities, skills: names };
        }
        // Context for Claude — emphasize using UUIDs
        const agentContext = Object.entries(agentMap).map(([name, data]: [string, any]) =>
          `- ${name} (id="${data.id}", role=${data.role}): capabilities=[${data.capabilities.join(',')}], skills=[${data.skills.join(',')}]`
        ).join('\n');

        // 2. Call Claude to generate the graph
        const client = new Anthropic();
        const graphPrompt = `Generate a workflow graph JSON for this request:\n\n"${desc}"\n\nAVAILABLE AGENTS (use the exact id values for agentId):\n${agentContext}\n\nAVAILABLE NODE TYPES:\n- trigger_scheduled: {cron, timezone, label}\n- trigger_manual: {label}\n- action_agent_task: {agentId:"USE-UUID-FROM-LIST", agentName:"name", instruction:"detailed instruction", maxBudgetUsd:1}\n- action_notify_human: {channel:"whatsapp", message:"...", label}\n- condition_task_result: {field, operator:"=="|">"|"<"|"is_not_empty"|"is_empty", value, label}\n- delay_wait: {duration:1, unit:"hours"|"days", label}\n\nCRITICAL RULES:\n- agentId MUST be a UUID from the list above (e.g. "2a3fe079-cc50-48e1-9c1d-36c5f9370504"), NOT a name\n- Every node MUST have a "label" in data\n- Position nodes vertically (y increments of 150)\n- Condition nodes have sourceHandle "yes" and "no"\n- Regular nodes have no sourceHandle\n\nReturn ONLY valid JSON: {"nodes":[...],"edges":[...]}`;

        const graphResponse = await client.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 4096, temperature: 0,
          messages: [{ role: 'user', content: graphPrompt }],
        });
        const graphText = graphResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

        // 3. Parse graph
        const jsonMatch = graphText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { content: [{ type: 'text' as const, text: 'Error: no se pudo generar el grafo del workflow.' }] };
        const graph = JSON.parse(jsonMatch[0]);
        if (!graph.nodes || !graph.edges) {
          return { content: [{ type: 'text' as const, text: 'Error: grafo inválido.' }] };
        }

        // ================================================================
        // 4. VALIDATE & NORMALIZE — fix issues BEFORE saving
        // ================================================================
        const errors: string[] = [];
        for (const node of graph.nodes) {
          const d = node.data || {};

          // Ensure every node has a label
          if (!d.label) d.label = node.type;

          // Validate & resolve agentId for agent nodes
          if (node.type === 'action_agent_task' || node.type === 'action_agent_skill') {
            const rawId = d.agentId || '';
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);

            if (!isUUID) {
              // Resolve name → UUID
              const match = agentLookup.get(rawId.toLowerCase());
              if (match) {
                d.agentId = match.id;
                d.agentName = match.name;
                console.log(`[workflow-validate] Resolved "${rawId}" → ${match.id} (${match.name})`);
              } else {
                errors.push(`Agente "${rawId}" no encontrado`);
              }
            } else {
              // Verify UUID exists
              const exists = agents.find((a: any) => a.id === rawId);
              if (!exists) errors.push(`Agent ID ${rawId} no existe`);
            }

            // Ensure instruction exists for agent_task nodes
            if (node.type === 'action_agent_task' && !d.instruction) {
              errors.push(`Nodo "${d.label}" no tiene instrucción`);
            }
          }

          // Validate edges reference existing nodes
          node.data = d;
        }
        const nodeIds = new Set(graph.nodes.map((n: any) => n.id));
        for (const edge of graph.edges) {
          if (!nodeIds.has(edge.source)) errors.push(`Edge referencia nodo inexistente: ${edge.source}`);
          if (!nodeIds.has(edge.target)) errors.push(`Edge referencia nodo inexistente: ${edge.target}`);
        }

        if (errors.length > 0) {
          return { content: [{ type: 'text' as const, text: `Error validando workflow:\n${errors.join('\n')}` }] };
        }

        // 5. Determine trigger type
        const triggerNode = graph.nodes.find((n: any) => n.type?.startsWith('trigger_'));
        const triggerType = triggerNode?.type === 'trigger_scheduled' ? 'scheduled' : 'manual';
        const triggerConfig = triggerType === 'scheduled' ? {
          cron: triggerNode?.data?.cron || '0 9 * * 1-5',
          timezone: triggerNode?.data?.timezone || 'America/Mexico_City',
        } : {};

        // 6. Get owner_id
        const sess = await sbGet<any[]>(`chief_sessions?org_id=eq.${orgId}&select=user_id&limit=1`).catch(() => []);
        let ownerId = Array.isArray(sess) && sess[0] ? sess[0].user_id : null;
        if (!ownerId) {
          const members = await sbGet<any[]>(`organization_members?org_id=eq.${orgId}&select=user_id&limit=1`).catch(() => []);
          ownerId = Array.isArray(members) && members[0] ? members[0].user_id : '00000000-0000-0000-0000-000000000000';
        }

        // 7. Save validated workflow
        const wfRows = await sbPostReturn<any>('workflows', {
          name: wfName, owner_id: ownerId, org_id: orgId,
          workflow_type: 'agent', status: activate ? 'active' : 'draft',
          trigger_type: triggerType, trigger_config: triggerConfig, graph_json: graph,
        });
        const workflow = wfRows?.id ? wfRows : null;
        if (!workflow) return { content: [{ type: 'text' as const, text: 'Error guardando workflow.' }] };

        // 8. Build summary
        const nodesSummary = graph.nodes
          .filter((n: any) => !n.type.startsWith('trigger_'))
          .map((n: any, i: number) => `${i + 1}. ${n.data?.label || n.type}${n.data?.agentName ? ` (${n.data.agentName})` : ''}`)
          .join('\n');
        const agentsUsed = [...new Set(graph.nodes.filter((n: any) => n.data?.agentName).map((n: any) => n.data.agentName))];

        const msg = `Workflow "${wfName}" creado (${activate ? 'ACTIVO' : 'borrador'})\n\nPasos:\n${nodesSummary}\n\nAgentes: ${agentsUsed.join(', ')}\n${triggerType === 'scheduled' ? `Schedule: ${triggerConfig.cron} (${triggerConfig.timezone})` : 'Trigger: Manual'}`;
        return { content: [{ type: 'text' as const, text: msg }] };
      } catch (e: any) {
        console.error('[crear_workflow_agente] Error:', e.message, e.stack?.substring(0, 300));
        return { content: [{ type: 'text' as const, text: `Error creando workflow: ${e.message}` }] };
      }
    },
  );

  const listarWorkflows = tool(
    'listar_workflows_agente',
    'Lista todos los workflows de agentes de esta organización.',
    {},
    async () => {
      try {
        const wfs = await sbGet<any[]>(`workflows?org_id=eq.${orgId}&workflow_type=eq.agent&select=id,name,status,trigger_type,trigger_config,created_at&order=created_at.desc`);
        if (!Array.isArray(wfs) || wfs.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No hay workflows de agentes.' }] };
        }
        const lines = wfs.map((w: any) => `- ${w.name} [${w.status}] (${w.trigger_type}${w.trigger_config?.cron ? ` — ${w.trigger_config.cron}` : ''})`);
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // KNOWLEDGE & SKILLS TOOLS
  // ================================================================

  const guardarMemoria = tool(
    'guardar_memoria',
    'Guarda un hecho o decisión importante en la memoria de largo plazo de Chief.',
    {
      content: z.string().describe('El hecho o decisión a recordar'),
      category: z.string().optional().describe('Categoría: preference, fact, decision, instruction'),
      importance: z.string().optional().describe('Importancia: critical, high, normal'),
    },
    async ({ content, category, importance }) => {
      try {
        await sbPost('chief_memory', { org_id: orgId, content, category: category || 'fact', importance: importance || 'normal' });
        return { content: [{ type: 'text' as const, text: 'Guardado en memoria.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const crearSkill = tool(
    'crear_skill',
    'Crea un nuevo skill en el registry y opcionalmente lo asigna a un agente.',
    {
      display_name: z.string().describe('Nombre visible del skill'),
      description: z.string().describe('Qué hace el skill'),
      skill_definition: z.string().describe('Instrucciones de ejecución'),
      category: z.string().optional().describe('Categoría: sales, research, operations, etc.'),
      assign_to_agent: z.string().optional().describe('Nombre del agente al que asignar'),
    },
    async ({ display_name, description: desc, skill_definition, category, assign_to_agent }) => {
      try {
        const slug = display_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        const def = skill_definition.toLowerCase();
        const route = def.includes('calls') && def.includes('edge function')
          ? (def.includes('bridge') ? 'bridge' : 'edge_function') : 'agent';
        const rows = await sbPostReturn<any[]>('skill_registry', {
          name: slug, display_name, description: desc, skill_definition,
          category: category || 'sales', route, requires_integrations: [], is_system: false,
        });
        const created = Array.isArray(rows) && rows[0];
        if (!created) return { content: [{ type: 'text' as const, text: 'Error creando skill.' }] };

        if (assign_to_agent) {
          const agent = await resolveAgent(orgId, assign_to_agent);
          if (agent) {
            await sbPost('agent_skills', { agent_id: agent.id, skill_name: slug, enabled: true });
          }
        }
        return { content: [{ type: 'text' as const, text: `Skill "${display_name}" creado${assign_to_agent ? ` y asignado a ${assign_to_agent}` : ''}.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // BACKLOG TOOLS
  // ================================================================

  const verBacklog = tool(
    'ver_backlog',
    'Ve items del backlog de agentes (blockers, decisiones pendientes).',
    {},
    async () => {
      try {
        const items = await sbGet<any[]>(`agent_backlog?org_id=eq.${orgId}&status=eq.open&order=created_at.desc&limit=10&select=id,agent_id,category,title,details,created_at`);
        if (!Array.isArray(items) || items.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Backlog vacío.' }] };
        }
        const lines = items.map((i: any) => `- [${i.category}] ${i.title}: ${(i.details || '').substring(0, 100)}`);
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const resolverBacklog = tool(
    'resolver_backlog',
    'Marca un item del backlog como resuelto.',
    {
      backlog_id: z.string().describe('ID del item'),
      resolution: z.string().optional().describe('Resolución'),
    },
    async ({ backlog_id, resolution }) => {
      try {
        await sbPatch(`agent_backlog?id=eq.${backlog_id}`, { status: 'resolved', resolution, resolved_at: new Date().toISOString() });
        return { content: [{ type: 'text' as const, text: 'Item resuelto.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // SESSION & CONFIG TOOLS
  // ================================================================

  const guardarSesion = tool(
    'guardar_sesion',
    'Guarda la identidad del usuario (WhatsApp → org). Usa cuando el usuario se identifica.',
    {
      whatsapp_number: z.string().describe('Número de WhatsApp'),
      org_id_param: z.string().describe('ID de la organización'),
      user_id: z.string().optional(),
      member_id: z.string().optional(),
      display_name: z.string().optional(),
    },
    async ({ whatsapp_number, org_id_param, user_id, member_id, display_name }) => {
      try {
        await sbPost('chief_sessions', {
          whatsapp_number, org_id: org_id_param,
          user_id: user_id || null, member_id: member_id || null,
          display_name: display_name || null, updated_at: new Date().toISOString(),
        });
        return { content: [{ type: 'text' as const, text: 'Sesión guardada.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const identificarUsuario = tool(
    'identificar_usuario',
    'Busca un usuario por email dentro de una organización.',
    {
      email: z.string().describe('Email del usuario'),
    },
    async ({ email }) => {
      try {
        const result = await sbRpc<any>('search_org_member_by_email', { p_org_id: orgId, p_email: email });
        return { content: [{ type: 'text' as const, text: result ? JSON.stringify(result, null, 2) : 'Usuario no encontrado.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const configurarIdioma = tool(
    'configurar_idioma',
    'Configura el idioma preferido del usuario.',
    {
      language: z.enum(['es', 'en', 'pt']).describe('Idioma'),
      whatsapp_number: z.string().describe('Número WhatsApp del usuario'),
    },
    async ({ language, whatsapp_number }) => {
      try {
        await sbPatch(`chief_sessions?whatsapp_number=eq.${whatsapp_number}`, { language, updated_at: new Date().toISOString() });
        return { content: [{ type: 'text' as const, text: `Idioma configurado: ${language}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // INTEGRATION TOOLS
  // ================================================================

  const conectarGmail = tool(
    'conectar_gmail',
    'Genera un link para que el usuario conecte su Gmail a los agentes (OAuth).',
    {},
    async () => {
      try {
        const res = await fetch(`${BRIDGE_URL}/auth/google/start?org_id=${orgId}`);
        const data = await res.json();
        return { content: [{ type: 'text' as const, text: data?.url ? `Abre este link para conectar Gmail:\n${data.url}` : 'Error generando link.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const conectarSalesforce = tool(
    'conectar_salesforce',
    'Genera un link para conectar Salesforce CRM (OAuth).',
    {},
    async () => {
      try {
        const res = await fetch(`${BRIDGE_URL}/auth/salesforce/start?org_id=${orgId}`);
        const data = await res.json();
        return { content: [{ type: 'text' as const, text: data?.url ? `Abre este link para conectar Salesforce:\n${data.url}` : 'Error generando link.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  const estadoIntegraciones = tool(
    'estado_integraciones',
    'Consulta el estado de las integraciones conectadas (Gmail, Salesforce, LinkedIn, Gong).',
    {},
    async () => {
      try {
        const integrations = await sbGet<any[]>(`agent_integrations?org_id=eq.${orgId}&select=provider,status`);
        if (!Array.isArray(integrations) || integrations.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No hay integraciones conectadas.' }] };
        }
        const lines = integrations.map((i: any) => `- ${i.provider}: ${i.status}`);
        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // NOTIFICATION TOOL
  // ================================================================

  const notificarUsuario = tool(
    'notificar_usuario_whatsapp',
    'Envía un mensaje directo al usuario por WhatsApp.',
    {
      message: z.string().describe('Mensaje a enviar'),
    },
    async ({ message }) => {
      try {
        // Use bridge callback to send via Twilio
        await fetch(CALLBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_name: 'Chief', result: { text: message }, whatsapp_number: null }),
        });
        return { content: [{ type: 'text' as const, text: 'Mensaje enviado.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }] };
      }
    },
  );

  // ================================================================
  // BUILD MCP SERVER
  // ================================================================

  return createSdkMcpServer({
    name: 'chief-orchestrator',
    version: '1.0.0',
    tools: [
      // Routing
      resolverSkill, delegarTarea, consultarAgente,
      // Team Management
      gestionarAgentes, cambiarConfigAgente,
      // Monitoring
      verEquipo, verTareaAgente,
      // Workflows
      crearWorkflowAgente, listarWorkflows,
      // Knowledge & Skills
      guardarMemoria, crearSkill,
      // Backlog
      verBacklog, resolverBacklog,
      // Session & Config
      guardarSesion, identificarUsuario, configurarIdioma,
      // Integrations
      conectarGmail, conectarSalesforce, estadoIntegraciones,
      // Notification
      notificarUsuario,
    ],
  });
}
