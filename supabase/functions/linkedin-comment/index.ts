// Edge Function: Comment on a LinkedIn Post
// POST /functions/v1/linkedin-comment
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createSupabaseClient, getAuthContext, logActivity, getUnipileAccountId } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface CommentRequest {
  leadId: string
  postId?: string
  postUrl?: string
  comment: string
  cadenceId?: string
  cadenceStepId?: string
  scheduleId?: string
  instanceId?: string
  ownerId?: string // For service-role calls from process-queue
  orgId?: string   // For service-role calls from process-queue
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

    // Parse request body
    const body: CommentRequest = await req.json()
    const { leadId, postId, postUrl, comment, cadenceId, cadenceStepId, scheduleId, instanceId, ownerId, orgId } = body

    const ctx = await getAuthContext(authHeader, { ownerId, orgId })
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    if (!leadId) {
      return errorResponse('leadId is required')
    }

    if (!postId && !postUrl) {
      return errorResponse('Either postId or postUrl is required')
    }

    if (!comment) {
      return errorResponse('comment is required')
    }

    // Get Unipile account ID for this user
    const unipileAccountId = await getUnipileAccountId(ctx.userId)
    if (!unipileAccountId) {
      return errorResponse('No Unipile account connected. Please connect your LinkedIn account in Settings.')
    }

    // Extract post ID from URL if needed
    const targetPostId = postId || extractPostId(postUrl)
    if (!targetPostId) {
      return errorResponse('Could not extract post ID from URL')
    }

    const supabase = createSupabaseClient()

    // Comment on the post via Unipile
    const unipile = createUnipileClient()
    const result = await unipile.commentOnPost({
      accountId: unipileAccountId,
      postId: targetPostId,
      text: comment,
    })

    if (!result.success) {
      // Log failure
      await logActivity({
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        cadenceId,
        cadenceStepId,
        leadId,
        action: 'linkedin_comment',
        status: 'failed',
        details: { error: result.error, postId: targetPostId },
      })

      return errorResponse(result.error || 'Failed to comment on post')
    }

    // Log success
    await logActivity({
      ownerId: ctx.userId,
      orgId: ctx.orgId,
      cadenceId,
      cadenceStepId,
      leadId,
      action: 'linkedin_comment',
      status: 'ok',
      details: { postId: targetPostId, commentId: result.data?.id },
    })

    // Update schedule and instance if provided
    if (scheduleId) {
      await supabase
        .from('schedules')
        .update({ status: 'executed', updated_at: new Date().toISOString() })
        .eq('id', scheduleId)
    }

    if (instanceId) {
      await supabase
        .from('lead_step_instances')
        .update({
          status: 'sent',
          result_snapshot: result.data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', instanceId)
    }

    return jsonResponse({
      success: true,
      postId: targetPostId,
      commentId: result.data?.id,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})

// Extract post ID from LinkedIn URL - returns full URN format for Unipile API
function extractPostId(url: string | null | undefined): string | null {
  if (!url) return null

  // If the URL already contains a full URN, extract it
  // Match: urn:li:activity:1234567890 or urn:li:ugcPost:1234567890 or urn:li:share:1234567890
  const fullUrnMatch = url.match(/(urn:li:(?:activity|ugcPost|share):\d+)/)
  if (fullUrnMatch) return fullUrnMatch[1]

  // Match patterns like:
  // https://www.linkedin.com/posts/username_activity-1234567890_
  // https://www.linkedin.com/feed/update/activity:1234567890
  const activityMatch = url.match(/activity[:-](\d+)/)
  if (activityMatch) {
    // Return in full URN format as required by Unipile API
    return `urn:li:activity:${activityMatch[1]}`
  }

  return null
}
