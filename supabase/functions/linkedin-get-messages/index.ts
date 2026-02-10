// Edge Function: Get LinkedIn Messages for a Chat
// GET /functions/v1/linkedin-get-messages?chatId={chatId}
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { getAuthUser, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface UnipileMessage {
  id: string
  chat_id: string
  sender_id?: string
  text?: string
  timestamp?: string
  is_sender?: boolean
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

    const user = await getAuthUser(authHeader)
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }

    // Get Unipile account ID for this user
    const unipileAccountId = await getUnipileAccountId(user.id)
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

    // Transform messages
    const messages = (messagesData?.items || []).map((msg: UnipileMessage) => ({
      id: msg.id,
      chat_id: msg.chat_id,
      text: msg.text || '',
      timestamp: msg.timestamp,
      is_from_self: msg.is_sender ?? false,
      sender_id: msg.sender_id,
      attachments: msg.attachments || [],
    }))

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
