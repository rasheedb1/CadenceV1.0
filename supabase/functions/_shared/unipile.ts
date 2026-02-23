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
  // InMail mode: 'auto' = let Unipile detect, 'sales_navigator' = force SN API
  inmailMode?: 'auto' | 'sales_navigator'
  inmailSubject?: string
  // Deprecated, kept for backward compat
  useSalesNavigator?: boolean
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

      // Determine InMail mode (support both new inmailMode and legacy useSalesNavigator)
      const effectiveInmailMode = params.inmailMode || (params.useSalesNavigator ? 'sales_navigator' : undefined)

      if (effectiveInmailMode) {
        if (effectiveInmailMode === 'sales_navigator') {
          requestBody.linkedin = { api: 'sales_navigator', inmail: true }
        } else {
          // 'auto' mode — let Unipile detect the right API
          requestBody.linkedin = { inmail: true }
        }
        if (params.inmailSubject) {
          requestBody.subject = params.inmailSubject
        }
        console.log(`Sending InMail (mode=${effectiveInmailMode})`)
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

  /**
   * Resolve a LinkedIn profile to its provider_id via Unipile profile lookup.
   * The /api/v1/users/{identifier} endpoint accepts a LinkedIn username slug.
   * Retries up to 3 times with backoff in case of transient failures.
   * Returns the provider_id (format: "ACoAAA...") or null if all attempts fail.
   */
  async resolveProviderId(
    accountId: string,
    username: string,
    _linkedinUrl?: string, // kept for backward compat, not used (Unipile only accepts username/provider_id)
  ): Promise<{ providerId: string | null; error?: string }> {
    let lastError = ''

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const waitSec = attempt * 5
        console.log(`Profile lookup retry ${attempt}/2, waiting ${waitSec}s...`)
        await new Promise(r => setTimeout(r, waitSec * 1000))
      }

      const result = await this.getProfile(accountId, username)

      if (result.success && result.data) {
        const data = result.data as { provider_id?: string; id?: string }
        // ONLY use provider_id — the "id" field is a Unipile internal ID (not a LinkedIn ID)
        // LinkedIn provider_ids start with "ACoAAA"
        const providerId = data.provider_id
        if (providerId && providerId.startsWith('ACoAAA')) {
          console.log(`Resolved provider_id via profile lookup: ${providerId}`)
          return { providerId }
        } else if (providerId) {
          // provider_id exists but unexpected format — log but still use it
          console.warn(`provider_id has unexpected format: ${providerId}`)
          return { providerId }
        } else {
          lastError = `Profile returned but no provider_id field found (keys: ${Object.keys(data).join(', ')})`
          console.warn(lastError, JSON.stringify(result.data).slice(0, 300))
        }
      } else {
        lastError = result.error || 'Unknown error'
        console.warn(`Profile lookup attempt ${attempt + 1} failed: ${lastError}`)
      }
    }

    return { providerId: null, error: lastError }
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

  // Look up search parameter IDs (company, location, industry, etc.)
  // Used to convert human-readable names to numeric IDs required by Sales Navigator filters
  async lookupSearchParameters(accountId: string, type: string, keywords: string, limit = 5): Promise<UnipileResponse> {
    return this.request('GET', `/api/v1/linkedin/search/parameters?account_id=${accountId}&type=${encodeURIComponent(type)}&keywords=${encodeURIComponent(keywords)}&limit=${limit}`)
  }

  // Search Sales Navigator for people
  // Unipile docs: https://developer.unipile.com/docs/linkedin-search
  //
  // Correct formats (Sales Navigator):
  //   company:   { include: ["stringId", ...] }  — STRING IDs from lookupSearchParameters
  //   seniority: { include: ["cxo", "vice_president", ...] }  — enum values
  //   keywords:  string                                        — free text search
  //   NOTE: role filter causes 400 errors — do NOT use it. Use keywords for title filtering instead.
  async searchSalesNavigator(accountId: string, params: {
    keywords?: string
    company_names?: string[]
    title_keywords?: string[]
    location?: string
    company_size_min?: string
    company_size_max?: string
    seniority?: string[]
    limit?: number
    cursor?: string
  }): Promise<UnipileResponse> {
    const body: Record<string, unknown> = {
      api: 'sales_navigator',
      category: 'people',
    }

    // General keywords
    if (params.keywords) body.keywords = params.keywords

    // Company filtering: look up NUMERIC company IDs (required for SN)
    // If lookup fails, use company name as keywords instead of in company filter
    let companyLookupFailed = false
    if (params.company_names?.length) {
      const companyIds: string[] = []
      for (const name of params.company_names) {
        try {
          const lookup = await this.lookupSearchParameters(accountId, 'COMPANY', name, 3)
          if (lookup.success && lookup.data) {
            const data = lookup.data as Record<string, unknown>
            const items = (data?.items || []) as Array<Record<string, unknown>>
            console.log(`Company lookup "${name}": ${items.length} results`, JSON.stringify(items.slice(0, 2)))
            if (items.length > 0 && items[0].id != null) {
              // MUST be string — Unipile rejects numeric IDs
              const stringId = String(items[0].id)
              companyIds.push(stringId)
              console.log(`✓ Resolved company "${name}" → ID "${stringId}"`)
            } else {
              console.warn(`✗ No lookup results for company "${name}"`)
              companyLookupFailed = true
            }
          } else {
            console.warn(`✗ Lookup failed for company "${name}": ${lookup.error}`)
            companyLookupFailed = true
          }
        } catch (e) {
          console.warn(`✗ Exception looking up company "${name}":`, e)
          companyLookupFailed = true
        }
      }
      if (companyIds.length > 0) {
        body.company = { include: companyIds }
      } else if (companyLookupFailed && params.company_names.length > 0) {
        // Fallback: add company name to keywords so it still narrows results
        const companyKeyword = params.company_names[0]
        body.keywords = body.keywords
          ? `${body.keywords} ${companyKeyword}`
          : companyKeyword
        console.log(`⚠ Using company name "${companyKeyword}" as keyword fallback`)
      }
    }

    // Title keywords → added to general keywords (role filter causes 400 errors)
    // We combine title keywords with any existing keywords using OR
    if (params.title_keywords?.length) {
      const titleTerms = params.title_keywords.join(' OR ')
      if (body.keywords) {
        // If we already have keywords (e.g. company name fallback), append title terms
        body.keywords = `${body.keywords} ${titleTerms}`
      } else {
        body.keywords = titleTerms
      }
      console.log(`Title keywords added to search: "${titleTerms}"`)
    }

    // Seniority → seniority.include with proper enum mapping
    // Valid enums: owner/partner, cxo, vice_president, director, experienced_manager,
    //              entry_level_manager, strategic, senior, entry_level, in_training
    if (params.seniority?.length) {
      const seniorityMap: Record<string, string> = {
        'owner': 'owner/partner',
        'partner': 'owner/partner',
        'cxo': 'cxo',
        'vp': 'vice_president',
        'director': 'director',
        'manager': 'experienced_manager',
        'senior': 'senior',
        'entry': 'entry_level',
        'training': 'in_training',
      }
      const mapped = params.seniority
        .map(s => seniorityMap[s.toLowerCase()] || s.toLowerCase())
        .filter((v, i, a) => a.indexOf(v) === i) // dedupe
      if (mapped.length > 0) {
        body.seniority = { include: mapped }
      }
    }

    // Company headcount
    if (params.company_size_min || params.company_size_max) {
      const range: Record<string, number> = {}
      if (params.company_size_min) range.min = parseInt(params.company_size_min, 10)
      if (params.company_size_max) range.max = parseInt(params.company_size_max, 10)
      if (!isNaN(range.min) || !isNaN(range.max)) {
        body.company_headcount = [range]
      }
    }

    // Pagination
    let url = `/api/v1/linkedin/search?account_id=${accountId}`
    if (params.limit) url += `&limit=${params.limit}`
    if (params.cursor) body.cursor = params.cursor

    console.log(`=== SN Search Request ===`)
    console.log(JSON.stringify(body, null, 2))

    const result = await this.request<Record<string, unknown>>('POST', url, body)

    console.log(`=== SN Search Response ===`)
    console.log(`Success: ${result.success}`)
    if (result.data) {
      const data = result.data
      const items = (data?.items || data?.results || []) as unknown[]
      console.log(`Items: ${items.length}, cursor: ${data?.cursor || 'none'}`)
    }

    return result
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
