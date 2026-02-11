import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useCadence } from '@/contexts/CadenceContext'
import { useAuth } from '@/contexts/AuthContext'
import { AIGenerateDialog } from '@/components/AIGenerateDialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  SkipForward,
  Pause,
  Sparkles,
  Calendar,
  Mail,
  Linkedin,
  User,
  Building,
  Briefcase,
  Globe,
  Phone,
  Loader2,
  MessageSquare,
  FileText,
  UserPlus,
  CheckCircle,
  XCircle,
  LinkIcon,
  Repeat2,
  AlertCircle,
  ThumbsUp,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

// Type for tracking individual lead results
interface LeadResult {
  leadId: string
  leadName: string
  status: 'sent' | 'alreadyConnected' | 'failed' | 'noPost'
  error?: string
}
import { STEP_TYPE_CONFIG } from '@/types'
import { callEdgeFunction } from '@/lib/edge-functions'

// Type for LinkedIn post
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
}

// Available variables for message templates
const VARIABLES = [
  { name: '{{first_name}}', label: 'First Name', icon: User },
  { name: '{{last_name}}', label: 'Last Name', icon: User },
  { name: '{{email}}', label: 'Email', icon: Mail },
  { name: '{{company}}', label: 'Company', icon: Building },
  { name: '{{title}}', label: 'Title', icon: Briefcase },
  { name: '{{linkedin_url}}', label: 'LinkedIn URL', icon: Linkedin },
  { name: '{{timezone}}', label: 'Timezone', icon: Globe },
  { name: '{{phone}}', label: 'Phone', icon: Phone },
]

export function LeadStepExecution() {
  const { cadenceId, stepId } = useParams<{ cadenceId: string; stepId: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const {
    cadences,
    leads,
    templates,
    executeStepForLead,
    markStepDoneForLead,
    removeLeadFromCadence,
  } = useCadence()

  const [currentLeadIndex, setCurrentLeadIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    sent: 0,
    alreadyConnected: 0,
    failed: 0,
    noPost: 0,
    currentLeadName: '',
  })
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [leadResults, setLeadResults] = useState<LeadResult[]>([])
  const [latestPost, setLatestPost] = useState<LinkedInPost | null>(null)
  const [loadingPost, setLoadingPost] = useState(false)
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [showAIDialog, setShowAIDialog] = useState(false)

  // Get cadence and step data
  const cadence = cadences.find((c) => c.id === cadenceId)
  const step = cadence?.steps?.find((s) => s.id === stepId)
  const stepConfig = step?.config_json as Record<string, unknown> | undefined

  // Get leads at this step
  const leadsAtStep = useMemo(() => {
    return leads.filter(
      (lead) => lead.cadence_id === cadenceId && lead.current_step_id === stepId && lead.status === 'active'
    )
  }, [leads, cadenceId, stepId])

  const currentLead = leadsAtStep[currentLeadIndex]
  const totalLeads = leadsAtStep.length

  // Get sorted steps and find next step with leads
  const sortedSteps = useMemo(() => {
    if (!cadence?.steps) return []
    return [...cadence.steps].sort((a, b) => {
      if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
      return a.order_in_day - b.order_in_day
    })
  }, [cadence?.steps])

  const nextStepWithLeads = useMemo(() => {
    if (!cadence || !stepId) return null
    const currentStepIndex = sortedSteps.findIndex((s) => s.id === stepId)
    if (currentStepIndex === -1) return null

    // Look for the next step that has active leads
    for (let i = currentStepIndex + 1; i < sortedSteps.length; i++) {
      const nextStep = sortedSteps[i]
      const leadsAtNextStep = leads.filter(
        (lead) => lead.cadence_id === cadenceId && lead.current_step_id === nextStep.id && lead.status === 'active'
      )
      if (leadsAtNextStep.length > 0) {
        return { step: nextStep, leadCount: leadsAtNextStep.length }
      }
    }
    return null
  }, [cadence, stepId, sortedSteps, leads, cadenceId])

  // Initialize message from step config or template
  useEffect(() => {
    const templateMessage = stepConfig?.message_template as string | undefined
    setMessage(templateMessage || '')
  }, [stepConfig])

  // Load template content when template is selected
  useEffect(() => {
    if (selectedTemplateId && selectedTemplateId !== 'none') {
      const template = templates.find((t) => t.id === selectedTemplateId)
      if (template) {
        setMessage(template.body_template)
      }
    }
  }, [selectedTemplateId, templates])

  // Fetch latest post for LinkedIn Comment and Like steps
  useEffect(() => {
    const fetchLatestPost = async () => {
      if (!currentLead || !session?.access_token || (step?.step_type !== 'linkedin_comment' && step?.step_type !== 'linkedin_like')) {
        setLatestPost(null)
        return
      }

      setLoadingPost(true)
      try {
        const response = await callEdgeFunction<{
          success: boolean
          posts: LinkedInPost[]
        }>(
          'linkedin-get-user-posts',
          { leadId: currentLead.id },
          session.access_token
        )

        if (response.success && response.posts && response.posts.length > 0) {
          setLatestPost(response.posts[0])
        } else {
          setLatestPost(null)
        }
      } catch (error) {
        console.error('Error fetching posts:', error)
        setLatestPost(null)
      } finally {
        setLoadingPost(false)
      }
    }

    fetchLatestPost()
  }, [currentLead?.id, session?.access_token, step?.step_type])

  // Render message preview with variables replaced
  const previewMessage = useMemo(() => {
    if (!currentLead || !message) return ''
    return message
      .replace(/\{\{first_name\}\}/g, currentLead.first_name || '')
      .replace(/\{\{last_name\}\}/g, currentLead.last_name || '')
      .replace(/\{\{email\}\}/g, currentLead.email || '')
      .replace(/\{\{company\}\}/g, currentLead.company || '')
      .replace(/\{\{title\}\}/g, currentLead.title || '')
      .replace(/\{\{linkedin_url\}\}/g, currentLead.linkedin_url || '')
      .replace(/\{\{timezone\}\}/g, currentLead.timezone || '')
      .replace(/\{\{phone\}\}/g, currentLead.phone || '')
  }, [message, currentLead])

  // Insert variable at cursor position
  const insertVariable = (variable: string) => {
    const textarea = messageTextareaRef.current
    if (!textarea) {
      setMessage((prev) => prev + variable)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = message.substring(0, start) + variable + message.substring(end)
    setMessage(newValue)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  }

  // Navigate to previous/next lead
  const goToPreviousLead = () => {
    if (currentLeadIndex > 0) {
      setCurrentLeadIndex(currentLeadIndex - 1)
    }
  }

  const goToNextLead = () => {
    if (currentLeadIndex < totalLeads - 1) {
      setCurrentLeadIndex(currentLeadIndex + 1)
    }
  }

  // Send message to current lead
  const handleSend = async () => {
    if (!currentLead || !step || !cadence) return
    setSending(true)

    try {
      const renderedMessage = previewMessage

      if (!STEP_TYPE_CONFIG[step.step_type].isManual) {
        await executeStepForLead({
          leadId: currentLead.id,
          stepId: step.id,
          cadenceId: cadence.id,
          message: renderedMessage,
          postUrl: latestPost?.url,
        })
      }

      await markStepDoneForLead(currentLead.id, step.id, cadence.id)
      const successMessage =
        step.step_type === 'linkedin_connect'
          ? `Connection request sent to ${currentLead.first_name}!`
          : step.step_type === 'linkedin_like'
          ? `Liked ${currentLead.first_name}'s post!`
          : step.step_type === 'linkedin_comment'
          ? `Comment sent to ${currentLead.first_name}!`
          : `Message sent to ${currentLead.first_name}!`
      toast.success(successMessage)

      // Move to next lead if available
      if (currentLeadIndex < totalLeads - 1) {
        setCurrentLeadIndex(currentLeadIndex + 1)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Send to all leads
  const handleSendAll = async () => {
    if (!step || !cadence || leadsAtStep.length === 0 || !session?.access_token) return
    setSendingAll(true)

    // Initialize progress and results
    setProgress({
      current: 0,
      total: leadsAtStep.length,
      sent: 0,
      alreadyConnected: 0,
      failed: 0,
      noPost: 0,
      currentLeadName: '',
    })
    setLeadResults([])

    let sentCount = 0
    let alreadyConnectedCount = 0
    let errorCount = 0
    let noPostCount = 0
    const results: LeadResult[] = []

    for (let i = 0; i < leadsAtStep.length; i++) {
      const lead = leadsAtStep[i]
      const leadName = `${lead.first_name} ${lead.last_name}`

      // Update progress with current lead
      setProgress(prev => ({
        ...prev,
        current: i + 1,
        currentLeadName: leadName,
      }))

      try {
        const renderedMessage = message
          .replace(/\{\{first_name\}\}/g, lead.first_name || '')
          .replace(/\{\{last_name\}\}/g, lead.last_name || '')
          .replace(/\{\{email\}\}/g, lead.email || '')
          .replace(/\{\{company\}\}/g, lead.company || '')
          .replace(/\{\{title\}\}/g, lead.title || '')
          .replace(/\{\{linkedin_url\}\}/g, lead.linkedin_url || '')
          .replace(/\{\{timezone\}\}/g, lead.timezone || '')
          .replace(/\{\{phone\}\}/g, lead.phone || '')

        // For linkedin_comment and linkedin_like, fetch each lead's latest post
        let leadPostUrl: string | undefined
        if (step.step_type === 'linkedin_comment' || step.step_type === 'linkedin_like') {
          try {
            const postsResponse = await callEdgeFunction<{
              success: boolean
              posts: LinkedInPost[]
            }>(
              'linkedin-get-user-posts',
              { leadId: lead.id },
              session.access_token
            )

            if (postsResponse.success && postsResponse.posts && postsResponse.posts.length > 0) {
              leadPostUrl = postsResponse.posts[0].url
            }

            if (!leadPostUrl) {
              // No post available for this lead
              noPostCount++
              setProgress(prev => ({ ...prev, noPost: noPostCount }))
              results.push({ leadId: lead.id, leadName, status: 'noPost' })
              // Wait before next lead
              if (i < leadsAtStep.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000))
              }
              continue
            }
          } catch {
            // Failed to fetch posts, mark as no post
            noPostCount++
            setProgress(prev => ({ ...prev, noPost: noPostCount }))
            results.push({ leadId: lead.id, leadName, status: 'noPost', error: 'Could not fetch posts' })
            if (i < leadsAtStep.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }
            continue
          }
        }

        if (!STEP_TYPE_CONFIG[step.step_type].isManual) {
          const result = await executeStepForLead({
            leadId: lead.id,
            stepId: step.id,
            cadenceId: cadence.id,
            message: renderedMessage,
            postUrl: leadPostUrl || latestPost?.url,
          })

          // Check if already connected (for linkedin_connect step type)
          if (step.step_type === 'linkedin_connect' && result?.alreadyConnected) {
            alreadyConnectedCount++
            setProgress(prev => ({ ...prev, alreadyConnected: alreadyConnectedCount }))
            results.push({ leadId: lead.id, leadName, status: 'alreadyConnected' })
          } else {
            sentCount++
            setProgress(prev => ({ ...prev, sent: sentCount }))
            results.push({ leadId: lead.id, leadName, status: 'sent' })
          }
        } else {
          sentCount++
          setProgress(prev => ({ ...prev, sent: sentCount }))
          results.push({ leadId: lead.id, leadName, status: 'sent' })
        }

        await markStepDoneForLead(lead.id, step.id, cadence.id)

        // Wait 3 seconds between sends (except for the last one)
        if (i < leadsAtStep.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      } catch (error) {
        console.error(`Error sending to ${lead.first_name}:`, error)
        errorCount++
        setProgress(prev => ({ ...prev, failed: errorCount }))
        results.push({
          leadId: lead.id,
          leadName,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    setSendingAll(false)
    setLeadResults(results)
    setShowResultsModal(true)
  }

  // Close results modal and navigate back to cadence page
  const handleCloseResults = () => {
    setShowResultsModal(false)
    // Navigate back to the cadence page so user can select the next day/step to review
    if (cadenceId) {
      navigate(`/cadences/${cadenceId}`)
    }
  }

  // Skip current lead's step
  const handleSkipStep = async () => {
    if (!currentLead || !step || !cadence) return

    try {
      await markStepDoneForLead(currentLead.id, step.id, cadence.id)
      toast.success(`Skipped step for ${currentLead.first_name}`)

      if (currentLeadIndex < totalLeads - 1) {
        setCurrentLeadIndex(currentLeadIndex + 1)
      }
    } catch (error) {
      toast.error('Failed to skip step')
    }
  }

  // Pause lead (remove from cadence)
  const handlePauseLead = async () => {
    if (!currentLead) return

    try {
      await removeLeadFromCadence(currentLead.id)
      toast.success(`${currentLead.first_name} paused`)

      // Adjust index if needed
      if (currentLeadIndex >= totalLeads - 1 && currentLeadIndex > 0) {
        setCurrentLeadIndex(currentLeadIndex - 1)
      }
    } catch (error) {
      toast.error('Failed to pause lead')
    }
  }

  // Auto-navigate to next step with leads when current step has no leads
  // This useEffect MUST be before any conditional returns to follow React hooks rules
  useEffect(() => {
    if (cadence && step && totalLeads === 0 && nextStepWithLeads && cadenceId) {
      // Small delay to allow state to settle
      const timer = setTimeout(() => {
        navigate(`/cadences/${cadenceId}/steps/${nextStepWithLeads.step.id}/execute`, { replace: true })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [cadence, step, totalLeads, nextStepWithLeads, cadenceId, navigate])

  if (!cadence || !step) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Cadence or step not found</p>
      </div>
    )
  }

  if (totalLeads === 0) {
    // If there's a next step with leads, show loading while redirecting
    if (nextStepWithLeads) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            Navigating to {nextStepWithLeads.step.step_label}...
          </p>
          <p className="text-sm text-muted-foreground">
            {nextStepWithLeads.leadCount} lead{nextStepWithLeads.leadCount > 1 ? 's' : ''} waiting
          </p>
        </div>
      )
    }

    // No more steps with leads
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <p className="text-muted-foreground">All steps completed!</p>
        <p className="text-sm text-muted-foreground">No more leads waiting in this cadence</p>
        <Button variant="outline" onClick={() => navigate(`/cadences/${cadenceId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Cadence
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/cadences/${cadenceId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold">{step.step_label}</h1>
              <p className="text-sm text-muted-foreground">
                {STEP_TYPE_CONFIG[step.step_type].label} • {cadence.name}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Lead {currentLeadIndex + 1} of {totalLeads}
          </span>
          <Button variant="outline" size="icon" onClick={goToPreviousLead} disabled={currentLeadIndex === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextLead}
            disabled={currentLeadIndex === totalLeads - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side - Message Composition */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {/* Lead Info */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              {currentLead?.first_name} {currentLead?.last_name}
            </h2>
            <p className="text-muted-foreground">
              {currentLead?.title} at {currentLead?.company}
            </p>
            <div className="mt-2 flex items-center gap-4 text-sm">
              {currentLead?.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {currentLead.email}
                </span>
              )}
              {currentLead?.linkedin_url && (
                <a
                  href={currentLead.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Linkedin className="h-4 w-4" />
                  LinkedIn
                </a>
              )}
            </div>
          </div>

          {/* Message Editor */}
          <div className="flex-1 space-y-4">
            {/* Latest Post Preview for LinkedIn Comment and Like */}
            {(step.step_type === 'linkedin_comment' || step.step_type === 'linkedin_like') && (
              <div>
                <h3 className="mb-2 font-medium">Latest Post</h3>
                {loadingPost ? (
                  <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/30">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading post...</span>
                  </div>
                ) : latestPost ? (
                  <div className="border rounded-lg p-4 bg-muted/30">
                    {/* Repost indicator */}
                    {latestPost.is_repost && (
                      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                        <Repeat2 className="h-3 w-3" />
                        <span>Reposted</span>
                      </div>
                    )}

                    {/* Post Text (user's comment on repost) */}
                    {latestPost.text && (
                      <p className="text-sm whitespace-pre-wrap line-clamp-4 mb-3">
                        {latestPost.text}
                      </p>
                    )}

                    {/* Original Post (embedded for reposts) */}
                    {latestPost.is_repost && latestPost.original_post ? (
                      <div className="border rounded-md p-3 bg-background">
                        {/* Original Author */}
                        {latestPost.original_post.author && (
                          <div className="flex items-center gap-2 mb-2">
                            {latestPost.original_post.author.profile_picture_url ? (
                              <img
                                src={latestPost.original_post.author.profile_picture_url}
                                alt=""
                                className="w-8 h-8 rounded-full"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium">{latestPost.original_post.author.name}</p>
                              {latestPost.original_post.author.headline && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {latestPost.original_post.author.headline}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Original Post Image */}
                        {latestPost.original_post.image_url && (
                          <div className="mb-2 rounded overflow-hidden">
                            <img
                              src={latestPost.original_post.image_url}
                              alt="Original post image"
                              className="w-full max-h-40 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          </div>
                        )}

                        {/* Original Post Text */}
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">
                          {latestPost.original_post.text || 'No text content'}
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Regular Post Image */}
                        {latestPost.image_url && (
                          <div className="mb-3 rounded-md overflow-hidden">
                            <img
                              src={latestPost.image_url}
                              alt="Post image"
                              className="w-full max-h-48 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          </div>
                        )}

                        {/* Regular Post Text (if no text was shown above) */}
                        {!latestPost.text && (
                          <p className="text-sm text-muted-foreground">No text content</p>
                        )}
                      </>
                    )}

                    {/* Engagement stats */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                      {latestPost.likes_count !== undefined && (
                        <span>{latestPost.likes_count} likes</span>
                      )}
                      {latestPost.comments_count !== undefined && (
                        <span>{latestPost.comments_count} comments</span>
                      )}
                      {latestPost.url && (
                        <a
                          href={latestPost.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View on LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-muted/30 text-center">
                    <p className="text-sm text-muted-foreground">
                      No posts found or unable to fetch posts
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The user may have privacy settings that prevent viewing their posts
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Hide message editor for linkedin_like - it doesn't need a message */}
            {step.step_type !== 'linkedin_like' && (
              <div>
                <h3 className="mb-2 font-medium">
                  {step.step_type === 'linkedin_connect'
                    ? 'Connection Note (optional)'
                    : step.step_type === 'linkedin_comment'
                    ? 'Your Comment'
                    : 'Message'}
                </h3>
                <Textarea
                  ref={messageTextareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={step.step_type === 'linkedin_connect'
                    ? "Add a note to your connection request (optional)..."
                    : step.step_type === 'linkedin_comment'
                    ? "Write your comment here..."
                    : "Write your message here. Use {{first_name}}, {{company}}, etc. for personalization..."}
                  className={step.step_type === 'linkedin_comment' ? "min-h-[100px] resize-none" : "min-h-[200px] resize-none"}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {step.step_type === 'linkedin_connect'
                    ? "Tip: You can send a connection request without a note, or add a personalized message."
                    : step.step_type === 'linkedin_comment'
                    ? "Tip: Write a thoughtful comment that adds value to the conversation."
                    : `Tip: Use {{nombre}} or {{first_name}} to personalize each message.`}
                </p>
              </div>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSkipStep} disabled={sending || sendingAll}>
                <SkipForward className="mr-2 h-4 w-4" />
                Skip Step
              </Button>
              <Button variant="outline" onClick={handlePauseLead} disabled={sending || sendingAll}>
                <Pause className="mr-2 h-4 w-4" />
                Pause Lead
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAIDialog(true)}
                disabled={
                  sending ||
                  sendingAll ||
                  !currentLead ||
                  step?.step_type === 'linkedin_like'
                }
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate with AI
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled>
                <Calendar className="mr-2 h-4 w-4" />
                Schedule
              </Button>
              <Button
                onClick={handleSend}
                disabled={
                  sending ||
                  sendingAll ||
                  (step.step_type !== 'linkedin_connect' && step.step_type !== 'linkedin_like' && !message.trim()) ||
                  (step.step_type === 'linkedin_like' && !latestPost?.url)
                }
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {step.step_type === 'linkedin_connect'
                      ? 'Connecting...'
                      : step.step_type === 'linkedin_like'
                      ? 'Liking...'
                      : 'Sending...'}
                  </>
                ) : step.step_type === 'linkedin_connect' ? (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Connect
                  </>
                ) : step.step_type === 'linkedin_like' ? (
                  <>
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Like
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Side - Variables & Preview */}
        <div className="w-80 border-l bg-muted/30 flex flex-col">
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
          {/* Templates */}
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" />
                Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Variables */}
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium">Variables</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Drag to textarea or click to insert
            </p>
            <div className="space-y-1">
              {VARIABLES.map((variable) => {
                const Icon = variable.icon
                return (
                  <button
                    key={variable.name}
                    onClick={() => insertVariable(variable.name)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{variable.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium">Preview</h3>
            <div className="rounded-lg border bg-white p-3">
              <p className="whitespace-pre-wrap text-sm">
                {previewMessage || (
                  <span className="italic text-muted-foreground">
                    Your message preview will appear here...
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Lead Data */}
          {currentLead && (
            <div>
              <h3 className="mb-2 text-sm font-medium">LEAD DATA</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">First Name:</span>
                  <span>{currentLead.first_name || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Name:</span>
                  <span>{currentLead.last_name || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="truncate ml-2">{currentLead.email || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company:</span>
                  <span>{currentLead.company || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Title:</span>
                  <span>{currentLead.title || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LinkedIn URL:</span>
                  <span className="truncate ml-2 max-w-[120px]">
                    {currentLead.linkedin_url || 'Not set'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timezone:</span>
                  <span>{currentLead.timezone || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone:</span>
                  <span>{currentLead.phone || 'Not set'}</span>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Fixed Bottom Section */}
          <div className="border-t bg-muted/30 p-4 space-y-4">
          {/* Progress Indicator */}
          {sendingAll && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {step.step_type === 'linkedin_connect'
                        ? 'Connecting...'
                        : step.step_type === 'linkedin_like'
                        ? 'Liking posts...'
                        : 'Sending...'}
                    </span>
                    <span className="text-muted-foreground">
                      {progress.current} / {progress.total}
                    </span>
                  </div>

                  <Progress value={(progress.current / progress.total) * 100} className="h-2" />

                  {progress.currentLeadName && (
                    <p className="text-xs text-muted-foreground truncate">
                      Current: {progress.currentLeadName}
                    </p>
                  )}

                  {/* Stats */}
                  <div className={`grid gap-2 pt-2 border-t ${(step.step_type === 'linkedin_comment' || step.step_type === 'linkedin_like') ? 'grid-cols-3' : step.step_type === 'linkedin_connect' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span className="text-sm font-medium text-green-600">{progress.sent}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {step.step_type === 'linkedin_like' ? 'Liked' : 'Sent'}
                      </p>
                    </div>
                    {step.step_type === 'linkedin_connect' && (
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <LinkIcon className="h-3 w-3 text-blue-500" />
                          <span className="text-sm font-medium text-blue-600">{progress.alreadyConnected}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Connected</p>
                      </div>
                    )}
                    {(step.step_type === 'linkedin_comment' || step.step_type === 'linkedin_like') && (
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-500" />
                          <span className="text-sm font-medium text-amber-600">{progress.noPost}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">No Post</p>
                      </div>
                    )}
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <XCircle className="h-3 w-3 text-red-500" />
                        <span className="text-sm font-medium text-red-600">{progress.failed}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Send All Button */}
          <Button
            className="w-full"
            variant="default"
            onClick={handleSendAll}
            disabled={
              sending ||
              sendingAll ||
              (step.step_type !== 'linkedin_connect' && step.step_type !== 'linkedin_like' && !message.trim()) ||
              totalLeads === 0
            }
          >
            {sendingAll ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {step.step_type === 'linkedin_connect'
                  ? 'Connecting to all...'
                  : step.step_type === 'linkedin_comment'
                  ? 'Commenting on all...'
                  : step.step_type === 'linkedin_like'
                  ? 'Liking all posts...'
                  : 'Sending to all...'}
              </>
            ) : step.step_type === 'linkedin_connect' ? (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Connect All ({totalLeads})
              </>
            ) : step.step_type === 'linkedin_comment' ? (
              <>
                <MessageSquare className="mr-2 h-4 w-4" />
                Comment All ({totalLeads})
              </>
            ) : step.step_type === 'linkedin_like' ? (
              <>
                <ThumbsUp className="mr-2 h-4 w-4" />
                Like All ({totalLeads})
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send All ({totalLeads})
              </>
            )}
          </Button>
          </div>
        </div>
      </div>

      {/* Results Modal */}
      <Dialog open={showResultsModal} onOpenChange={setShowResultsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-medium">
              {step?.step_type === 'linkedin_connect'
                ? 'Connection Results'
                : step?.step_type === 'linkedin_comment'
                ? 'Comment Results'
                : step?.step_type === 'linkedin_like'
                ? 'Like Results'
                : 'Send Results'}
            </DialogTitle>
          </DialogHeader>

          {/* Summary Stats - Minimalist */}
          <div className={`grid gap-4 py-4 border-b ${(step?.step_type === 'linkedin_comment' || step?.step_type === 'linkedin_like') ? 'grid-cols-3' : step?.step_type === 'linkedin_connect' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="text-center">
              <span className="text-3xl font-semibold text-green-600">
                {leadResults.filter(r => r.status === 'sent').length}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {step?.step_type === 'linkedin_comment'
                  ? 'Commented'
                  : step?.step_type === 'linkedin_like'
                  ? 'Liked'
                  : 'Sent'}
              </p>
            </div>
            {step?.step_type === 'linkedin_connect' && (
              <div className="text-center">
                <span className="text-3xl font-semibold text-blue-600">
                  {leadResults.filter(r => r.status === 'alreadyConnected').length}
                </span>
                <p className="text-xs text-muted-foreground mt-1">Connected</p>
              </div>
            )}
            {(step?.step_type === 'linkedin_comment' || step?.step_type === 'linkedin_like') && (
              <div className="text-center">
                <span className="text-3xl font-semibold text-amber-600">
                  {leadResults.filter(r => r.status === 'noPost').length}
                </span>
                <p className="text-xs text-muted-foreground mt-1">No Post</p>
              </div>
            )}
            <div className="text-center">
              <span className="text-3xl font-semibold text-red-500">
                {leadResults.filter(r => r.status === 'failed').length}
              </span>
              <p className="text-xs text-muted-foreground mt-1">Failed</p>
            </div>
          </div>

          {/* Lead Details - Minimalist */}
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1">
              {leadResults.map((result) => (
                <div
                  key={result.leadId}
                  className="flex items-center justify-between py-2 px-1"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      result.status === 'sent'
                        ? 'bg-green-500'
                        : result.status === 'alreadyConnected'
                        ? 'bg-blue-500'
                        : result.status === 'noPost'
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`} />
                    <span className="text-sm">{result.leadName}</span>
                  </div>
                  <span className={`text-xs ${
                    result.status === 'sent'
                      ? 'text-green-600'
                      : result.status === 'alreadyConnected'
                      ? 'text-blue-600'
                      : result.status === 'noPost'
                      ? 'text-amber-600'
                      : 'text-red-500'
                  }`}>
                    {result.status === 'sent' && (
                      step?.step_type === 'linkedin_comment'
                        ? 'Commented'
                        : step?.step_type === 'linkedin_like'
                        ? 'Liked'
                        : 'Sent'
                    )}
                    {result.status === 'alreadyConnected' && 'Connected'}
                    {result.status === 'noPost' && 'No Post'}
                    {result.status === 'failed' && 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Close Button */}
          <div className="pt-4">
            <Button className="w-full" onClick={handleCloseResults}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Generate Dialog */}
      {currentLead && step && step.step_type !== 'linkedin_like' && (
        <AIGenerateDialog
          open={showAIDialog}
          onOpenChange={setShowAIDialog}
          leadId={currentLead.id}
          leadName={`${currentLead.first_name} ${currentLead.last_name}`}
          stepType={step.step_type as 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment'}
          postContext={latestPost?.text}
          onUseMessage={(msg) => {
            setMessage(msg)
            setShowAIDialog(false)
          }}
        />
      )}
    </div>
  )
}
