import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  callEdgeFunction,
  EdgeFunctionError,
  type SendLinkedInMessageRequest,
  type SendLinkedInMessageResponse,
  type SendConnectionRequestRequest,
  type SendConnectionRequestResponse,
  type LikePostRequest,
  type LikePostResponse,
  type CommentOnPostRequest,
  type CommentOnPostResponse,
} from '@/lib/edge-functions'

/**
 * Options for LinkedIn message mutations
 */
export interface LinkedInMessageOptions {
  useSalesNavigator?: boolean
}

/**
 * Hook for sending LinkedIn messages
 *
 * @returns Mutation object with mutate, isPending, and error
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useSendLinkedInMessage('lead-123', 'Hello!')
 * mutate() // Sends the message
 * ```
 */
export function useSendLinkedInMessage(
  leadId: string,
  message: string,
  options?: LinkedInMessageOptions
) {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) {
        throw new EdgeFunctionError('Not authenticated')
      }

      const payload: SendLinkedInMessageRequest = {
        leadId,
        message,
        useSalesNavigator: options?.useSalesNavigator,
      }

      return callEdgeFunction<SendLinkedInMessageResponse>(
        'linkedin-send-message',
        payload as unknown as Record<string, unknown>,
        session.access_token
      )
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['linkedin-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

/**
 * Hook for sending LinkedIn connection requests
 *
 * @returns Mutation object with mutate, isPending, and error
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useSendConnectionRequest('lead-123', 'Let\'s connect!')
 * mutate() // Sends the connection request
 * ```
 */
export function useSendConnectionRequest(leadId: string, message?: string) {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) {
        throw new EdgeFunctionError('Not authenticated')
      }

      const payload: SendConnectionRequestRequest = {
        leadId,
        message,
      }

      return callEdgeFunction<SendConnectionRequestResponse>(
        'linkedin-send-connection',
        payload as unknown as Record<string, unknown>,
        session.access_token
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

/**
 * Hook for liking a LinkedIn post
 *
 * @returns Mutation object with mutate, isPending, and error
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useLikePost('lead-123', 'https://linkedin.com/post/...')
 * mutate() // Likes the post
 * ```
 */
export function useLikePost(leadId: string, postUrl: string) {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) {
        throw new EdgeFunctionError('Not authenticated')
      }

      const payload: LikePostRequest = {
        leadId,
        postUrl,
      }

      return callEdgeFunction<LikePostResponse>(
        'linkedin-like-post',
        payload as unknown as Record<string, unknown>,
        session.access_token
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

/**
 * Hook for commenting on a LinkedIn post
 *
 * @returns Mutation object with mutate, isPending, and error
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useCommentOnPost('lead-123', 'https://linkedin.com/post/...', 'Great post!')
 * mutate() // Comments on the post
 * ```
 */
export function useCommentOnPost(leadId: string, postUrl: string, comment: string) {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) {
        throw new EdgeFunctionError('Not authenticated')
      }

      const payload: CommentOnPostRequest = {
        leadId,
        postUrl,
        comment,
      }

      return callEdgeFunction<CommentOnPostResponse>(
        'linkedin-comment',
        payload as unknown as Record<string, unknown>,
        session.access_token
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

/**
 * Generic hook for testing any cadence step action
 * This is useful for the "Test Step" button in CadenceBuilder
 */
export interface TestStepParams {
  stepType: string
  leadId: string
  message?: string
  postUrl?: string
  comment?: string
  useSalesNavigator?: boolean
}

export function useTestStep() {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: TestStepParams) => {
      if (!session?.access_token) {
        throw new EdgeFunctionError('Not authenticated')
      }

      const { stepType, leadId, message, postUrl, comment, useSalesNavigator } = params

      // Route to the appropriate Edge Function based on step type
      switch (stepType) {
        case 'linkedin_message':
          if (!message) throw new EdgeFunctionError('Message is required for LinkedIn message')
          return callEdgeFunction<SendLinkedInMessageResponse>(
            'linkedin-send-message',
            { leadId, message, useSalesNavigator },
            session.access_token
          )

        case 'linkedin_connect':
          return callEdgeFunction<SendConnectionRequestResponse>(
            'linkedin-send-connection',
            { leadId, message },
            session.access_token
          )

        case 'linkedin_like':
          if (!postUrl) throw new EdgeFunctionError('Post URL is required for LinkedIn like')
          return callEdgeFunction<LikePostResponse>(
            'linkedin-like-post',
            { leadId, postUrl },
            session.access_token
          )

        case 'linkedin_comment':
          if (!postUrl) throw new EdgeFunctionError('Post URL is required for LinkedIn comment')
          if (!comment) throw new EdgeFunctionError('Comment is required for LinkedIn comment')
          return callEdgeFunction<CommentOnPostResponse>(
            'linkedin-comment',
            { leadId, postUrl, comment },
            session.access_token
          )

        case 'whatsapp':
          // WhatsApp is a manual step - just log the activity
          return callEdgeFunction<{ success: boolean }>(
            'log-activity',
            { leadId, action: 'whatsapp_manual', status: 'ok' },
            session.access_token
          )

        case 'cold_call':
          // Cold calls are manual - just log the activity
          return callEdgeFunction<{ success: boolean }>(
            'log-activity',
            { leadId, action: 'cold_call', status: 'ok' },
            session.access_token
          )

        case 'task':
          // Tasks are manual - just log the activity
          return callEdgeFunction<{ success: boolean }>(
            'log-activity',
            { leadId, action: 'task_completed', status: 'ok' },
            session.access_token
          )

        default:
          throw new EdgeFunctionError(`Unknown step type: ${stepType}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}
