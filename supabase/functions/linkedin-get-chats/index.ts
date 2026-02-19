// Edge Function: Get LinkedIn Chats
// GET /functions/v1/linkedin-get-chats
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createSupabaseClient, getAuthContext, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface ChatAttendee {
  id: string
  name?: string
  profile_url?: string
  profile_picture_url?: string
  is_self?: boolean
}

interface UnipileChat {
  id: string
  account_id: string
  provider: string
  provider_id?: string
  name?: string
  attendees?: ChatAttendee[]
  last_message?: {
    id: string
    text?: string
    timestamp?: string
    sender_id?: string
  }
  unread_count?: number
  updated_at?: string
  created_at?: string
}

interface UnipileChatsResponse {
  items: UnipileChat[]
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
      return jsonResponse({
        success: false,
        notConnected: true,
        error: 'No LinkedIn account connected. Please connect your LinkedIn account in Settings.',
        chats: [],
      })
    }

    // Parse query parameters for pagination
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const cursor = url.searchParams.get('cursor') || undefined

    // Fetch chats from Unipile
    const unipile = createUnipileClient()
    const result = await unipile.listChats(unipileAccountId, limit, cursor)

    if (!result.success) {
      console.error('listChats failed:', result.error)
      // Check if this is an account-related error (expired/disconnected)
      const errorLower = (result.error || '').toLowerCase()
      if (
        errorLower.includes('account') ||
        errorLower.includes('unauthorized') ||
        errorLower.includes('401') ||
        errorLower.includes('403') ||
        errorLower.includes('not found') ||
        errorLower.includes('404') ||
        errorLower.includes('expired') ||
        errorLower.includes('disconnected') ||
        errorLower.includes('reconnect')
      ) {
        // Mark the account as disconnected in the DB
        const supabase = createSupabaseClient()
        await supabase
          .from('unipile_accounts')
          .update({ status: 'disconnected' })
          .eq('account_id', unipileAccountId)
        console.log('Marked Unipile account as disconnected due to API error')
        return jsonResponse({
          success: false,
          notConnected: true,
          error: 'LinkedIn session expired. Please reconnect your account in Settings.',
          chats: [],
        })
      }
      return errorResponse(result.error || 'Failed to fetch chats')
    }

    const chatsData = result.data as UnipileChatsResponse

    // If no chats returned and no cursor (first page), verify the account is still valid
    if ((!chatsData?.items || chatsData.items.length === 0) && !cursor) {
      console.log('No chats returned, verifying Unipile account status...')
      const accountCheck = await unipile.getAccounts()
      if (accountCheck.success && accountCheck.data) {
        const accounts = (accountCheck.data as { items?: Array<{ id: string; type: string; status?: string }> }).items || []
        const linkedinAccount = accounts.find(a => a.id === unipileAccountId)
        console.log('Account check result:', JSON.stringify(linkedinAccount))
        if (!linkedinAccount) {
          console.log('Unipile account not found - marking as disconnected')
          const supabase = createSupabaseClient()
          await supabase
            .from('unipile_accounts')
            .update({ status: 'disconnected' })
            .eq('account_id', unipileAccountId)
          return jsonResponse({
            success: false,
            notConnected: true,
            error: 'LinkedIn account no longer connected. Please reconnect in Settings.',
            chats: [],
          })
        }
        // Check if account status indicates it's disconnected
        const accountStatus = (linkedinAccount as { status?: string }).status
        if (accountStatus && accountStatus !== 'OK' && accountStatus !== 'CONNECTED' && accountStatus !== 'ok' && accountStatus !== 'connected') {
          console.log(`Unipile account status is "${accountStatus}" - marking as disconnected`)
          const supabase = createSupabaseClient()
          await supabase
            .from('unipile_accounts')
            .update({ status: 'disconnected' })
            .eq('account_id', unipileAccountId)
          return jsonResponse({
            success: false,
            notConnected: true,
            error: `LinkedIn connection status: ${accountStatus}. Please reconnect in Settings.`,
            chats: [],
          })
        }
        console.log('Unipile account exists and appears valid, but no chats found')
      }
    }

    // Helper function to determine display name from chat data
    const getDisplayName = (chat: UnipileChat, attendee?: ChatAttendee): string => {
      if (chat.name && chat.name.trim() !== '') {
        return chat.name
      }
      if (attendee?.name && attendee.name.trim() !== '') {
        return attendee.name
      }
      if (attendee?.profile_url) {
        const urlMatch = attendee.profile_url.match(/\/in\/([^\/\?]+)/)
        if (urlMatch) {
          return urlMatch[1]
            .replace(/-/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        }
      }
      return 'Unknown'
    }

    // First pass: transform chats and identify those needing additional lookups
    const initialChats = (chatsData?.items || []).map((chat: UnipileChat) => {
      const otherAttendee = chat.attendees?.find((a) => !a.is_self) || chat.attendees?.[0]
      const displayName = getDisplayName(chat, otherAttendee)
      const hasProfilePicture = !!otherAttendee?.profile_picture_url

      return {
        id: chat.id,
        provider_id: chat.provider_id,
        name: displayName,
        profile_picture_url: otherAttendee?.profile_picture_url || null,
        profile_url: otherAttendee?.profile_url || null,
        attendee_id: otherAttendee?.id || null,
        last_message: chat.last_message
          ? {
              text: chat.last_message.text || '',
              timestamp: chat.last_message.timestamp,
              is_from_self: chat.last_message.sender_id === chat.attendees?.find((a) => a.is_self)?.id,
            }
          : null,
        unread_count: chat.unread_count || 0,
        updated_at: chat.updated_at,
        needsLookup: displayName === 'Unknown',
        needsPicture: !hasProfilePicture,
      }
    })

    // Second pass: fetch additional details for chats with unknown names
    // Process ALL unknown chats to ensure we resolve as many names as possible
    const unknownChats = initialChats.filter(c => c.needsLookup)
    console.log(`Total unknown chats: ${unknownChats.length}`)

    if (unknownChats.length > 0) {
      console.log(`Fetching additional details for ${unknownChats.length} chats with unknown names`)

      // Keep track of identifiers we've already looked up to avoid duplicates
      const profileCache = new Map<string, { name?: string; profile_url?: string; profile_picture_url?: string }>()

      // Helper function to look up profile and extract name
      const lookupProfile = async (identifier: string): Promise<{ name?: string; profile_url?: string; profile_picture_url?: string } | null> => {
        if (!identifier) return null

        // Check cache first
        if (profileCache.has(identifier)) {
          return profileCache.get(identifier) || null
        }

        try {
          const profileResult = await unipile.getProfile(unipileAccountId, identifier)

          if (profileResult.success && profileResult.data) {
            const profile = profileResult.data as {
              first_name?: string
              last_name?: string
              name?: string
              public_identifier?: string
              profile_picture_url?: string
              profile_picture_url_large?: string
            }

            // Construct name from profile
            let userName = ''
            if (profile.first_name || profile.last_name) {
              userName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            } else if (profile.name) {
              userName = profile.name
            } else if (profile.public_identifier) {
              userName = profile.public_identifier
                .replace(/-/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
            }

            const result = {
              name: userName || undefined,
              profile_picture_url: profile.profile_picture_url_large || profile.profile_picture_url,
            }

            profileCache.set(identifier, result)
            return result
          }
        } catch (e) {
          console.error(`Profile lookup error for ${identifier}:`, e)
        }

        profileCache.set(identifier, {})
        return null
      }

      // Process chats in batches of 10 to avoid overwhelming the API
      const batchSize = 10
      for (let i = 0; i < unknownChats.length; i += batchSize) {
        const batch = unknownChats.slice(i, i + batchSize)

        await Promise.all(
          batch.map(async (chat) => {
            try {
              // Strategy 1: Try to get chat details which should include attendees
              const chatDetailResult = await unipile.getChat(chat.id)

              if (chatDetailResult.success && chatDetailResult.data) {
                const chatDetail = chatDetailResult.data as UnipileChat
                const otherAttendee = chatDetail.attendees?.find((a: ChatAttendee) => !a.is_self) || chatDetail.attendees?.[0]

                if (otherAttendee) {
                  // Save attendee_id for later use
                  chat.attendee_id = otherAttendee.id || chat.attendee_id
                  chat.profile_url = otherAttendee.profile_url || chat.profile_url
                  chat.profile_picture_url = otherAttendee.profile_picture_url || chat.profile_picture_url

                  const newName = getDisplayName(chatDetail, otherAttendee)
                  if (newName !== 'Unknown') {
                    chat.name = newName
                    console.log(`Resolved name for chat ${chat.id} via chat details: ${newName}`)
                    return
                  }
                }
              }

              // Strategy 2: Try getting chat attendees directly
              if (chat.name === 'Unknown') {
                const attendeesResult = await unipile.getChatAttendees(chat.id)

                if (attendeesResult.success && attendeesResult.data) {
                  const attendeesData = attendeesResult.data as { items?: ChatAttendee[] } | ChatAttendee[]
                  const attendees = Array.isArray(attendeesData) ? attendeesData : (attendeesData.items || [])
                  const otherAttendee = attendees.find((a: ChatAttendee) => !a.is_self) || attendees[0]

                  if (otherAttendee) {
                    chat.attendee_id = otherAttendee.id || chat.attendee_id
                    chat.profile_url = otherAttendee.profile_url || chat.profile_url
                    chat.profile_picture_url = otherAttendee.profile_picture_url || chat.profile_picture_url

                    if (otherAttendee.name) {
                      chat.name = otherAttendee.name
                      console.log(`Resolved name for chat ${chat.id} via chat attendees: ${otherAttendee.name}`)
                      return
                    }
                  }
                }
              }

              // Strategy 3: Get messages and look up sender profile
              if (chat.name === 'Unknown') {
                const messagesResult = await unipile.getMessages(chat.id, 10)

                if (messagesResult.success && messagesResult.data) {
                  const messagesData = messagesResult.data as {
                    items?: Array<{
                      sender_id?: string
                      is_sender?: boolean
                      sender?: { id?: string; name?: string; profile_picture_url?: string }
                    }>
                  }
                  const messages = messagesData.items || []

                  // Try to find the other person from messages
                  for (const msg of messages) {
                    // Check if sender object has name directly
                    if (msg.sender?.name && !msg.is_sender) {
                      chat.name = msg.sender.name
                      chat.profile_picture_url = msg.sender.profile_picture_url || chat.profile_picture_url
                      console.log(`Resolved name for chat ${chat.id} from message sender: ${msg.sender.name}`)
                      return
                    }

                    // Try to look up profile by sender_id
                    const senderId = msg.sender_id || msg.sender?.id
                    if (senderId && !msg.is_sender) {
                      const profileData = await lookupProfile(senderId)
                      if (profileData?.name) {
                        chat.name = profileData.name
                        chat.profile_picture_url = profileData.profile_picture_url || chat.profile_picture_url
                        console.log(`Resolved name for chat ${chat.id} via sender profile: ${profileData.name}`)
                        return
                      }
                    }
                  }
                }
              }

              // Strategy 4: Try to look up profile using attendee_id directly
              if (chat.name === 'Unknown' && chat.attendee_id) {
                console.log(`Trying attendee_id lookup for chat ${chat.id}: ${chat.attendee_id}`)
                const profileData = await lookupProfile(chat.attendee_id)
                if (profileData?.name) {
                  chat.name = profileData.name
                  chat.profile_picture_url = profileData.profile_picture_url || chat.profile_picture_url
                  console.log(`Resolved name for chat ${chat.id} via attendee profile: ${profileData.name}`)
                  return
                }
              }

              // Strategy 5: Try extracting username from profile_url if available
              if (chat.name === 'Unknown' && chat.profile_url) {
                const urlMatch = chat.profile_url.match(/linkedin\.com\/in\/([^\/\?]+)/)
                if (urlMatch) {
                  const username = urlMatch[1]
                  const profileData = await lookupProfile(username)
                  if (profileData?.name) {
                    chat.name = profileData.name
                    chat.profile_picture_url = profileData.profile_picture_url || chat.profile_picture_url
                    console.log(`Resolved name for chat ${chat.id} via URL username: ${profileData.name}`)
                    return
                  }
                }
              }

              if (chat.name === 'Unknown') {
                console.log(`Could not resolve name for chat ${chat.id}`)
              }
            } catch (e) {
              console.error(`Error fetching details for chat ${chat.id}:`, e)
            }
          })
        )
      }
    }

    // Third pass: fetch profile pictures for ALL chats that have names but no pictures
    // This includes chats that originally needed lookup but now have names, and chats that always had names but no pictures
    const chatsNeedingPictures = initialChats.filter(c => !c.profile_picture_url && c.name !== 'Unknown')
    console.log(`Total chats needing pictures: ${chatsNeedingPictures.length}`)

    if (chatsNeedingPictures.length > 0) {
      console.log(`Fetching profile pictures for ${chatsNeedingPictures.length} chats`)

      // Keep track of identifiers we've already looked up
      const pictureCache = new Map<string, string | null>()

      // Process in batches of 10 to avoid overwhelming the API
      const pictureBatchSize = 10
      for (let i = 0; i < chatsNeedingPictures.length; i += pictureBatchSize) {
        const batch = chatsNeedingPictures.slice(i, i + pictureBatchSize)

        await Promise.all(
          batch.map(async (chat) => {
            try {
              // Try to get identifier from profile_url or attendee_id
              let identifier: string | null = null

              // Extract username from profile_url if available
              if (chat.profile_url) {
                const urlMatch = chat.profile_url.match(/linkedin\.com\/in\/([^\/\?]+)/)
                if (urlMatch) {
                  identifier = urlMatch[1]
                }
              }

              // Fallback to attendee_id
              if (!identifier && chat.attendee_id) {
                identifier = chat.attendee_id
              }

              // Try to extract from chat name if it looks like a LinkedIn group/InMail name
              if (!identifier && chat.name) {
                // Skip group chats or InMail threads (they don't have individual profiles)
                const isGroupOrInmail = chat.name.includes('+') ||
                  chat.name.toLowerCase().includes('hiring') ||
                  chat.name.toLowerCase().includes('proyecto') ||
                  chat.name.toLowerCase().includes('cómo') ||
                  chat.name.toLowerCase().includes('doble') ||
                  chat.name.length > 40
                if (isGroupOrInmail) {
                  return // Skip group chats
                }
              }

              if (!identifier) {
                return
              }

              // Check cache first
              if (pictureCache.has(identifier)) {
                const cachedPicture = pictureCache.get(identifier)
                if (cachedPicture) {
                  chat.profile_picture_url = cachedPicture
                }
                return
              }

              // Look up user profile to get picture URL
              const profileResult = await unipile.getProfile(unipileAccountId, identifier)

              if (profileResult.success && profileResult.data) {
                const profile = profileResult.data as {
                  profile_picture_url?: string
                  profile_picture_url_large?: string
                }

                // Prefer large picture if available
                const pictureUrl = profile.profile_picture_url_large || profile.profile_picture_url

                if (pictureUrl) {
                  chat.profile_picture_url = pictureUrl
                  pictureCache.set(identifier, pictureUrl)
                  console.log(`Got profile picture for ${chat.name}`)
                } else {
                  pictureCache.set(identifier, null)
                }
              }
            } catch (e) {
              console.error(`Error fetching picture for chat ${chat.id}:`, e)
            }
          })
        )
      }
    }

    // Fourth pass: fetch last message for chats that don't have message preview
    const chatsNeedingLastMessage = initialChats.filter(c => !c.last_message?.text)
    console.log(`Total chats needing last message: ${chatsNeedingLastMessage.length}`)

    if (chatsNeedingLastMessage.length > 0) {
      console.log(`Fetching last messages for ${chatsNeedingLastMessage.length} chats`)

      // Process in batches of 10 to avoid overwhelming the API
      const messageBatchSize = 10
      for (let i = 0; i < chatsNeedingLastMessage.length; i += messageBatchSize) {
        const batch = chatsNeedingLastMessage.slice(i, i + messageBatchSize)

        await Promise.all(
          batch.map(async (chat) => {
            try {
              // Fetch just 1 message to get the latest
              const messagesResult = await unipile.getMessages(chat.id, 1)

              if (messagesResult.success && messagesResult.data) {
                const messagesData = messagesResult.data as {
                  items?: Array<{
                    id?: string
                    text?: string
                    timestamp?: string
                    sender_id?: string
                    is_sender?: boolean
                    sender?: { id?: string }
                  }>
                }
                const messages = messagesData.items || []

                if (messages.length > 0) {
                  const lastMsg = messages[0]
                  const selfAttendee = initialChats.find(c => c.id === chat.id)

                  chat.last_message = {
                    text: lastMsg.text || '',
                    timestamp: lastMsg.timestamp,
                    is_from_self: lastMsg.is_sender || false,
                  }
                  console.log(`Got last message for chat ${chat.id}: "${(lastMsg.text || '').substring(0, 30)}..."`)
                }
              }
            } catch (e) {
              console.error(`Error fetching last message for chat ${chat.id}:`, e)
            }
          })
        )
      }
    }

    // Remove the internal tracking fields before returning
    const chats = initialChats.map(({ needsLookup, needsPicture, ...chat }) => chat)

    return jsonResponse({
      success: true,
      chats,
      cursor: chatsData?.cursor || null,
      hasMore: !!chatsData?.cursor,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
