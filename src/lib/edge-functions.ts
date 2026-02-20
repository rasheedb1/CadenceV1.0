import { supabase } from '@/integrations/supabase/client'

/**
 * Error class for Edge Function failures
 */
export class EdgeFunctionError extends Error {
  statusCode?: number
  functionName?: string
  details?: unknown

  constructor(
    message: string,
    statusCode?: number,
    functionName?: string,
    details?: unknown
  ) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.statusCode = statusCode
    this.functionName = functionName
    this.details = details
  }
}

/**
 * Response type for Edge Function calls
 */
export interface EdgeFunctionResponse<T> {
  data: T
  error: null
}

/**
 * Helper to call Supabase Edge Functions
 *
 * @param functionName - The name of the Edge Function to call
 * @param body - The request body to send
 * @param token - The user's auth token
 * @returns Promise resolving to the function response data
 * @throws EdgeFunctionError if the call fails
 *
 * @example
 * ```ts
 * const result = await callEdgeFunction<{ success: boolean }>(
 *   'send-linkedin-message',
 *   { leadId: '123', message: 'Hello!' },
 *   session.access_token
 * )
 * ```
 */
export async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  token: string,
  options?: { timeoutMs?: number }
): Promise<T> {
  const timeoutMs = options?.timeoutMs

  // If a custom timeout is specified, use raw fetch with AbortController
  // (supabase.functions.invoke doesn't support custom timeouts)
  if (timeoutMs) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const resp = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error')
        let msg = text
        try { msg = JSON.parse(text).error || text } catch { /* use raw text */ }
        throw new EdgeFunctionError(msg, resp.status, functionName)
      }

      const data = await resp.json() as T
      if (data === null || data === undefined) {
        throw new EdgeFunctionError(
          `Edge function "${functionName}" returned no data`,
          undefined,
          functionName
        )
      }
      return data
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof EdgeFunctionError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new EdgeFunctionError(
          'La generacion tomo demasiado tiempo. Intenta de nuevo.',
          504,
          functionName
        )
      }
      throw new EdgeFunctionError(
        err instanceof Error ? err.message : `Edge function "${functionName}" failed`,
        undefined,
        functionName,
        err
      )
    }
  }

  // Default: use supabase client
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (error) {
    throw new EdgeFunctionError(
      error.message || `Edge function "${functionName}" failed`,
      undefined,
      functionName,
      error
    )
  }

  if (data === null || data === undefined) {
    throw new EdgeFunctionError(
      `Edge function "${functionName}" returned no data`,
      undefined,
      functionName
    )
  }

  return data
}

/**
 * Type definitions for LinkedIn Edge Function requests/responses
 */

export interface SendLinkedInMessageRequest {
  leadId: string
  message: string
  useSalesNavigator?: boolean
}

export interface SendLinkedInMessageResponse {
  success: boolean
  messageId?: string
  conversationId?: string
}

export interface SendConnectionRequestRequest {
  leadId: string
  message?: string
}

export interface SendConnectionRequestResponse {
  success: boolean
  requestId?: string
}

export interface LikePostRequest {
  leadId: string
  postUrl: string
}

export interface LikePostResponse {
  success: boolean
}

export interface CommentOnPostRequest {
  leadId: string
  postUrl: string
  comment: string
}

export interface CommentOnPostResponse {
  success: boolean
  commentId?: string
}

export interface CreateScheduleRequest {
  cadenceId: string
  cadenceStepId: string
  leadId: string
  scheduledAt: string
  timezone: string
  messageText?: string
}

export interface CreateScheduleResponse {
  success: boolean
  scheduleId: string
}

export interface BulkCreateSchedulesRequest {
  schedules: Omit<CreateScheduleRequest, 'success'>[]
}

export interface BulkCreateSchedulesResponse {
  success: boolean
  scheduleIds: string[]
  failedCount?: number
}

// LinkedIn Inbox Types
export interface GetChatsRequest {
  limit?: number
  cursor?: string
}

export interface ChatItem {
  id: string
  provider_id: string | null
  name: string
  profile_picture_url: string | null
  profile_url: string | null
  attendee_id: string | null
  last_message: {
    text: string
    timestamp: string
    is_from_self: boolean
  } | null
  unread_count: number
  updated_at: string
}

export interface GetChatsResponse {
  success: boolean
  notConnected?: boolean
  error?: string
  chats: ChatItem[]
  cursor: string | null
  hasMore: boolean
}

export interface GetMessagesRequest {
  chatId: string
  limit?: number
  cursor?: string
}

export interface MessageItem {
  id: string
  chat_id: string
  text: string
  timestamp: string
  is_from_self: boolean
  sender_id: string
  attachments: Array<{
    type: string
    url?: string
    name?: string
  }>
  // Read receipt info
  is_read?: boolean
  read_at?: string | null
  seen_by?: string[]
  status?: string
}

export interface GetMessagesResponse {
  success: boolean
  messages: MessageItem[]
  cursor: string | null
  hasMore: boolean
}

export interface SendChatMessageRequest {
  chatId: string
  message: string
}

export interface SendChatMessageResponse {
  success: boolean
  messageId?: string
}

// LinkedIn Connection Types
export interface ConnectLinkedInRequest {
  successRedirectUrl?: string
  failureRedirectUrl?: string
}

export interface ConnectLinkedInResponse {
  success: boolean
  authUrl: string
  expiresOn: string
}

export interface DisconnectLinkedInResponse {
  success: boolean
  message: string
}

// Sender Persona
export interface SenderPersona {
  id?: string
  user_id?: string
  org_id?: string
  full_name: string
  role: string
  company: string
  value_proposition: string
  credibility?: string
  communication_style: 'founder_to_founder' | 'expert_consultant' | 'peer_casual' | 'executive_brief'
  signature?: string
  created_at?: string
  updated_at?: string
}

// Quality Check
export interface QualityCheck {
  humanScore: number
  issues: string[]
  suggestion: string
  hasCliches: boolean
}

// AI Research + Generate Types
export interface AIGenerateRequest {
  leadId: string
  stepType: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
  messageTemplate?: string
  researchPrompt?: string
  tone?: 'professional' | 'casual' | 'friendly'
  language?: string
  additionalUrls?: string[]
  postContext?: string
  exampleMessages?: string[]
  exampleNotes?: string[]
  // New structured fields
  senderPersona?: SenderPersona | null
  objective?: string | null
  structure?: string | null
  writingPrinciples?: string[]
  antiPatterns?: string[]
  customInstructions?: string
  // Regeneration context
  regenerateHint?: 'shorter' | 'more_casual' | 'different_angle' | null
}

export interface AIProfileSummary {
  name: string
  headline: string
  company: string
  location?: string
  summary?: string
  recentPosts: Array<{ text: string; date?: string }>
}

export interface AIResearchInsight {
  title: string
  snippet: string
  url: string
}

export interface AIGenerateResponse {
  success: boolean
  generatedMessage: string
  generatedSubject?: string
  research: {
    profileSummary: AIProfileSummary
    webInsights: AIResearchInsight[]
    researchFailed: boolean
    researchSummary: string | null
  }
  qualityCheck: QualityCheck | null
  metadata: {
    researchTimeMs: number
    generationTimeMs: number
    totalTimeMs: number
    totalInsights: number
    sourcesUsed: string[]
  }
}

// AI Polish Prompt Types
export interface AIPolishPromptRequest {
  description: string
  promptType?: 'message' | 'research'
  stepType?: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
  tone?: 'professional' | 'casual' | 'friendly'
  language?: string
}

export interface AIPolishPromptResponse {
  success: boolean
  polishedPrompt: string
}

// Example Sections & Messages
export interface ExampleSection {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface ExampleMessage {
  id: string
  section_id: string
  owner_id: string
  body: string
  quality_note: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// AI Prompt (stored in DB)
export interface AIPrompt {
  id: string
  owner_id: string
  name: string
  prompt_type: 'message' | 'research'
  step_type: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email' | null
  description: string | null
  prompt_body: string
  tone: 'professional' | 'casual' | 'friendly'
  language: string
  is_default: boolean
  // New structured fields
  objective: 'first_touch' | 'follow_up' | 're_engage' | 'break_up' | 'referral' | null
  structure: string | null
  writing_principles: string[]
  anti_patterns: string[]
  created_at: string
  updated_at: string
}
