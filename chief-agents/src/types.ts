/**
 * Chief Agents — TypeScript Types
 * All interfaces for the agent runtime.
 */

// --- Database row types ---

export interface AgentRow {
  id: string;
  org_id: string;
  name: string;
  role: string;
  description: string;
  soul_md: string | null;
  status: 'draft' | 'deploying' | 'active' | 'paused' | 'error' | 'destroyed';
  railway_service_id: string | null;
  railway_url: string | null;
  config: Record<string, unknown> | null;
  model: string;
  model_provider: string;
  temperature: number;
  max_tokens: number;
  parent_agent_id: string | null;
  team: string | null;
  tier: 'worker' | 'team_lead' | 'manager';
  capabilities: string[];
  objectives: Record<string, unknown> | null;
  availability: 'available' | 'working' | 'blocked' | 'on_project' | 'offline';
  created_at: string;
  updated_at: string;
}

export interface TaskV2Row {
  id: string;
  org_id: string;
  project_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  task_type: string;
  required_capabilities: string[];
  priority: number;
  story_points: number | null;
  assigned_agent_id: string | null;
  assigned_at: string | null;
  depends_on: string[];
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  tokens_used: number;
  cost_usd: number;
  artifact_ids: string[];
  parent_result_summary: string | null;
  review_score: number | null;
  review_iteration: number;
  max_review_iterations: number;
  context_summary: string | null;
  phase_id: string | null;
}

export interface ArtifactRow {
  id: string;
  org_id: string;
  task_id: string | null;
  project_id: string | null;
  filename: string;
  version: number;
  artifact_type: string;
  content: string;
  content_summary: string | null;
  created_by: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  org_id: string;
  task_id: string;
  artifact_id: string | null;
  reviewer_agent_id: string;
  score: number;
  passed: boolean;
  issues: Array<{ issue: string; severity: string }>;
  suggestions: Array<{ suggestion: string; priority: string }>;
  iteration: number;
  max_iterations: number;
}

export interface KnowledgeRow {
  id: string;
  content: string;
  category: string;
  importance: number;
  scope: string;
}

export interface CheckinRow {
  feedback: string | null;
  summary: string;
}

export interface BudgetRow {
  agent_id: string;
  org_id: string;
  tokens_used: number;
  max_tokens: number | null;
  cost_usd: number;
  max_cost_usd: number | null;
  iterations_used: number;
  max_iterations: number | null;
}

export interface HeartbeatRow {
  agent_id: string;
  status: string;
  current_task: string | null;
  last_seen: string;
}

export interface MessageRow {
  id: string;
  org_id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  message_type: string;
  thread_id: string | null;
  read_by: string[];
  project_id: string | null;
  created_at: string;
}

export interface LegacyBoardRow {
  id: string;
  title: string;
  content: string | Record<string, unknown>;
  status: string;
  priority: number;
}

// --- Agent config (derived from AgentRow) ---

export interface AgentConfig {
  id: string;
  orgId: string;
  name: string;
  role: string;
  roleKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  capabilities: string[];
  team: string | null;
  tier: string;
  soulPrompt: string;
  currentTaskId: string | null;
  currentProjectId: string | null;
}

// --- Event loop state ---

export interface LoopState {
  running: boolean;
  busy: boolean;
  iteration: number;
  interval: number;
  consecutiveIdles: number;
  consecutiveErrors: number;
  lastAction: string | null;
  lastActionTime: string | null;
  budget: { tokens: number; cost: number; iterations: number };
  maxIterations: number;
  agentConfig: Partial<AgentRow> | null;
  tasksCompletedSinceCheckin: number;
  budgetAlertSent: boolean;
  recentTickActions: string[];
  recentActions: Array<{ action: string; taskId: string | null }>;
  consecutiveFailedClaims: number;
  lastSenseTime: string | null;
  budgetFromDB: BudgetRow | null;
}

// --- SENSE context ---

export interface SenseContext {
  inbox: MessageRow[];
  myTasks: Array<TaskV2Row | LegacyBoardRow>;
  availableTasks: Array<TaskV2Row | LegacyBoardRow>;
  budget: BudgetRow | null;
  onlineAgents: HeartbeatRow[];
  capabilities: string[];
  isV2Available: boolean;
  latestArtifact: Partial<ArtifactRow> | null;
  latestReview: Partial<ReviewRow> | null;
  knowledge: KnowledgeRow[];
  pendingFeedback: CheckinRow[];
  unreadMessages: MessageRow[];
  projectContext: ProjectContextRow[];
}

export interface ProjectContextRow {
  project_id: string;
  org_id: string;
  project_name: string;
  project_status: string;
  team_status: unknown;
  recent_artifacts: unknown;
  blockers: unknown;
  recent_decisions: unknown;
  task_counts: Record<string, number>;
}

// --- THINK action decision ---

export interface ParsedAction {
  action: string;
  reasoning: string;
  params: Record<string, unknown>;
}

// --- SDK runner result ---

export interface SDKResult {
  text: string;
  tokensUsed: number;
  costUsd: number;
  numTurns: number;
}

// --- Model pricing ---

export interface ModelPricing {
  input: number;
  output: number;
  blended: number;
}

// --- Constants ---

export const MIN_INTERVAL = 10_000;       // 10s when busy
export const MAX_INTERVAL = 180_000;      // 3min when idle
export const DEFAULT_INTERVAL = 60_000;   // 60s default (was 20s — cost optimization)
export const STALL_WINDOW = 3;
export const IDLE_PAUSE_THRESHOLD = 5;
export const IDLE_RATIO_WINDOW = 20;
export const IDLE_RATIO_THRESHOLD = 0.8;
export const STALL_CLAIM_LIMIT = 5;
export const CHECKIN_EVERY_N_TASKS = 3;
export const MSG_CIRCUIT_LIMIT = 10;
export const MSG_CIRCUIT_WINDOW = 5 * 60 * 1000;
export const DEEP_SLEEP_INTERVAL = 300_000; // 5min

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6':           { input: 15.00, output: 75.00, blended: 45.00 },
  'claude-opus-4-20250514':    { input: 15.00, output: 75.00, blended: 45.00 },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00, blended: 9.00 },
  'claude-sonnet-4-20250514':  { input: 3.00,  output: 15.00, blended: 9.00 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00,  blended: 2.40 },
  'claude-haiku-3-5-20241022': { input: 0.80,  output: 4.00,  blended: 2.40 },
};
export const DEFAULT_BLENDED_PRICE = 9.00;

// SDK tools — NO Bash. All shell commands run via pre/post-exec in act.ts
export const ROLE_TOOLS: Record<string, string[]> = {
  cto:         ['Read', 'Write', 'Edit', 'MultiEdit', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
  ux_designer: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
  qa_engineer: ['Read', 'Write', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
  sales:       ['Read', 'Write', 'WebSearch', 'WebFetch', 'Glob'],
  assistant:   ['Read', 'Write', 'WebSearch', 'WebFetch'], // triage + writing, inbox tools via MCP
};

export const TYPE_CAPS: Record<string, string[]> = {
  code:         ['code', 'ops'],
  design:       ['design'],
  research:     ['research'],
  qa:           ['research', 'outreach'],
  writing:      ['writing'],
  outreach:     ['outreach', 'research'],
  inbox:        ['inbox'],
  triage:       ['inbox'],
  calendar:     ['calendar'],
  prospecting:  ['apollo', 'research'],
  crm:          ['salesforce'],
  linkedin:     ['linkedin'],
  drive:        ['drive'],
  sheets:       ['sheets'],
  contacts:       ['contacts'],
  presentations:    ['presentations'],
  business_case:    ['business_cases'],
  general:          [],
};
