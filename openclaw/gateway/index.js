'use strict';

/**
 * OpenClaw Gateway
 *
 * Implements the JSON-RPC WebSocket protocol expected by the Twilio bridge:
 *   1. On connect → send {type:"event", event:"connect.challenge", payload:{nonce}}
 *   2. Bridge responds with {type:"req", method:"connect", params:{device,role,...}}
 *   3. Gateway replies {type:"res", id, result:{protocol:3, auth:{role}}}
 *   4. Bridge sends {type:"req", method:"chat.send", params:{sessionKey, message}}
 *   5. Gateway acks with {type:"res", id, result:{ok:true}}
 *   6. Gateway processes with Claude (Anthropic) + tool calls
 *   7. Gateway sends {type:"event", event:"chat.message", data:{content:"..."}}
 */

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
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
  if (!isEdgeFunction) h['apikey'] = SUPABASE_SERVICE_ROLE_KEY;
  return h;
}

async function supabaseFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text, _status: res.status }; }
}

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic format — input_schema)
// ---------------------------------------------------------------------------
const tools = [
  {
    name: 'buscar_prospectos',
    description: 'Busca prospectos en una empresa usando LinkedIn Sales Navigator (cascada L1→L2→L3).',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        company_name: { type: 'string' },
        company_domain: { type: 'string' },
        titles: { type: 'array', items: { type: 'string' }, description: 'e.g. ["CEO","VP Sales"]' },
        seniority_levels: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' },
        buyer_persona_id: { type: 'string' },
        account_mapping_company_id: { type: 'string' },
      },
      required: ['org_id', 'company_name'],
    },
  },
  {
    name: 'crear_cadencia',
    description: 'Crea una cadencia de outreach con pasos secuenciales. Confirma con el usuario antes de ejecutar.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        created_by: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              step_number: { type: 'number' },
              step_type: { type: 'string', enum: ['linkedin_connect','linkedin_message','linkedin_inmail','email','manual_task','linkedin_like','linkedin_comment'] },
              delay_days: { type: 'number' },
              template: { type: 'string', description: 'Variables: {{first_name}}, {{company}}, {{title}}, {{research}}' },
              subject: { type: 'string' },
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
    description: 'Descubre empresas que encajan con el ICP.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        icp_profile_id: { type: 'string' },
        criteria: {
          type: 'object',
          properties: {
            industries: { type: 'array', items: { type: 'string' } },
            employee_range: { type: 'string' },
            revenue_range: { type: 'string' },
            locations: { type: 'array', items: { type: 'string' } },
            technologies: { type: 'array', items: { type: 'string' } },
          },
        },
        limit: { type: 'number' },
        exclude_existing: { type: 'boolean' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'investigar_empresa',
    description: 'Investiga una empresa a fondo — scraping web, noticias, tech stack, insights.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        company_name: { type: 'string' },
        company_domain: { type: 'string' },
        company_linkedin_url: { type: 'string' },
        depth: { type: 'string', enum: ['quick', 'deep'] },
      },
      required: ['org_id', 'company_name'],
    },
  },
  {
    name: 'enriquecer_prospectos',
    description: 'Enriquece un prospecto con email, teléfono y datos de LinkedIn.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        prospect_id: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        company: { type: 'string' },
        company_domain: { type: 'string' },
        linkedin_url: { type: 'string' },
        enrich_email: { type: 'boolean' },
        enrich_phone: { type: 'boolean' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'ver_actividad',
    description: 'Consulta el log de actividades — mensajes, respuestas, errores.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        lead_id: { type: 'string' },
        cadence_id: { type: 'string' },
        activity_type: { type: 'string' },
        status: { type: 'string' },
        date_from: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'enviar_mensaje',
    description: 'Envía un mensaje directo por LinkedIn. Confirmar con el usuario antes de enviar.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        sender_account_id: { type: 'string' },
        recipient_provider_id: { type: 'string', description: 'LinkedIn provider ID (ACoAAA...)' },
        message: { type: 'string' },
        message_type: { type: 'string', enum: ['message', 'inmail', 'connection_request'] },
      },
      required: ['org_id', 'sender_account_id', 'recipient_provider_id', 'message', 'message_type'],
    },
  },
  {
    name: 'business_case',
    description: 'Genera un business case personalizado para una empresa objetivo.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        company_name: { type: 'string' },
        company_domain: { type: 'string' },
        prospect_name: { type: 'string' },
        prospect_title: { type: 'string' },
        pain_points: { type: 'array', items: { type: 'string' } },
        our_solution: { type: 'string' },
        research_data: { type: 'object' },
        language: { type: 'string', enum: ['es', 'en'] },
      },
      required: ['org_id', 'company_name'],
    },
  },
  {
    name: 'ver_metricas',
    description: 'Consulta métricas de cadencias — tasas de respuesta, conexión, conversión.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        cadence_id: { type: 'string' },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'gestionar_leads',
    description: 'CRUD sobre leads — listar, crear, actualizar, asignar/remover de cadencias.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        operation: { type: 'string', enum: ['list', 'create', 'update', 'assign_to_cadence', 'remove_from_cadence'] },
        filters: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            company: { type: 'string' },
            limit: { type: 'number' },
          },
        },
        lead: {
          type: 'object',
          properties: {
            first_name: { type: 'string' }, last_name: { type: 'string' },
            email: { type: 'string' }, company: { type: 'string' },
            title: { type: 'string' }, linkedin_url: { type: 'string' },
            provider_id: { type: 'string' }, status: { type: 'string' }, source: { type: 'string' },
          },
        },
        lead_id: { type: 'string' },
        lead_ids: { type: 'array', items: { type: 'string' } },
        updates: { type: 'object' },
        cadence_id: { type: 'string' },
      },
      required: ['org_id', 'operation'],
    },
  },
  {
    name: 'enviar_email',
    description: 'Envía un email usando la cuenta Gmail conectada del usuario. Confirmar con el usuario antes de enviar.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        owner_id: { type: 'string', description: 'user_id del remitente (dueño de la cuenta Gmail)' },
        lead_id: { type: 'string', description: 'ID del lead (si existe). Si no, crear primero con gestionar_leads.' },
        to: { type: 'string', description: 'Email del destinatario' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Cuerpo del email (HTML o texto plano)' },
        cc: { type: 'string', description: 'CC emails separados por coma (opcional)' },
      },
      required: ['org_id', 'owner_id', 'to', 'subject', 'body'],
    },
  },
  {
    name: 'identificar_usuario',
    description: 'Identifica un usuario de Chief por su email y org_id. Devuelve user_id, member_id, nombre y cuentas conectadas.',
    input_schema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        email: { type: 'string', description: 'Email del usuario en Supabase Auth' },
      },
      required: ['org_id', 'email'],
    },
  },
  {
    name: 'guardar_sesion',
    description: 'Guarda el mapeo WhatsApp → usuario de Chief para no preguntar en cada conversación.',
    input_schema: {
      type: 'object',
      properties: {
        whatsapp_number: { type: 'string', description: 'Número de WhatsApp (e.g., +1234567890)' },
        org_id: { type: 'string' },
        user_id: { type: 'string' },
        member_id: { type: 'string' },
        display_name: { type: 'string' },
      },
      required: ['whatsapp_number', 'org_id', 'user_id'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
async function executeTool(name, args) {
  const base = SUPABASE_URL;
  console.log(`[tool] ${name}`, JSON.stringify(args).substring(0, 200));

  try {
    switch (name) {
      case 'buscar_prospectos':
        return await supabaseFetch(`${base}/functions/v1/cascade-search-company`, {
          method: 'POST', headers: supabaseHeaders(true), body: JSON.stringify(args),
        });

      case 'crear_cadencia': {
        const { steps, ...cadenceData } = args;
        const cadence = await supabaseFetch(`${base}/rest/v1/cadences`, {
          method: 'POST',
          headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({ ...cadenceData, status: 'draft' }),
        });
        const c = Array.isArray(cadence) ? cadence[0] : cadence;
        if (!c?.id) return { success: false, error: 'No se pudo crear la cadencia', details: cadence };
        const stepRows = steps.map(s => ({ ...s, cadence_id: c.id, org_id: args.org_id }));
        const createdSteps = await supabaseFetch(`${base}/rest/v1/cadence_steps`, {
          method: 'POST',
          headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(stepRows),
        });
        return { success: true, cadence_id: c.id, cadence_name: c.name, steps_created: Array.isArray(createdSteps) ? createdSteps.length : 0 };
      }

      case 'descubrir_empresas':
        return await supabaseFetch(`${base}/functions/v1/discover-icp-companies`, {
          method: 'POST', headers: supabaseHeaders(true), body: JSON.stringify(args),
        });

      case 'investigar_empresa':
        return await supabaseFetch(`${base}/functions/v1/company-research`, {
          method: 'POST', headers: supabaseHeaders(true), body: JSON.stringify(args),
        });

      case 'enriquecer_prospectos':
        return await supabaseFetch(`${base}/functions/v1/enrich-prospect`, {
          method: 'POST', headers: supabaseHeaders(true), body: JSON.stringify(args),
        });

      case 'ver_actividad': {
        const params = new URLSearchParams({
          select: '*', org_id: `eq.${args.org_id}`,
          order: 'created_at.desc', limit: String(args.limit || 20),
        });
        if (args.lead_id) params.set('lead_id', `eq.${args.lead_id}`);
        if (args.cadence_id) params.set('cadence_id', `eq.${args.cadence_id}`);
        if (args.activity_type) params.set('activity_type', `eq.${args.activity_type}`);
        if (args.status) params.set('status', `eq.${args.status}`);
        if (args.date_from) params.set('created_at', `gte.${args.date_from}`);
        const data = await supabaseFetch(`${base}/rest/v1/activity_log?${params}`, { headers: supabaseHeaders() });
        return { success: true, activities: data, total: Array.isArray(data) ? data.length : 0 };
      }

      case 'enviar_mensaje':
        return await supabaseFetch(`${base}/functions/v1/linkedin-send-message`, {
          method: 'POST', headers: supabaseHeaders(true), body: JSON.stringify(args),
        });

      case 'business_case':
        return await supabaseFetch(`${base}/functions/v1/generate-business-case`, {
          method: 'POST', headers: supabaseHeaders(true), body: JSON.stringify(args),
        });

      case 'ver_metricas': {
        const cadParams = new URLSearchParams({ select: '*', org_id: `eq.${args.org_id}` });
        if (args.cadence_id) cadParams.set('id', `eq.${args.cadence_id}`);
        const actParams = new URLSearchParams({
          select: 'activity_type,status,created_at', org_id: `eq.${args.org_id}`, limit: '1000',
        });
        if (args.cadence_id) actParams.set('cadence_id', `eq.${args.cadence_id}`);
        if (args.date_from) actParams.set('created_at', `gte.${args.date_from}`);
        const leadsParams = new URLSearchParams({ select: 'status,cadence_id', org_id: `eq.${args.org_id}` });
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
              select: '*', org_id: `eq.${org_id}`,
              order: 'created_at.desc', limit: String(filters?.limit || 20),
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
            const data = await supabaseFetch(`${base}/rest/v1/leads?id=eq.${lead_id}&org_id=eq.${org_id}`, {
              method: 'PATCH',
              headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
              body: JSON.stringify(updates),
            });
            const updated = Array.isArray(data) ? data[0] : data;
            return { success: !!updated?.id, lead: updated };
          }
          case 'assign_to_cadence': {
            const ids = lead_ids?.length ? lead_ids : (lead_id ? [lead_id] : []);
            if (!ids.length) return { success: false, error: 'Se requiere lead_id o lead_ids' };
            const rows = ids.map(id => ({ cadence_id, lead_id: id, org_id, status: 'active', current_step: 1 }));
            const data = await supabaseFetch(`${base}/rest/v1/cadence_leads`, {
              method: 'POST',
              headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
              body: JSON.stringify(rows),
            });
            return { success: true, assigned: Array.isArray(data) ? data.length : 0 };
          }
          case 'remove_from_cadence': {
            await fetch(`${base}/rest/v1/cadence_leads?lead_id=eq.${lead_id}&cadence_id=eq.${cadence_id}&org_id=eq.${org_id}`, {
              method: 'DELETE', headers: supabaseHeaders(),
            });
            return { success: true };
          }
          default:
            return { success: false, error: `Operación desconocida: ${operation}` };
        }
      }

      case 'enviar_email':
        return await supabaseFetch(`${base}/functions/v1/send-email`, {
          method: 'POST', headers: supabaseHeaders(true),
          body: JSON.stringify({
            leadId: args.lead_id,
            to: args.to,
            subject: args.subject,
            body: args.body,
            cc: args.cc,
            ownerId: args.owner_id,
            orgId: args.org_id,
          }),
        });

      case 'identificar_usuario': {
        // 1. Find user by email in auth.users via profiles
        const profileParams = new URLSearchParams({
          select: 'id,email,raw_user_meta_data',
        });
        // Look up in profiles table which has user_id
        const profileData = await supabaseFetch(
          `${base}/rest/v1/profiles?select=user_id,full_name,email,unipile_account_id&user_id=not.is.null&email=eq.${encodeURIComponent(args.email)}`,
          { headers: supabaseHeaders() }
        );
        const profile = Array.isArray(profileData) ? profileData[0] : null;
        if (!profile) {
          return { success: false, error: `No se encontró usuario con email: ${args.email}` };
        }

        // 2. Find org membership
        const memberData = await supabaseFetch(
          `${base}/rest/v1/organization_members?select=id,role,user_id&user_id=eq.${profile.user_id}&org_id=eq.${args.org_id}`,
          { headers: supabaseHeaders() }
        );
        const member = Array.isArray(memberData) ? memberData[0] : null;
        if (!member) {
          return { success: false, error: `El usuario no pertenece a esta organización.` };
        }

        // 3. Check connected accounts
        const [linkedinAccounts, gmailAccounts] = await Promise.all([
          supabaseFetch(
            `${base}/rest/v1/unipile_accounts?select=account_id,provider,status&user_id=eq.${profile.user_id}&status=eq.active`,
            { headers: supabaseHeaders() }
          ),
          supabaseFetch(
            `${base}/rest/v1/ae_integrations?select=id,provider,config&user_id=eq.${profile.user_id}&org_id=eq.${args.org_id}&provider=eq.gmail`,
            { headers: supabaseHeaders() }
          ),
        ]);

        return {
          success: true,
          user_id: profile.user_id,
          member_id: member.id,
          display_name: profile.full_name || args.email,
          role: member.role,
          connected_accounts: {
            linkedin: Array.isArray(linkedinAccounts) ? linkedinAccounts.map(a => ({ account_id: a.account_id, status: a.status })) : [],
            gmail: Array.isArray(gmailAccounts) ? gmailAccounts.map(a => ({ id: a.id, email: a.config?.email })) : [],
          },
        };
      }

      case 'guardar_sesion': {
        // Upsert into whatsapp_sessions table
        const sessionData = {
          whatsapp_number: args.whatsapp_number,
          org_id: args.org_id,
          user_id: args.user_id,
          member_id: args.member_id || null,
          display_name: args.display_name || null,
          updated_at: new Date().toISOString(),
        };
        const result = await supabaseFetch(`${base}/rest/v1/whatsapp_sessions`, {
          method: 'POST',
          headers: {
            ...supabaseHeaders(),
            'Prefer': 'return=representation,resolution=merge-duplicates',
          },
          body: JSON.stringify(sessionData),
        });
        const saved = Array.isArray(result) ? result[0] : result;
        return { success: !!saved, session: saved };
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
const conversations = new Map(); // sessionKey → messages[]
const MAX_HISTORY = parseInt(MAX_HISTORY_MESSAGES, 10);

async function processMessage(sessionKey, message) {
  if (!conversations.has(sessionKey)) {
    conversations.set(sessionKey, []);
  }
  const history = conversations.get(sessionKey);
  history.push({ role: 'user', content: message });

  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: history,
      tools,
    });

    history.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const result = await executeTool(block.name, block.input);
          console.log(`[tool] ${block.name} →`, JSON.stringify(result).substring(0, 200));
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
        })
      );
      history.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock?.text || '';

    if (history.length > MAX_HISTORY) {
      conversations.set(sessionKey, history.slice(-MAX_HISTORY));
    }
    return text;
  }

  return 'Hubo un problema procesando tu solicitud. Por favor intenta de nuevo.';
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------
function sendRes(ws, id, result) {
  ws.send(JSON.stringify({ type: 'res', id, result }));
}

function sendEvent(ws, event, data) {
  ws.send(JSON.stringify({ type: 'event', event, data }));
}

// ---------------------------------------------------------------------------
// WebSocket server — implements OpenClaw JSON-RPC protocol
// ---------------------------------------------------------------------------
const PORT = parseInt(GATEWAY_PORT, 10);
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

console.log(`🤖 OpenClaw Gateway (JSON-RPC) on ws://0.0.0.0:${PORT}`);
console.log(`   LLM:      ${CLAUDE_MODEL} (Anthropic)`);
console.log(`   Supabase: ${SUPABASE_URL}`);

wss.on('connection', (ws) => {
  let authorized = false;

  // Step 1: Send connect challenge
  const nonce = crypto.randomBytes(16).toString('hex');
  ws.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce } }));
  console.log('[gateway] New connection — challenge sent');

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type !== 'req') return;

    // Step 2: Handle connect handshake
    if (msg.method === 'connect') {
      authorized = true;
      const role = msg.params?.role || 'operator';
      console.log(`[gateway] connect — role=${role} device=${msg.params?.device?.id}`);
      sendRes(ws, msg.id, { protocol: 3, auth: { role }, ok: true });
      return;
    }

    if (!authorized) {
      sendRes(ws, msg.id, { error: 'Not authorized — send connect first' });
      return;
    }

    // Step 3: Handle chat.send
    if (msg.method === 'chat.send') {
      const { sessionKey = 'default', message } = msg.params || {};

      if (!message) {
        sendRes(ws, msg.id, { ok: false, error: 'Empty message' });
        return;
      }

      console.log(`[gateway] chat.send session=${sessionKey} msg="${message.substring(0, 100)}"`);

      // Acknowledge immediately so the bridge doesn't timeout
      sendRes(ws, msg.id, { ok: true });

      // Process asynchronously and send response event when done
      processMessage(sessionKey, message)
        .then((reply) => {
          console.log(`[gateway] reply="${reply.substring(0, 100)}"`);
          sendEvent(ws, 'chat.message', { content: reply });
        })
        .catch((err) => {
          console.error('[gateway] processMessage error:', err.message);
          sendEvent(ws, 'chat.message', { content: 'Error interno. Por favor intenta de nuevo.' });
        });

      return;
    }

    // Unknown method
    console.warn(`[gateway] Unknown method: ${msg.method}`);
    sendRes(ws, msg.id, { error: `Unknown method: ${msg.method}` });
  });

  ws.on('close', () => console.log('[gateway] Connection closed'));
  ws.on('error', (err) => console.error('[gateway] WS error:', err.message));
});

// Trim stale sessions every hour
setInterval(() => {
  if (conversations.size > 500) {
    const toDelete = [...conversations.keys()].slice(0, 250);
    toDelete.forEach(k => conversations.delete(k));
  }
}, 60 * 60 * 1000);
