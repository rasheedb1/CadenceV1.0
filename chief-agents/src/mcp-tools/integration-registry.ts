/**
 * Integration Registry — maps capabilities to tool builders.
 * Each integration file exports buildXxxTools(agent) => Tool[].
 * The registry calls only the builders for capabilities the agent has.
 *
 * To add a new integration:
 * 1. Create xxx-tools.ts following the inbox-tools.ts pattern
 * 2. Add the capability name + builder to REGISTRY below
 * 3. Chief can now toggle it via cambiar_config_agente
 */

import type { AgentConfig } from '../types.js';
import { buildInboxTools } from './inbox-tools.js';
import { buildCalendarTools } from './calendar-tools.js';
import { buildLinkedInTools } from './linkedin-tools.js';
import { buildApolloTools } from './apollo-tools.js';
import { buildSalesforceTools } from './salesforce-tools.js';
import { buildDriveTools } from './drive-tools.js';
import { buildSheetsTools } from './sheets-tools.js';
import { buildContactsTools } from './contacts-tools.js';
import { buildSlidesTools } from './slides-tools.js';
import { buildBusinessCaseTools } from './business-case-tools.js';

type ToolBuilder = (agent: AgentConfig) => any[];

const REGISTRY: Record<string, ToolBuilder> = {
  inbox:         buildInboxTools,
  calendar:      buildCalendarTools,
  linkedin:      buildLinkedInTools,
  apollo:        buildApolloTools,
  salesforce:    buildSalesforceTools,
  drive:         buildDriveTools,
  sheets:        buildSheetsTools,
  contacts:      buildContactsTools,
  presentations:  buildSlidesTools,
  business_cases: buildBusinessCaseTools,
};

/**
 * Build all integration tools for an agent based on its capabilities.
 * Returns empty array if agent has no integration capabilities.
 */
export function buildIntegrationTools(agent: AgentConfig): any[] {
  const tools: any[] = [];
  const caps = new Set(agent.capabilities || []);
  for (const [cap, builder] of Object.entries(REGISTRY)) {
    if (caps.has(cap)) {
      tools.push(...builder(agent));
    }
  }
  return tools;
}
