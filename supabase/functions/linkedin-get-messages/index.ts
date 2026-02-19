// Edge Function: Get LinkedIn Messages for a Chat
// GET /functions/v1/linkedin-get-messages?chatId={chatId}
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { getAuthContext, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface UnipileMessage {
  id: string
  chat_id: string
  sender_id?: string
  text?: string
  timestamp?: string
  is_sender?: boolean
  // Read receipt fields - Unipile may use different field names
  read_at?: string
  seen_at?: string
  is_read?: boolean
  seen?: boolean
  delivered_at?: string
  status?: string
  // Recipient read status
  recipients_read_at?: Record<string, string>
  seen_by?: string[]
  attachments?: Array<{
    type: string
    url?: string
    name?: string
  }>
}

interface UnipileMessagesResponse {
  items: UnipileMessage[]
  cursor?: string
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const ctx = await getAuthContext(authHeader)
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    // Get Unipile account ID for this user
    const unipileAccountId = await getUnipileAccountId(ctx.userId)
    if (!unipileAccountId) {
      return errorResponse('No LinkedIn account connected. Please connect your LinkedIn account in Settings.')
    }

    // Parse parameters from query string or body
    const url = new URL(req.url)
    let chatId = url.searchParams.get('chatId')
    let limit = parseInt(url.searchParams.get('limit') || '50')
    let cursor = url.searchParams.get('cursor') || undefined

    // Also check body for POST requests
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        chatId = chatId || body.chatId
        limit = body.limit || limit
        cursor = body.cursor || cursor
      } catch {
        // Body might be empty or not JSON, that's ok
      }
    }

    if (!chatId) {
      return errorResponse('chatId is required')
    }

    // Fetch messages from Unipile
    const unipile = createUnipileClient()
    const result = await unipile.getMessages(chatId, limit, cursor)

    if (!result.success) {
      return errorResponse(result.error || 'Failed to fetch messages')
    }

    const messagesData = result.data as UnipileMessagesResponse

    // Log first message to see all available fields from Unipile
    if (messagesData?.items?.length > 0) {
      console.log('Sample message from Unipile (all fields):', JSON.stringify(messagesData.items[0], null, 2))
    }

    // Transform messages - include read status fields
    const messages = (messagesData?.items || []).map((msg: UnipileMessage) => {
      // Determine read status from various possible fields
      const isRead = msg.is_read ??
                     msg.seen ??
                     !!msg.read_at ??
                     !!msg.seen_at ??
                     (msg.status === 'read' || msg.status === 'seen') ??
                     false

      // Get read timestamp from various possible fields
      const readAt = msg.read_at || msg.seen_at || null

      return {
        id: msg.id,
        chat_id: msg.chat_id,
        text: msg.text || '',
        timestamp: msg.timestamp,
        is_from_self: msg.is_sender ?? false,
        sender_id: msg.sender_id,
        attachments: msg.attachments || [],
        // Read receipt info
        is_read: isRead,
        read_at: readAt,
        seen_by: msg.seen_by || [],
        status: msg.status,
      }
    })

    return jsonResponse({
      success: true,
      messages,
      cursor: messagesData?.cursor || null,
      hasMore: !!messagesData?.cursor,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
