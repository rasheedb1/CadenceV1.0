/**
 * Budget — token/cost tracking and 80% alert system
 * Ported from event-loop.js budget enforcement logic.
 */

import { MODEL_PRICING, DEFAULT_BLENDED_PRICE } from '../types.js';
import type { BudgetRow, LoopState } from '../types.js';
import { sbGet, sbUpsert } from '../supabase-client.js';
import type { Logger } from './logger.js';

const CALLBACK_URL = process.env.CALLBACK_URL ||
  'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback';

export function getTokenCost(tokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] || null;
  const pricePerMTok = pricing ? pricing.blended : DEFAULT_BLENDED_PRICE;
  return parseFloat((tokens * pricePerMTok / 1_000_000).toFixed(6));
}

/** Refresh budget from DB (every 10 ticks) */
export async function refreshBudgetFromDB(
  agentId: string,
  state: LoopState,
): Promise<void> {
  if (state.iteration % 10 !== 0 && state.budgetFromDB) return;
  const rows = await sbGet<BudgetRow[]>(
    `agent_budgets?agent_id=eq.${agentId}&limit=1`,
  ).catch(() => []);
  state.budgetFromDB = Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Check if budget exceeded. Returns true if agent should stop. */
export function checkBudgetExceeded(
  state: LoopState,
  log: Logger,
): boolean {
  if (!state.budgetFromDB) return false;
  const b = state.budgetFromDB;
  const maxIter = b.max_iterations || 200;
  const maxCost = b.max_cost_usd || 10;
  if ((b.iterations_used || 0) >= maxIter) {
    log.warn('Budget: max iterations reached');
    return true;
  }
  if ((b.cost_usd || 0) >= maxCost) {
    log.warn('Budget: max cost reached');
    return true;
  }
  return false;
}

/** Send 80% budget alert via WhatsApp (once per cycle) */
export async function checkBudgetAlert(
  agentName: string,
  state: LoopState,
  log: Logger,
): Promise<void> {
  if (state.budgetAlertSent || !state.budgetFromDB) return;
  const b = state.budgetFromDB;
  const maxCost = b.max_cost_usd || 10;
  const maxIter = b.max_iterations || 200;
  const costPct = ((b.cost_usd || 0) / maxCost) * 100;
  const iterPct = ((b.iterations_used || 0) / maxIter) * 100;

  if (costPct >= 80 || iterPct >= 80) {
    state.budgetAlertSent = true;
    log.warn(`Budget alert: ${costPct.toFixed(0)}% cost, ${iterPct.toFixed(0)}% iterations`);
    fetch(CALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agentName,
        result: {
          text: `⚠️ *Budget alert* — ${agentName}\n💰 Cost: $${(b.cost_usd || 0).toFixed(2)} / $${maxCost.toFixed(2)} (${costPct.toFixed(0)}%)\n🔄 Iterations: ${b.iterations_used || 0} / ${maxIter} (${iterPct.toFixed(0)}%)\n\nAgent will keep working until limit. Adjust from dashboard.`,
        },
        whatsapp_number: null,
      }),
    }).catch(() => {});
  }
}

/** Sync budget to DB */
export async function syncBudget(
  agentId: string,
  orgId: string,
  state: LoopState,
): Promise<void> {
  const model = state.agentConfig?.model || 'claude-sonnet-4-6';
  await sbUpsert('agent_budgets', {
    agent_id: agentId,
    org_id: orgId,
    tokens_used: state.budget.tokens,
    cost_usd: getTokenCost(state.budget.tokens, model),
    iterations_used: state.budget.iterations,
  }).catch(() => {});
}
