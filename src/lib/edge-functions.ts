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
  token: string
): Promise<T> {
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
