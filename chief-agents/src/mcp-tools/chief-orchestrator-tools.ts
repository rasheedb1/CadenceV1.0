/**
 * Chief Orchestrator Tools — MCP tools for Chief (the orchestrator agent).
 * These replace the inline gwTools from openclaw/bridge/server.js.
 * Chief uses these via the Claude Agent SDK instead of manual API loops.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { sbGet, sbPost, sbPostReturn, sbPatch, sbRpc, getSupabaseUrl, getSupabaseHeaders } from '../supabase-client.js';

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
                enrichedInstruction = `USER REQUEST:\n${instruction.substring(0, 2000)}\n\nEXECUTE THIS SKILL: "${best.display_name}"\n${best.skill_definition}\n\nIMPORTANT: The user data is in USER REQUEST above. Map it directly to the skill params and call call_skill. Do NOT re-ask for data that is already provided above.`;
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

        const taskRows = await sbPostReturn<any[]>('agent_tasks_v2', {
          org_id: orgId,
          title: instruction.substring(0, 120),
          description: enrichedInstruction,
          task_type: taskType,
          required_capabilities: caps,
          assigned_agent_id: agent.id,
          assigned_at: new Date().toISOString(),
          status: 'claimed',
          priority: priority || 10,
          created_by: 'chief_delegator',
        });
        const taskId = Array.isArray(taskRows) && taskRows[0] ? taskRows[0].id : null;
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
    'Pregunta rápida a un agente sin crear tarea formal. Para "¿qué opina X?", "pregúntale a X...".',
    {
      agent_name: z.string().describe('Nombre del agente'),
      message: z.string().describe('La pregunta o mensaje'),
    },
    async ({ agent_name, message }) => {
      try {
        const agent = await resolveAgent(orgId, agent_name);
        if (!agent) return { content: [{ type: 'text' as const, text: `Agente "${agent_name}" no encontrado.` }] };
        // Send via agent_messages (SENSE phase reads inbox)
        await sbPost('agent_messages', {
          org_id: orgId, to_agent_id: agent.id, role: 'user', content: message,
          message_type: 'chat', metadata: { from: 'chief', requires_response: true },
        });
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
          const res = await sbPostReturn<any[]>('agents', {
            org_id: orgId, name, role: role || 'custom', description,
            soul_md: soulMd, model: model || 'claude-sonnet-4-6',
            tier: defaults.tier, team: defaults.team, capabilities: defaults.caps, status: 'active',
          });
          const created = Array.isArray(res) && res[0] ? res[0] : null;
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
        // Call bridge endpoint which has the LLM graph generation logic
        const res = await fetch(`${BRIDGE_URL}/api/create-workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: orgId, description: desc, name: wfName, activate: activate || false }),
        });
        const data = await res.json();
        if (data?.success) {
          return { content: [{ type: 'text' as const, text: data.message || `Workflow "${wfName}" creado.` }] };
        }
        // Fallback: call the bridge tool handler directly via the existing mechanism
        const result = await sbFetch(`${BRIDGE_URL}/api/tool-call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: 'crear_workflow_agente', args: { org_id: orgId, description: desc, name: wfName, activate: activate || false } }),
        });
        return { content: [{ type: 'text' as const, text: result?.message || JSON.stringify(result).substring(0, 2000) }] };
      } catch (e: any) {
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
