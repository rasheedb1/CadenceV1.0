'use strict';

/**
 * OpenClaw Gateway
 *
 * WebSocket server that receives messages from the Twilio bridge,
 * calls the LLM (GPT-4o) with tool calling for all Chief skills,
 * and returns AI responses back to the bridge.
 *
 * Port: 18789 (configurable via GATEWAY_PORT)
 */

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const { readFileSync } = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const {
  ANTHROPIC_API_KEY,
  SUPABASE_URL = 'https://arupeqczrxmfkcbjwyad.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY,
  GATEWAY_PORT = '18789',
  MAX_HISTORY_MESSAGES = '50',
  CLAUDE_MODEL = 'claude-sonnet-4-6',
} = process.env;

if (!ANTHROPIC_API_KEY) {
  console.error('[gateway] Missing required env var: ANTHROPIC_API_KEY');
  process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[gateway] Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// System prompt — loaded from workspace
// ---------------------------------------------------------------------------
const workspaceDir = path.join(__dirname, '..', 'workspace');
const soulMd = readFileSync(path.join(workspaceDir, 'SOUL.md'), 'utf8');
const agentsMd = readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
const SYSTEM_PROMPT = `${soulMd}\n\n---\n\n${agentsMd}`;

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
function supabaseHeaders(isEdgeFunction = false) {
  const h = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (!isEdgeFunction) {
    h['apikey'] = SUPABASE_SERVICE_ROLE_KEY;
  }
  return h;
}

async function supabaseFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, _status: res.status };
  }
}

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool use — uses input_schema instead of parameters)
// ---------------------------------------------------------------------------
const tools = [
  {
    name: 'buscar_prospectos',
    description: 'Busca prospectos en una empresa usando LinkedIn Sales Navigator (cascada L1→L2→L3). Usa cuando el usuario quiere encontrar contactos o decision-makers en una empresa.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string', description: 'ID de la organización' },
        company_name: { type: 'string', description: 'Nombre de la empresa' },
        company_domain: { type: 'string', description: 'Dominio web de la empresa (mejora precisión)' },
        titles: { type: 'array', items: { type: 'string' }, description: 'Títulos/cargos a buscar, e.g. ["CEO", "VP Sales"]' },
        seniority_levels: { type: 'array', items: { type: 'string' }, description: 'Niveles de seniority, e.g. ["Director", "VP", "C-Suite"]' },
        limit: { type: 'number', description: 'Máximo de resultados (default: 10)' },
        buyer_persona_id: { type: 'string', description: 'UUID del buyer persona (opcional)' },
        account_mapping_company_id: { type: 'string', description: 'UUID de la empresa en account mapping (opcional)' },
      },
      required: ['org_id', 'company_name'],
    },
  },
  {
    name: 'crear_cadencia',
    description: 'Crea una cadencia de outreach con pasos secuenciales (LinkedIn, email, llamadas). Confirma los pasos con el usuario antes de ejecutar.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        name: { type: 'string', description: 'Nombre de la cadencia' },
        description: { type: 'string', description: 'Descripción de la cadencia' },
        created_by: { type: 'string', description: 'UUID del usuario creador (opcional)' },
        steps: {
          type: 'array',
          description: 'Pasos de la cadencia en orden',
          items: {
            type: 'object',
            properties: {
              step_number: { type: 'number', description: 'Número de paso (1, 2, 3...)' },
              step_type: {
                type: 'string',
                enum: ['linkedin_connect', 'linkedin_message', 'linkedin_inmail', 'email', 'manual_task', 'linkedin_like', 'linkedin_comment'],
              },
              delay_days: { type: 'number', description: 'Días de espera desde el paso anterior' },
              template: { type: 'string', description: 'Texto del mensaje. Variables: {{first_name}}, {{last_name}}, {{company}}, {{title}}, {{research}}' },
              subject: { type: 'string', description: 'Asunto (solo para email)' },
            },
            required: ['step_number', 'step_type', 'delay_days', 'template'],
          },
        },
      },
      required: ['org_id', 'name', 'steps'],
    },
  },
  {
    name: 'descubrir_empresas',
    description: 'Descubre empresas que encajan con el ICP (perfil de cliente ideal). Usa cuando el usuario quiere encontrar cuentas target.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        icp_profile_id: { type: 'string', description: 'UUID del perfil ICP (opcional)' },
        criteria: {
          type: 'object',
          description: 'Criterios de búsqueda',
          properties: {
            industries: { type: 'array', items: { type: 'string' }, description: 'Industrias, e.g. ["SaaS", "FinTech"]' },
            employee_range: { type: 'string', description: 'Rango de empleados, e.g. "50-500"' },
            revenue_range: { type: 'string', description: 'Rango de ingresos, e.g. "$10M-$100M"' },
            locations: { type: 'array', items: { type: 'string' }, description: 'Ubicaciones, e.g. ["LATAM", "Mexico"]' },
            technologies: { type: 'array', items: { type: 'string' }, description: 'Tecnologías usadas, e.g. ["Salesforce"]' },
          },
        },
        limit: { type: 'number', description: 'Máximo de resultados (default: 20)' },
        exclude_existing: { type: 'boolean', description: 'Excluir empresas ya en el pipeline (default: true)' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'investigar_empresa',
    description: 'Investiga una empresa a fondo — scraping web, noticias recientes, tech stack, competidores, insights de approach.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        company_name: { type: 'string', description: 'Nombre de la empresa' },
        company_domain: { type: 'string', description: 'Dominio web (mejora la precisión del scraping)' },
        company_linkedin_url: { type: 'string', description: 'URL de LinkedIn de la empresa' },
        depth: { type: 'string', enum: ['quick', 'deep'], description: '"quick" básico, "deep" análisis completo (default: "deep")' },
      },
      required: ['org_id', 'company_name'],
    },
  },
  {
    name: 'enriquecer_prospectos',
    description: 'Enriquece un prospecto con email verificado, teléfono y datos de LinkedIn.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        prospect_id: { type: 'string', description: 'UUID del prospecto en la BD (si ya existe)' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        company: { type: 'string' },
        company_domain: { type: 'string', description: 'Dominio de la empresa (mejora precisión del email)' },
        linkedin_url: { type: 'string' },
        enrich_email: { type: 'boolean', description: 'Buscar email (default: true)' },
        enrich_phone: { type: 'boolean', description: 'Buscar teléfono (default: false)' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'ver_actividad',
    description: 'Consulta el log de actividades — mensajes enviados, respuestas detectadas, conexiones, errores.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        lead_id: { type: 'string', description: 'Filtrar por lead específico (UUID)' },
        cadence_id: { type: 'string', description: 'Filtrar por cadencia específica (UUID)' },
        activity_type: { type: 'string', description: 'Tipo: linkedin_connect, linkedin_message, email_sent, reply_detected, error, etc.' },
        status: { type: 'string', description: 'Estado: success, failed, pending, skipped' },
        date_from: { type: 'string', description: 'Fecha de inicio ISO, e.g. "2026-01-01T00:00:00Z"' },
        limit: { type: 'number', description: 'Máximo de resultados (default: 20)' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'enviar_mensaje',
    description: 'Envía un mensaje directo por LinkedIn a un prospecto o lead. IMPORTANTE: confirmar el mensaje con el usuario antes de enviar.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        sender_account_id: { type: 'string', description: 'UUID de la cuenta de LinkedIn del remitente' },
        recipient_provider_id: { type: 'string', description: 'LinkedIn provider ID del destinatario (formato ACoAAA...)' },
        message: { type: 'string', description: 'Texto del mensaje' },
        message_type: {
          type: 'string',
          enum: ['message', 'inmail', 'connection_request'],
          description: '"message" (requiere conexión), "inmail" (Sales Navigator), "connection_request" (max 300 chars)',
        },
      },
      required: ['org_id', 'sender_account_id', 'recipient_provider_id', 'message', 'message_type'],
    },
  },
  {
    name: 'business_case',
    description: 'Genera un business case personalizado para una empresa objetivo, con propuesta de valor, ROI estimado y próximos pasos.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        company_name: { type: 'string' },
        company_domain: { type: 'string' },
        prospect_name: { type: 'string', description: 'Nombre del contacto principal' },
        prospect_title: { type: 'string', description: 'Título del contacto' },
        pain_points: { type: 'array', items: { type: 'string' }, description: 'Problemas identificados' },
        our_solution: { type: 'string', description: 'Descripción de la solución que ofrecemos' },
        research_data: { type: 'object', description: 'Datos de investigación previa (de investigar_empresa)' },
        language: { type: 'string', enum: ['es', 'en'], description: 'Idioma (default: es)' },
      },
      required: ['org_id', 'company_name'],
    },
  },
  {
    name: 'ver_metricas',
    description: 'Consulta métricas de cadencias — tasas de respuesta, conexión, apertura, conversión, leads activos.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        cadence_id: { type: 'string', description: 'UUID de cadencia específica (si no se pone, muestra todas)' },
        date_from: { type: 'string', description: 'Fecha inicio ISO' },
        date_to: { type: 'string', description: 'Fecha fin ISO' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'gestionar_leads',
    description: 'Operaciones CRUD sobre leads — listar, crear, actualizar estado, asignar a cadencias, remover de cadencias.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        operation: {
          type: 'string',
          enum: ['list', 'create', 'update', 'assign_to_cadence', 'remove_from_cadence'],
          description: 'Operación a ejecutar',
        },
        filters: {
          type: 'object',
          description: 'Filtros para listar leads',
          properties: {
            status: { type: 'string', description: 'new, contacted, replied, qualified, meeting_booked, converted, lost' },
            company: { type: 'string' },
            limit: { type: 'number' },
          },
        },
        lead: {
          type: 'object',
          description: 'Datos del lead a crear',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string' },
            company: { type: 'string' },
            title: { type: 'string' },
            linkedin_url: { type: 'string' },
            provider_id: { type: 'string' },
            status: { type: 'string' },
            source: { type: 'string' },
          },
        },
        lead_id: { type: 'string', description: 'UUID del lead (para update/assign/remove)' },
        lead_ids: { type: 'array', items: { type: 'string' }, description: 'UUIDs de varios leads (para asignación masiva)' },
        updates: { type: 'object', description: 'Campos a actualizar en el lead' },
        cadence_id: { type: 'string', description: 'UUID de la cadencia (para assign/remove)' },
      },
      required: ['org_id', 'operation'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
async function executeTool(name, args) {
  const base = SUPABASE_URL;
  console.log(`[tool] ${name}`, JSON.stringify(args).substring(0, 300));

  try {
    switch (name) {

      case 'buscar_prospectos': {
        return await supabaseFetch(`${base}/functions/v1/cascade-search-company`, {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(args),
        });
      }

      case 'crear_cadencia': {
        const { steps, ...cadenceData } = args;
        const cadence = await supabaseFetch(`${base}/rest/v1/cadences`, {
          method: 'POST',
          headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({ ...cadenceData, status: 'draft' }),
        });
        const createdCadence = Array.isArray(cadence) ? cadence[0] : cadence;
        if (!createdCadence?.id) {
          return { success: false, error: 'No se pudo crear la cadencia', details: cadence };
        }
        const stepRows = steps.map(s => ({ ...s, cadence_id: createdCadence.id, org_id: args.org_id }));
        const createdSteps = await supabaseFetch(`${base}/rest/v1/cadence_steps`, {
          method: 'POST',
          headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(stepRows),
        });
        return {
          success: true,
          cadence_id: createdCadence.id,
          cadence_name: createdCadence.name,
          steps_created: Array.isArray(createdSteps) ? createdSteps.length : 0,
        };
      }

      case 'descubrir_empresas': {
        return await supabaseFetch(`${base}/functions/v1/discover-icp-companies`, {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(args),
        });
      }

      case 'investigar_empresa': {
        return await supabaseFetch(`${base}/functions/v1/company-research`, {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(args),
        });
      }

      case 'enriquecer_prospectos': {
        return await supabaseFetch(`${base}/functions/v1/enrich-prospect`, {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(args),
        });
      }

      case 'ver_actividad': {
        const params = new URLSearchParams({
          select: '*',
          org_id: `eq.${args.org_id}`,
          order: 'created_at.desc',
          limit: String(args.limit || 20),
        });
        if (args.lead_id) params.set('lead_id', `eq.${args.lead_id}`);
        if (args.cadence_id) params.set('cadence_id', `eq.${args.cadence_id}`);
        if (args.activity_type) params.set('activity_type', `eq.${args.activity_type}`);
        if (args.status) params.set('status', `eq.${args.status}`);
        if (args.date_from) params.set('created_at', `gte.${args.date_from}`);
        const data = await supabaseFetch(`${base}/rest/v1/activity_log?${params}`, {
          headers: supabaseHeaders(),
        });
        return { success: true, activities: data, total: Array.isArray(data) ? data.length : 0 };
      }

      case 'enviar_mensaje': {
        return await supabaseFetch(`${base}/functions/v1/linkedin-send-message`, {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(args),
        });
      }

      case 'business_case': {
        return await supabaseFetch(`${base}/functions/v1/generate-business-case`, {
          method: 'POST',
          headers: supabaseHeaders(true),
          body: JSON.stringify(args),
        });
      }

      case 'ver_metricas': {
        const cadParams = new URLSearchParams({ select: '*', org_id: `eq.${args.org_id}` });
        if (args.cadence_id) cadParams.set('id', `eq.${args.cadence_id}`);

        const actParams = new URLSearchParams({
          select: 'activity_type,status,created_at',
          org_id: `eq.${args.org_id}`,
          limit: '1000',
        });
        if (args.cadence_id) actParams.set('cadence_id', `eq.${args.cadence_id}`);
        if (args.date_from) actParams.set('created_at', `gte.${args.date_from}`);

        const leadsParams = new URLSearchParams({
          select: 'status,cadence_id',
          org_id: `eq.${args.org_id}`,
        });
        if (args.cadence_id) leadsParams.set('cadence_id', `eq.${args.cadence_id}`);

        const [cadences, activities, cadenceLeads] = await Promise.all([
          supabaseFetch(`${base}/rest/v1/cadences?${cadParams}`, { headers: supabaseHeaders() }),
          supabaseFetch(`${base}/rest/v1/activity_log?${actParams}`, { headers: supabaseHeaders() }),
          supabaseFetch(`${base}/rest/v1/cadence_leads?${leadsParams}`, { headers: supabaseHeaders() }),
        ]);
        return { success: true, cadences, activities, cadence_leads: cadenceLeads };
      }

      case 'gestionar_leads': {
        const { org_id, operation, filters, lead, lead_id, lead_ids, updates, cadence_id } = args;
        switch (operation) {
          case 'list': {
            const params = new URLSearchParams({
              select: '*',
              org_id: `eq.${org_id}`,
              order: 'created_at.desc',
              limit: String(filters?.limit || 20),
            });
            if (filters?.status) params.set('status', `eq.${filters.status}`);
            if (filters?.company) params.set('company', `eq.${filters.company}`);
            const data = await supabaseFetch(`${base}/rest/v1/leads?${params}`, { headers: supabaseHeaders() });
            return { success: true, leads: data, total: Array.isArray(data) ? data.length : 0 };
          }
          case 'create': {
            const data = await supabaseFetch(`${base}/rest/v1/leads`, {
              method: 'POST',
              headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
              body: JSON.stringify({ ...lead, org_id }),
            });
            const created = Array.isArray(data) ? data[0] : data;
            return { success: !!created?.id, lead: created };
          }
          case 'update': {
            const data = await supabaseFetch(
              `${base}/rest/v1/leads?id=eq.${lead_id}&org_id=eq.${org_id}`,
              {
                method: 'PATCH',
                headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
                body: JSON.stringify(updates),
              }
            );
            const updated = Array.isArray(data) ? data[0] : data;
            return { success: !!updated?.id, lead: updated };
          }
          case 'assign_to_cadence': {
            const ids = lead_ids?.length ? lead_ids : (lead_id ? [lead_id] : []);
            if (!ids.length) return { success: false, error: 'Se requiere lead_id o lead_ids' };
            const rows = ids.map(id => ({
              cadence_id, lead_id: id, org_id, status: 'active', current_step: 1,
            }));
            const data = await supabaseFetch(`${base}/rest/v1/cadence_leads`, {
              method: 'POST',
              headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
              body: JSON.stringify(rows),
            });
            return { success: true, assigned: Array.isArray(data) ? data.length : 0 };
          }
          case 'remove_from_cadence': {
            const url = `${base}/rest/v1/cadence_leads?lead_id=eq.${lead_id}&cadence_id=eq.${cadence_id}&org_id=eq.${org_id}`;
            await fetch(url, { method: 'DELETE', headers: supabaseHeaders() });
            return { success: true };
          }
          default:
            return { success: false, error: `Operación desconocida: ${operation}` };
        }
      }

      default:
        return { success: false, error: `Herramienta desconocida: ${name}` };
    }
  } catch (err) {
    console.error(`[tool] ${name} error:`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Conversation processing (Anthropic + tool call loop)
// ---------------------------------------------------------------------------
const conversations = new Map(); // userId → messages[]
const MAX_HISTORY = parseInt(MAX_HISTORY_MESSAGES, 10);

async function processMessage(userId, message) {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }
  const history = conversations.get(userId);
  history.push({ role: 'user', content: message });

  // Tool call loop — Anthropic alternates user/assistant strictly
  for (let iteration = 0; iteration < 10; iteration++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: history,
      tools,
    });

    // Add assistant turn to history (full content array)
    history.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      // Find all tool_use blocks and execute them
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const result = await executeTool(block.name, block.input);
          console.log(`[tool] ${block.name} →`, JSON.stringify(result).substring(0, 200));
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        })
      );

      // Tool results go as a user message
      history.push({ role: 'user', content: toolResults });
      continue; // ask Claude again with tool results
    }

    // We have a final text response
    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock?.text || '';

    // Trim history to avoid unbounded growth
    if (history.length > MAX_HISTORY) {
      conversations.set(userId, history.slice(-MAX_HISTORY));
    }

    return text;
  }

  return 'Hubo un problema procesando tu solicitud. Por favor intenta de nuevo.';
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const PORT = parseInt(GATEWAY_PORT, 10);
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

console.log(`🤖 OpenClaw Gateway listening on ws://0.0.0.0:${PORT}`);
console.log(`   Workspace: ${workspaceDir}`);
console.log(`   Supabase:  ${SUPABASE_URL}`);
console.log(`   LLM:       ${CLAUDE_MODEL} (Anthropic)`);

wss.on('connection', (ws) => {
  let sessionUserId = null;
  let sessionUserName = 'Unknown';

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      console.error('[gateway] Invalid JSON from bridge:', err.message);
      return;
    }

    // Handshake — bridge tells us who this conversation is for
    if (msg.type === 'init') {
      sessionUserId = msg.userId;
      sessionUserName = msg.userName || 'Unknown';
      console.log(`[gateway] Init: userId=${sessionUserId} name=${sessionUserName} channel=${msg.channel}`);
      return;
    }

    // User message
    if (msg.type === 'message') {
      const userId = msg.userId || sessionUserId;
      const content = msg.content;

      if (!userId || !content) {
        console.warn('[gateway] Missing userId or content');
        return;
      }

      console.log(`[gateway] → ${userId}: ${content.substring(0, 150)}`);

      try {
        const reply = await processMessage(userId, content);
        console.log(`[gateway] ← ${userId}: ${reply.substring(0, 150)}`);
        ws.send(JSON.stringify({ type: 'message', content: reply, userId }));
      } catch (err) {
        console.error(`[gateway] Error for ${userId}:`, err.message);
        ws.send(JSON.stringify({
          type: 'error',
          content: 'Error interno del gateway. Por favor intenta de nuevo.',
          userId,
        }));
      }
    }
  });

  ws.on('close', () => {
    console.log(`[gateway] Connection closed: ${sessionUserId}`);
  });

  ws.on('error', (err) => {
    console.error(`[gateway] WS error for ${sessionUserId}:`, err.message);
  });
});

// Cleanup stale conversations every 30 minutes
setInterval(() => {
  const before = conversations.size;
  // We don't track last-activity per conversation here, so just cap total size
  if (conversations.size > 1000) {
    const keys = [...conversations.keys()].slice(0, 500);
    keys.forEach(k => conversations.delete(k));
    console.log(`[gateway] Pruned ${conversations.size - before} stale conversations`);
  }
}, 30 * 60 * 1000);
