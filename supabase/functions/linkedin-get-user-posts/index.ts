// Edge Function: Get LinkedIn User Posts
// GET /functions/v1/linkedin-get-user-posts?leadId=xxx
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createSupabaseClient, getAuthUser, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface LinkedInPost {
  id: string
  text: string
  url?: string
  created_at?: string
  likes_count?: number
  comments_count?: number
  shares_count?: number
  image_url?: string
  images?: string[]
  is_repost?: boolean
  original_post?: {
    id?: string
    text?: string
    url?: string
    image_url?: string
    author?: {
      name?: string
      headline?: string
      profile_picture_url?: string
    }
  }
  author?: {
    name?: string
    headline?: string
    profile_picture_url?: string
  }
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

    // Get leadId from body
    const body = await req.json().catch(() => ({}))
    const leadId = body.leadId

    if (!leadId) {
      return errorResponse('leadId is required')
    }

    // Get Unipile account ID for this user
    const unipileAccountId = await getUnipileAccountId(user.id)
    if (!unipileAccountId) {
      return errorResponse('No Unipile account connected. Please connect your LinkedIn account in Settings.')
    }

    // Get lead details
    const supabase = createSupabaseClient()
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('owner_id', user.id)
      .single()

    if (leadError || !lead) {
      return errorResponse('Lead not found')
    }

    // Get LinkedIn username from URL
    let linkedinUrl = lead.linkedin_url?.trim()
    if (!linkedinUrl) {
      return errorResponse('Lead does not have a LinkedIn URL')
    }

    // Extract username from URL
    const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/)
    const username = usernameMatch ? usernameMatch[1] : null

    if (!username) {
      return errorResponse('Lead does not have a valid LinkedIn URL')
    }

    console.log(`Fetching posts for LinkedIn user: ${username}`)

    // Create Unipile client and fetch posts
    const unipile = createUnipileClient()

    // First, look up the user profile to get the provider_id
    let userId = username
    const profileResult = await unipile.getProfile(unipileAccountId, username)

    if (profileResult.success && profileResult.data) {
      const profileData = profileResult.data as { provider_id?: string; id?: string }
      if (profileData.provider_id) {
        userId = profileData.provider_id
      } else if (profileData.id) {
        userId = profileData.id
      }
    }

    // Fetch user's posts
    const postsResult = await unipile.getUserPosts(unipileAccountId, userId, 5)

    if (!postsResult.success) {
      console.error('Failed to fetch posts:', postsResult.error)
      return jsonResponse({
        success: true,
        posts: [],
        message: 'Could not fetch posts - user may have privacy settings enabled',
      })
    }

    // Transform posts data
    const postsData = postsResult.data as { items?: unknown[] } | unknown[]
    const rawPosts = Array.isArray(postsData) ? postsData : (postsData?.items || [])

    const posts: LinkedInPost[] = rawPosts.map((post: unknown) => {
      const p = post as Record<string, unknown>

      // Extract image URL from various possible fields
      let imageUrl: string | undefined
      const images: string[] = []

      // Check for direct image_url field
      if (p.image_url) {
        imageUrl = p.image_url as string
        images.push(imageUrl)
      }

      // Check for images array
      if (Array.isArray(p.images)) {
        (p.images as string[]).forEach((img) => {
          if (typeof img === 'string') images.push(img)
          else if (img && typeof img === 'object' && (img as Record<string, unknown>).url) {
            images.push((img as Record<string, unknown>).url as string)
          }
        })
        if (!imageUrl && images.length > 0) imageUrl = images[0]
      }

      // Check for media array (common in LinkedIn API responses)
      if (Array.isArray(p.media)) {
        (p.media as Record<string, unknown>[]).forEach((m) => {
          if (m.url) images.push(m.url as string)
          else if (m.original_url) images.push(m.original_url as string)
        })
        if (!imageUrl && images.length > 0) imageUrl = images[0]
      }

      // Check for attachments
      if (Array.isArray(p.attachments)) {
        (p.attachments as Record<string, unknown>[]).forEach((a) => {
          if (a.image_url) images.push(a.image_url as string)
          else if (a.url && (a.type === 'image' || a.media_type === 'image')) {
            images.push(a.url as string)
          }
        })
        if (!imageUrl && images.length > 0) imageUrl = images[0]
      }

      // Check for repost/reshare data
      const isRepost = Boolean(p.is_repost)
      let originalPost: LinkedInPost['original_post'] | undefined

      if (isRepost) {
        // Log full post data for reposts to understand the structure
        console.log('Repost detected, full post data:', JSON.stringify(p, null, 2))

        // Try various possible field names for the original post
        const originalData = (p.original_post || p.reshared_post || p.parent_post ||
          p.shared_content || p.reshare_context?.parent || p.original) as Record<string, unknown> | undefined

        if (originalData) {
          // Extract original post image
          let originalImageUrl: string | undefined
          if (originalData.image_url) {
            originalImageUrl = originalData.image_url as string
          } else if (Array.isArray(originalData.images) && originalData.images.length > 0) {
            const firstImg = originalData.images[0]
            originalImageUrl = typeof firstImg === 'string' ? firstImg : (firstImg as Record<string, unknown>)?.url as string
          } else if (Array.isArray(originalData.media) && originalData.media.length > 0) {
            originalImageUrl = ((originalData.media[0] as Record<string, unknown>)?.url ||
              (originalData.media[0] as Record<string, unknown>)?.original_url) as string
          } else if (Array.isArray(originalData.attachments)) {
            const imgAttachment = (originalData.attachments as Record<string, unknown>[]).find(
              a => a.type === 'image' || a.media_type === 'image' || a.url
            )
            if (imgAttachment) {
              originalImageUrl = (imgAttachment.image_url || imgAttachment.url) as string
            }
          }

          originalPost = {
            id: (originalData.id || originalData.provider_id || originalData.social_id || '') as string,
            text: (originalData.text || originalData.content || originalData.commentary || '') as string,
            url: (originalData.url || originalData.post_url || originalData.share_url || '') as string,
            image_url: originalImageUrl,
            author: originalData.author as LinkedInPost['original_post']['author'],
          }
        }
      }

      // Get the post ID - prefer social_id for Unipile API interactions (reactions, comments)
      // social_id is the full URN format like "urn:li:activity:7332661864792854528"
      const socialId = (p.social_id || '') as string
      const postId = socialId || (p.id || p.provider_id || '') as string

      // Construct URL from ID if not provided (LinkedIn activity URL format)
      let postUrl = (p.url || p.post_url || '') as string
      if (!postUrl && postId) {
        // If we have a social_id (URN format), use it directly in the URL
        if (socialId && socialId.startsWith('urn:li:')) {
          postUrl = `https://www.linkedin.com/feed/update/${socialId}`
        } else {
          // Otherwise construct the URL assuming it's an activity ID
          postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${postId}`
        }
      }

      // Log for debugging
      console.log(`Post: id=${p.id}, social_id=${socialId}, constructed postId=${postId}`)

      return {
        id: postId,
        text: (p.text || p.content || p.commentary || '') as string,
        url: postUrl,
        created_at: (p.created_at || p.timestamp || '') as string,
        likes_count: (p.likes_count || p.num_likes || p.reactions_count || 0) as number,
        comments_count: (p.comments_count || p.num_comments || 0) as number,
        shares_count: (p.shares_count || p.num_shares || 0) as number,
        image_url: imageUrl,
        images: images.length > 0 ? images : undefined,
        is_repost: isRepost,
        original_post: originalPost,
        author: p.author as LinkedInPost['author'],
      }
    })

    console.log(`Found ${posts.length} posts for user ${username}`)

    return jsonResponse({
      success: true,
      posts,
      leadName: `${lead.first_name} ${lead.last_name}`,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
