/**
 * Paula SF Pipeline tools — domain-specific MCP tools for the
 * paula-daily-salesforce-nextsteps automation.
 *
 * Plan: tasks/plan-paula-sf-pipeline-watcher.md (v4.1)
 * Migration: supabase/migrations/108_paula_sf_pipeline.sql
 *
 * These tools wrap Supabase REST + bridge callback to:
 *   - read/write the Phase 0 schema cache (paula_sf_field_map)
 *   - append per-opp audit rows (paula_sf_run_audit)
 *   - send WhatsApp digests/alerts via the existing bridge
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { sbGet, sbPost, sbPatch } from '../supabase-client.js';
import { pickUrl } from '../utils/env-url.js';

const CALLBACK_URL = pickUrl(
  process.env.CALLBACK_URL,
  'https://bridge.yuno.tools/api/agent-callback',
);

export function buildPaulaTools(agent: AgentConfig): any[] {
  // ================================================================
  // paula_field_map_get — Phase 0 schema cache read
  // ================================================================
  const fieldMapGet = tool(
    'paula_field_map_get',
    'Read the Paula SF field-map cache for the current org. Returns null if Phase 0 has not been completed yet. Use this at the START of every run to avoid re-introspecting SF.',
    {},
    async () => {
      try {
        const rows = await sbGet<any[]>(
          `paula_sf_field_map?org_id=eq.${agent.orgId}&select=*&limit=1`,
        ).catch(() => []);
        if (!Array.isArray(rows) || rows.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'NO_FIELD_MAP — Phase 0 has not been completed for this org. Run sf_describe_object on Opportunity, identify the 3 field API names, then call paula_field_map_set.',
              },
            ],
          };
        }
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(rows[0], null, 2) },
          ],
        };
      } catch (e: any) {
        return {
          content: [
            { type: 'text' as const, text: `field_map_get error: ${e.message}` },
          ],
        };
      }
    },
  );

  // ================================================================
  // paula_field_map_set — Phase 0 schema cache write
  // ================================================================
  const fieldMapSet = tool(
    'paula_field_map_set',
    'Persist the discovered SF Opportunity field map. Call ONCE after sf_describe_object reveals the API names + lengths for Next Step / Deal Comments / Blocker. Subsequent runs read this cache.',
    {
      next_step_api: z
        .string()
        .describe('API name of the Next Step field (typically "NextStep", standard SF)'),
      next_step_length: z.number().int().describe('Field length in chars (typically 255)'),
      deal_comments_api: z.string().describe('API name of the Deal Comments field (typically "Deal_Comments__c")'),
      deal_comments_length: z.number().int(),
      blocker_api: z.string().describe('API name of the Blocker field (typically "Blocker__c")'),
      blocker_length: z.number().int(),
      paula_sf_user_id: z
        .string()
        .describe('SF user id Paula writes as (read from salesforce_connections.sf_user_id)'),
      friendly_flow_user_ids: z
        .array(z.string())
        .optional()
        .describe('Whitelist of SF user ids whose Flow-driven edits should NOT trigger freeze gate'),
      field_history_tracked: z
        .record(z.boolean())
        .optional()
        .describe('Map of {field_api: history_tracked_bool} from FieldDefinition tooling query'),
      mark_confirmed: z
        .boolean()
        .optional()
        .describe('Set to true ONLY after Rasheed confirmed the mapping via WhatsApp ✅. Sets confirmed_at=now().'),
    },
    async (params) => {
      try {
        const body: any = {
          org_id: agent.orgId,
          next_step_api: params.next_step_api,
          next_step_length: params.next_step_length,
          deal_comments_api: params.deal_comments_api,
          deal_comments_length: params.deal_comments_length,
          blocker_api: params.blocker_api,
          blocker_length: params.blocker_length,
          paula_sf_user_id: params.paula_sf_user_id,
          friendly_flow_user_ids: params.friendly_flow_user_ids || [],
          field_history_tracked: params.field_history_tracked || {},
          api_version: 'v59.0',
          scope: 'rasheed_canary',
        };
        if (params.mark_confirmed) body.confirmed_at = new Date().toISOString();

        // Upsert: try insert; on conflict (PRIMARY KEY org_id) → patch
        const existing = await sbGet<any[]>(
          `paula_sf_field_map?org_id=eq.${agent.orgId}&select=org_id`,
        ).catch(() => []);
        if (Array.isArray(existing) && existing.length > 0) {
          await sbPatch(`paula_sf_field_map?org_id=eq.${agent.orgId}`, body);
          return {
            content: [
              {
                type: 'text' as const,
                text: `✅ Field map UPDATED for org ${agent.orgId}. confirmed=${!!params.mark_confirmed}`,
              },
            ],
          };
        } else {
          await sbPost('paula_sf_field_map', body);
          return {
            content: [
              {
                type: 'text' as const,
                text: `✅ Field map CREATED for org ${agent.orgId}. confirmed=${!!params.mark_confirmed}`,
              },
            ],
          };
        }
      } catch (e: any) {
        return {
          content: [
            { type: 'text' as const, text: `field_map_set error: ${e.message}` },
          ],
        };
      }
    },
  );

  // ================================================================
  // paula_audit_write — append a per-opp audit row
  // ================================================================
  const auditWrite = tool(
    'paula_audit_write',
    'Append one row to paula_sf_run_audit recording what happened on a single opp this run. Use AFTER any decision (write, skip, fail) so the run is fully traceable.',
    {
      sf_opportunity_id: z.string(),
      opportunity_name: z.string().optional(),
      scope: z.enum(['rasheed_canary', 'rasheed_all']),
      status: z.enum([
        'updated',
        'noop',
        'skipped_human_edit',
        'skipped_concurrent_edit',
        'skipped_no_signals',
        'skipped_rate_limit',
        'skipped_cost_cap',
        'failed_summarize',
        'failed_write',
        'failed_anthropic_outage',
        'failed_summarization_circuit',
        'failed_cost_cap',
        'failed_persistent_overflow',
        'failed_other',
        'restored',
      ]),
      fields_written: z.array(z.string()).optional(),
      prev_values: z.any().optional(),
      new_values: z.any().optional(),
      prev_hashes: z.any().optional(),
      new_value_hashes: z.any().optional(),
      section_hashes: z
        .any()
        .optional()
        .describe('Per-section authorship + hash map (see plan §7.1)'),
      signals_summary: z.any().optional().describe('{emails:N, calls:N, ...}'),
      citation_stats: z.any().optional(),
      pii_scrubs: z.any().optional(),
      reason: z.string().optional(),
      cost_usd: z.number().optional(),
      duration_ms: z.number().int().optional(),
      haiku_tokens: z.any().optional(),
      sonnet_tokens: z.any().optional(),
      turns_used: z.number().int().optional(),
      workflow_run_id: z.string().optional(),
      agent_task_id: z.string().optional(),
    },
    async (params) => {
      try {
        const body = { org_id: agent.orgId, ...params };
        await sbPost('paula_sf_run_audit', body);
        return {
          content: [
            {
              type: 'text' as const,
              text: `✅ Audit row written: ${params.sf_opportunity_id} → ${params.status}`,
            },
          ],
        };
      } catch (e: any) {
        return {
          content: [
            { type: 'text' as const, text: `audit_write error: ${e.message}` },
          ],
        };
      }
    },
  );

  // ================================================================
  // paula_digest_send — WhatsApp via existing bridge callback
  // ================================================================
  const digestSend = tool(
    'paula_digest_send',
    'Send a WhatsApp digest to Rasheed via the Chief bridge. Use at the END of every run (success or failure) and on auto-pause events. Bridge resolves Rasheed\'s number from the org context.',
    {
      message: z.string().describe('The full digest text. English. Already formatted (multi-line OK).'),
      severity: z
        .enum(['info', 'warning', 'error'])
        .optional()
        .describe('Used by bridge to optionally tag/route the message'),
    },
    async ({ message, severity }) => {
      try {
        const res = await fetch(CALLBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: 'Paula',
            result: { text: message },
            whatsapp_number: null, // bridge auto-resolves from org
            severity: severity || 'info',
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return {
            content: [
              {
                type: 'text' as const,
                text: `digest_send error: ${res.status} ${errText.substring(0, 200)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: 'text' as const, text: '✅ WhatsApp digest sent.' }],
        };
      } catch (e: any) {
        return {
          content: [
            { type: 'text' as const, text: `digest_send error: ${e.message}` },
          ],
        };
      }
    },
  );

  return [fieldMapGet, fieldMapSet, auditWrite, digestSend];
}
