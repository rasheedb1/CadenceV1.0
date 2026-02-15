// Unipile API Client for Supabase Edge Functions
// Documentation: https://developer.unipile.com/docs

export interface UnipileConfig {
  dsn: string
  accessToken: string
}

export interface SendMessageParams {
  accountId: string
  chatId?: string
  attendeeId?: string
  text: string
  // Sales Navigator / InMail options
  useSalesNavigator?: boolean
  inmailSubject?: string
}

export type LinkedInApiType = 'classic' | 'recruiter' | 'sales_navigator'

export interface SendConnectionParams {
  accountId: string
  profileId: string
  message?: string
}

export interface LikePostParams {
  accountId: string
  postId: string
  reactionType?: 'LIKE' | 'CELEBRATE' | 'LOVE' | 'INSIGHTFUL' | 'CURIOUS'
}

export interface CommentParams {
  accountId: string
  postId: string
  text: string
}

export interface SendEmailParams {
  accountId: string
  to: Array<{ display_name?: string; identifier: string }>
  subject: string
  body: string
  cc?: Array<{ display_name?: string; identifier: string }>
  bcc?: Array<{ display_name?: string; identifier: string }>
}

export interface UnipileResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export class UnipileClient {
  private baseUrl: string
  private accessToken: string

  constructor(config: UnipileConfig) {
    this.baseUrl = `https://${config.dsn}`
    this.accessToken = config.accessToken
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<UnipileResponse<T>> {
    try {
      const url = `${this.baseUrl}${path}`
      console.log(`Unipile API ${method} ${url}`)
      if (body) {
        console.log('Request body:', JSON.stringify(body, null, 2))
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.accessToken,
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      const responseText = await response.text()
      console.log(`Response status: ${response.status}`)
      console.log('Response body:', responseText)

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorData = JSON.parse(responseText)
          errorMessage = errorData.message || errorData.error || errorData.detail || errorMessage
          console.error('Unipile API error details:', JSON.stringify(errorData, null, 2))
        } catch {
          // Response wasn't JSON
        }
        return {
          success: false,
          error: errorMessage,
        }
      }

      const data = responseText ? JSON.parse(responseText) : {}
      return { success: true, data }
    } catch (error) {
      console.error('Unipile request error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Start a new chat or send message to existing chat
  async sendMessage(params: SendMessageParams): Promise<UnipileResponse> {
    if (params.chatId) {
      // Send to existing chat
      console.log(`Sending message to existing chat: ${params.chatId}`)
      return this.request('POST', `/api/v1/chats/${params.chatId}/messages`, {
        text: params.text,
      })
    } else if (params.attendeeId) {
      // Start new conversation
      // The attendeeId should be a LinkedIn profile identifier
      // Can be: LinkedIn URL, username, or URN
      console.log(`Starting new conversation with attendee: ${params.attendeeId}`)
      console.log(`Account ID: ${params.accountId}`)
      console.log(`Use Sales Navigator: ${params.useSalesNavigator || false}`)

      // Build request body
      const requestBody: Record<string, unknown> = {
        account_id: params.accountId,
        attendees_ids: [params.attendeeId],
        text: params.text,
      }

      // Add Sales Navigator / InMail options if requested
      // According to Unipile docs, the format is linkedin[api] and linkedin[inmail] as top-level params
      if (params.useSalesNavigator) {
        // Try format 1: linkedin as top-level object
        requestBody.linkedin = {
          api: 'sales_navigator',
          inmail: true,
        }
        // Add subject for InMail if provided
        if (params.inmailSubject) {
          requestBody.subject = params.inmailSubject
        }
        console.log('Sending via Sales Navigator InMail')
        console.log('Request body for InMail:', JSON.stringify(requestBody, null, 2))
      }

      // Try with the identifier as provided
      const result = await this.request('POST', '/api/v1/chats', requestBody)

      // If that fails with 422 and NOT using Sales Navigator, try with full LinkedIn URL format
      if (!result.success && result.error?.includes('422') && !params.useSalesNavigator) {
        console.log('First attempt failed, trying with LinkedIn URL format...')
        const linkedinUrl = params.attendeeId.startsWith('http')
          ? params.attendeeId
          : `https://www.linkedin.com/in/${params.attendeeId}`

        return this.request('POST', '/api/v1/chats', {
          account_id: params.accountId,
          attendees_ids: [linkedinUrl],
          text: params.text,
        })
      }

      return result
    }
    return { success: false, error: 'Either chatId or attendeeId is required' }
  }

  // Send an email
  async sendEmail(params: SendEmailParams): Promise<UnipileResponse> {
    console.log(`Sending email via account ${params.accountId} to ${params.to.map(t => t.identifier).join(', ')}`)
    const body: Record<string, unknown> = {
      account_id: params.accountId,
      to: params.to,
      subject: params.subject,
      body: params.body,
    }
    if (params.cc && params.cc.length > 0) body.cc = params.cc
    if (params.bcc && params.bcc.length > 0) body.bcc = params.bcc
    return this.request('POST', '/api/v1/emails', body)
  }

  // Check if an error indicates the recipient is not connected
  isNotConnectedError(error: string | undefined): boolean {
    if (!error) return false
    const notConnectedPatterns = [
      'recipient ID is valid',
      'not connected',
      'not in your network',
      'connection required',
      'profile is not locked',
      'cannot message',
      'first degree connection',  // "The recipient appears not to be first degree connection"
      'not a connection',
      'outside your network',
    ]
    const lowerError = error.toLowerCase()
    return notConnectedPatterns.some(pattern => lowerError.includes(pattern.toLowerCase()))
  }

  // Check if an error indicates the user is already connected
  isAlreadyConnectedError(error: string | undefined): boolean {
    if (!error) return false
    const alreadyConnectedPatterns = [
      'already connected',
      'already a connection',
      'already in your network',
      'already sent',
      'pending invitation',
      'invitation already',
      'connection already exists',
      'already invited',
      'duplicate invitation',
    ]
    const lowerError = error.toLowerCase()
    return alreadyConnectedPatterns.some(pattern => lowerError.includes(pattern.toLowerCase()))
  }

  // Send connection request
  async sendConnection(params: SendConnectionParams): Promise<UnipileResponse> {
    const body: Record<string, unknown> = {
      account_id: params.accountId,
      provider_id: params.profileId,
    }

    // Only include message if provided (allows sending connection without a note)
    if (params.message && params.message.trim()) {
      body.message = params.message.trim()
    }

    console.log('Sending connection request:', JSON.stringify(body, null, 2))
    return this.request('POST', '/api/v1/users/invite', body)
  }

  // Like a post
  async likePost(params: LikePostParams): Promise<UnipileResponse> {
    // Endpoint is POST /api/v1/posts/reaction with all params in body
    // Post ID should be in URN format like "urn:li:activity:7332661864792854528"
    // reaction_type must be lowercase: like, celebrate, support, love, insightful, funny
    const reactionType = params.reactionType ? params.reactionType.toLowerCase() : 'love'
    console.log(`Reacting to post with ID: ${params.postId}, reaction: ${reactionType}`)
    return this.request('POST', '/api/v1/posts/reaction', {
      account_id: params.accountId,
      post_id: params.postId,
      reaction_type: reactionType,
    })
  }

  // Comment on a post
  async commentOnPost(params: CommentParams): Promise<UnipileResponse> {
    // Post ID should be in URN format like "urn:li:activity:7332661864792854528"
    // The URN must be URL-encoded when used in the path
    const encodedPostId = encodeURIComponent(params.postId)
    console.log(`Commenting on post with ID: ${params.postId} (encoded: ${encodedPostId})`)
    return this.request('POST', `/api/v1/posts/${encodedPostId}/comments`, {
      account_id: params.accountId,
      text: params.text,
    })
  }

  // Get user profile by identifier (public username or provider_id)
  async getProfile(accountId: string, identifier: string): Promise<UnipileResponse> {
    // URL encode the identifier in case it contains special characters
    const encodedIdentifier = encodeURIComponent(identifier)
    console.log(`Looking up user profile: identifier=${identifier}, encodedIdentifier=${encodedIdentifier}`)
    return this.request('GET', `/api/v1/users/${encodedIdentifier}?account_id=${accountId}`)
  }

  // List chats
  async listChats(accountId: string, limit = 50, cursor?: string): Promise<UnipileResponse> {
    let url = `/api/v1/chats?account_id=${accountId}&limit=${limit}`
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`
    }
    return this.request('GET', url)
  }

  // Get single chat details (includes attendees)
  async getChat(chatId: string): Promise<UnipileResponse> {
    return this.request('GET', `/api/v1/chats/${chatId}`)
  }

  // Get chat attendees
  async getChatAttendees(chatId: string): Promise<UnipileResponse> {
    return this.request('GET', `/api/v1/chats/${chatId}/attendees`)
  }

  // Get all attendees for an account
  async getAllAttendees(accountId: string, limit = 100, cursor?: string): Promise<UnipileResponse> {
    let url = `/api/v1/chat_attendees?account_id=${accountId}&limit=${limit}`
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`
    }
    return this.request('GET', url)
  }

  // Get messages from a chat
  async getMessages(chatId: string, limit = 50, cursor?: string): Promise<UnipileResponse> {
    let url = `/api/v1/chats/${chatId}/messages?limit=${limit}`
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`
    }
    return this.request('GET', url)
  }

  // Get user's posts
  async getUserPosts(accountId: string, userId: string, limit = 10): Promise<UnipileResponse> {
    return this.request('GET', `/api/v1/users/${userId}/posts?account_id=${accountId}&limit=${limit}`)
  }

  // Get connected accounts
  async getAccounts(): Promise<UnipileResponse> {
    return this.request('GET', '/api/v1/accounts')
  }

  // Search for users on LinkedIn
  async searchUsers(accountId: string, query: string, limit = 10): Promise<UnipileResponse> {
    return this.request('GET', `/api/v1/users/search?account_id=${accountId}&query=${encodeURIComponent(query)}&limit=${limit}`)
  }
}

// Factory function to create client from environment
export function createUnipileClient(): UnipileClient {
  const dsn = Deno.env.get('UNIPILE_DSN')
  const accessToken = Deno.env.get('UNIPILE_ACCESS_TOKEN')

  if (!dsn || !accessToken) {
    throw new Error('UNIPILE_DSN and UNIPILE_ACCESS_TOKEN environment variables are required')
  }

  return new UnipileClient({ dsn, accessToken })
}
