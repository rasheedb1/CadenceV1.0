import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Send,
  Check,
  X,
  Loader2,
  Building2,
  Plus,
  CheckCircle2,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { callEdgeFunction } from '@/lib/edge-functions'
import { LLMModelSelector } from '@/components/LLMModelSelector'
import type { AccountMapCompany } from '@/types/account-mapping'
import type { ICPBuilderData } from '@/types/icp-builder'
import type {
  ChatMessage,
  SuggestedCompany,
  SuggestedCompanyWithDecision,
  ChatDiscoverResponse,
} from '@/types/company-discovery-chat'

interface CompanyDiscoveryChatProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountMapId: string
  ownerId: string
  icpDescription: string | null
  icpBuilderData: ICPBuilderData | null
  existingCompanies: AccountMapCompany[]
  excludedCompanyNames?: string[]
  onAddCompany: (company: Omit<AccountMapCompany, 'id' | 'created_at' | 'updated_at' | 'org_id'>) => Promise<AccountMapCompany | null>
}

// ── Suggestion Card ──

function SuggestionCard({
  company,
  onAccept,
  onReject,
}: {
  company: SuggestedCompanyWithDecision
  onAccept: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isAccepted = company.decision === 'accepted'
  const isRejected = company.decision === 'rejected'
  const isAdded = company.decision === 'added'
  const isDuplicate = company.decision === 'duplicate'
  const isPending = company.decision === 'pending'

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        (isAccepted || isAdded) && 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30',
        isRejected && 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20 opacity-60',
        isDuplicate && 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30',
        isPending && 'hover:border-primary/30'
      )}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{company.company_name}</span>
          {company.industry && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">· {company.industry}</span>
          )}
        </div>
        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {isPending ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
                onClick={onAccept}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                onClick={onReject}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Badge
              variant={isDuplicate ? 'outline' : (isAccepted || isAdded) ? 'default' : 'secondary'}
              className={cn(
                'text-[10px]',
                (isAccepted || isAdded) && 'bg-green-600 hover:bg-green-600',
                isDuplicate && 'border-amber-500 text-amber-700 dark:text-amber-400'
              )}
            >
              {isDuplicate ? 'Duplicate' : isAdded ? 'Added' : isAccepted ? 'Selected' : 'Skipped'}
            </Badge>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 pt-0 border-t border-border/50">
          <div className="flex flex-wrap gap-1.5 mt-2">
            {company.industry && (
              <Badge variant="secondary" className="text-[10px]">
                {company.industry}
              </Badge>
            )}
            {company.company_size && (
              <Badge variant="outline" className="text-[10px]">
                {company.company_size}
              </Badge>
            )}
            {company.location && (
              <Badge variant="outline" className="text-[10px]">
                {company.location}
              </Badge>
            )}
          </div>

          {company.description && (
            <p className="text-xs text-muted-foreground mt-2">
              {company.description}
            </p>
          )}

          {company.reason_for_suggesting && (
            <p className="text-xs text-primary/70 mt-1.5 italic">
              &ldquo;{company.reason_for_suggesting}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── ICP Criteria Card ──

function ICPCriteriaCard({ data }: { data: ICPBuilderData }) {
  const sections: Array<{ label: string; values: string[] }> = []

  if (data.productCategory) sections.push({ label: 'Product', values: [data.productCategory] })
  if (data.industries.length > 0) sections.push({ label: 'Industries', values: data.industries })
  if (data.companySizes.length > 0) sections.push({ label: 'Size', values: data.companySizes })
  if (data.businessModels.length > 0) sections.push({ label: 'Model', values: data.businessModels })
  if (data.targetRegions.length > 0) sections.push({ label: 'Regions', values: data.targetRegions })
  if (data.companyStages.length > 0) sections.push({ label: 'Stage', values: data.companyStages })
  if (data.buyingSignals.length > 0) sections.push({ label: 'Signals', values: data.buyingSignals })

  if (sections.length === 0) return null

  return (
    <div className="mt-1.5 rounded-lg border bg-background/80 p-2.5 text-foreground">
      <div className="space-y-1.5">
        {sections.map(s => (
          <div key={s.label} className="flex items-start gap-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0 w-16 pt-0.5">{s.label}</span>
            <div className="flex flex-wrap gap-1">
              {s.values.map(v => (
                <Badge key={v} variant="secondary" className="text-[10px] font-normal">{v}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──

export function CompanyDiscoveryChat({
  open,
  onOpenChange,
  accountMapId,
  ownerId,
  icpDescription,
  icpBuilderData,
  existingCompanies,
  excludedCompanyNames = [],
  onAddCompany,
}: CompanyDiscoveryChatProps) {
  const { session } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [acceptedCompanies, setAcceptedCompanies] = useState<SuggestedCompany[]>([])
  const [rejectedCompanies, setRejectedCompanies] = useState<SuggestedCompany[]>([])
  const [savedCount, setSavedCount] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set())
  const [duplicateNames, setDuplicateNames] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check if we have ICP data to auto-send
  const hasICPData = useCallback((): boolean => {
    if (icpBuilderData) {
      const bd = icpBuilderData
      return !!(bd.companyDescription || bd.productCategory || bd.industries.length > 0 || bd.companySizes.length > 0 || bd.targetRegions.length > 0)
    }
    return !!icpDescription
  }, [icpBuilderData, icpDescription])

  // Track whether auto-send has been triggered for this dialog open
  const autoSentRef = useRef(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMessages([])
      setInputValue('')
      setAcceptedCompanies([])
      setRejectedCompanies([])
      setSavedCount(0)
      setIsSaving(false)
      setSavedNames(new Set())
      setDuplicateNames([])
      autoSentRef.current = false
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open])

  // Auto-scroll to bottom only when new messages are added or loading state changes
  const messageCountRef = useRef(0)
  useEffect(() => {
    if (messages.length > messageCountRef.current || isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    messageCountRef.current = messages.length
  }, [messages.length, isLoading])

  // Core send function that accepts explicit text
  const sendMessage = useCallback(async (text: string, currentMessages: ChatMessage[] = []) => {
    if (!text.trim() || !session?.access_token) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsLoading(true)

    try {
      const conversationHistory = [...currentMessages, userMsg].map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }))

      const response = await callEdgeFunction<ChatDiscoverResponse>(
        'chat-discover-companies',
        {
          messages: conversationHistory,
          icpContext: {
            icpDescription,
            builderData: icpBuilderData,
          },
          acceptedCompanies,
          rejectedCompanies,
          existingCompanyNames: [
            ...existingCompanies.map(c => c.company_name),
            ...Array.from(savedNames),
          ],
          excludedCompanyNames,
          userMessage: text.trim(),
        },
        session.access_token,
        { timeoutMs: 120000 }
      )

      // Filter out companies already in the account map or saved in this session
      const knownNames = new Set([
        ...existingCompanies.map(c => c.company_name.toLowerCase()),
        ...Array.from(savedNames).map(n => n.toLowerCase()),
      ])
      const filteredCompanies = (response.companies || []).filter(
        (c: { company_name: string }) => !knownNames.has(c.company_name.toLowerCase())
      )

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: response.responseText || 'Here are some suggestions:',
        companies: filteredCompanies.map(c => ({
          ...c,
          decision: 'pending' as const,
        })),
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [session, icpDescription, icpBuilderData, acceptedCompanies, rejectedCompanies, existingCompanies, excludedCompanyNames, savedNames])

  // Wrapper for the input field send
  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || isLoading) return
    sendMessage(text, messages)
  }, [inputValue, isLoading, messages, sendMessage])

  // Auto-send ICP as first message when dialog opens
  useEffect(() => {
    if (!open || autoSentRef.current || isLoading) return
    if (!session?.access_token) return

    if (hasICPData()) {
      autoSentRef.current = true
      sendMessage('Find companies matching my ICP criteria', [])
    }
  }, [open, session, isLoading, hasICPData, sendMessage])

  const handleAccept = useCallback((messageId: string, companyIndex: number) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId || !msg.companies) return msg
      const updatedCompanies = [...msg.companies]
      const company = updatedCompanies[companyIndex]
      if (company.decision === 'accepted') {
        updatedCompanies[companyIndex] = { ...company, decision: 'pending' }
        setAcceptedCompanies(ac => ac.filter(c => c.company_name !== company.company_name))
      } else {
        updatedCompanies[companyIndex] = { ...company, decision: 'accepted' }
        setRejectedCompanies(rc => rc.filter(c => c.company_name !== company.company_name))
        setAcceptedCompanies(ac => [...ac.filter(c => c.company_name !== company.company_name), company])
      }
      return { ...msg, companies: updatedCompanies }
    }))
  }, [])

  const handleReject = useCallback((messageId: string, companyIndex: number) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId || !msg.companies) return msg
      const updatedCompanies = [...msg.companies]
      const company = updatedCompanies[companyIndex]
      if (company.decision === 'rejected') {
        updatedCompanies[companyIndex] = { ...company, decision: 'pending' }
        setRejectedCompanies(rc => rc.filter(c => c.company_name !== company.company_name))
      } else {
        updatedCompanies[companyIndex] = { ...company, decision: 'rejected' }
        setAcceptedCompanies(ac => ac.filter(c => c.company_name !== company.company_name))
        setRejectedCompanies(rc => [...rc.filter(c => c.company_name !== company.company_name), company])
      }
      return { ...msg, companies: updatedCompanies }
    }))
  }, [])

  const handleAddToCompanies = useCallback(async () => {
    if (acceptedCompanies.length === 0 || isSaving) return
    setIsSaving(true)
    setDuplicateNames([])
    try {
      // Check for duplicates against existing companies in the account map
      const existingNormalized = new Set(
        existingCompanies.map(c => c.company_name.toLowerCase())
      )
      const alreadySavedNormalized = new Set(
        Array.from(savedNames).map(n => n.toLowerCase())
      )

      const newCompanies: SuggestedCompany[] = []
      const dupes: string[] = []
      for (const c of acceptedCompanies) {
        const norm = c.company_name.toLowerCase()
        if (existingNormalized.has(norm) || alreadySavedNormalized.has(norm)) {
          dupes.push(c.company_name)
        } else {
          newCompanies.push(c)
        }
      }

      if (dupes.length > 0) {
        setDuplicateNames(dupes)
      }

      // Save only non-duplicate companies
      let count = 0
      const justSaved = new Set<string>()
      for (const c of newCompanies) {
        await onAddCompany({
          account_map_id: accountMapId,
          owner_id: ownerId,
          company_name: c.company_name,
          industry: c.industry,
          company_size: c.company_size,
          website: c.website,
          linkedin_url: null,
          location: c.location,
          description: c.description,
        })
        justSaved.add(c.company_name)
        count++
      }
      if (count > 0) setSavedCount(prev => prev + count)
      // Track saved names so they're excluded from future suggestions
      setSavedNames(prev => new Set([...prev, ...justSaved]))
      // Clear saved companies from accepted list so button resets for next batch
      setAcceptedCompanies([])
      // Mark saved companies as "added" and duplicates as "duplicate" in the message cards
      const dupeSet = new Set(dupes.map(n => n.toLowerCase()))
      setMessages(prev => prev.map(msg => {
        if (!msg.companies) return msg
        return {
          ...msg,
          companies: msg.companies.map(c => {
            if (justSaved.has(c.company_name)) return { ...c, decision: 'added' as const }
            if (dupeSet.has(c.company_name.toLowerCase())) return { ...c, decision: 'duplicate' as const }
            return c
          }),
        }
      }))
    } catch (err) {
      console.error('Failed to save companies:', err)
    } finally {
      setIsSaving(false)
    }
  }, [acceptedCompanies, isSaving, onAddCompany, accountMapId, ownerId, existingCompanies, savedNames])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Discover Companies
          </DialogTitle>
          <DialogDescription>
            Describe what companies you&apos;re looking for. Accept or reject suggestions to refine results.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0">
          {/* Messages area */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-4">
            <div className="space-y-1 pb-2">
              {messages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Describe what companies you&apos;re looking for to get started.
                  </p>
                </div>
              )}

              {messages.map((msg, msgIndex) => (
                <div key={msg.id}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end mb-3">
                      <div className="max-w-[85%]">
                        <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2">
                          <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        {/* Show ICP criteria card for the auto-sent first message */}
                        {msgIndex === 0 && icpBuilderData && msg.text.includes('ICP criteria') && (
                          <ICPCriteriaCard data={icpBuilderData} />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start mb-3">
                      <div className="max-w-[90%]">
                        <div className="bg-muted rounded-lg px-4 py-2 mb-2">
                          <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        {msg.companies && msg.companies.length > 0 && (
                          <div className="space-y-2 ml-2">
                            {msg.companies.map((company, i) => (
                              <SuggestionCard
                                key={`${msg.id}-${i}`}
                                company={company}
                                onAccept={() => handleAccept(msg.id, i)}
                                onReject={() => handleReject(msg.id, i)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start mb-3">
                  <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Searching for companies...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="border-t pt-3 mt-2">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                placeholder={
                  messages.length === 0
                    ? 'Describe what companies you\'re looking for...'
                    : 'Refine: "more like X", "only in LATAM", "bigger companies"...'
                }
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {duplicateNames.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-medium">{duplicateNames.length} duplicate{duplicateNames.length > 1 ? 's' : ''} skipped:</span>{' '}
              {duplicateNames.join(', ')} — already in your company list.
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] ml-1 text-amber-700 hover:text-amber-900"
                onClick={() => setDuplicateNames([])}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <LLMModelSelector />
            {acceptedCompanies.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {acceptedCompanies.length} selected
              </Badge>
            )}
            {savedCount > 0 && (
              <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-600">
                <Check className="h-3 w-3" />
                {savedCount} saved
              </Badge>
            )}
          </div>
          <Button
            onClick={handleAddToCompanies}
            disabled={acceptedCompanies.length === 0 || isSaving}
            className="gap-1"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : acceptedCompanies.length > 0 ? (
              <>
                <Plus className="h-4 w-4" />
                Add {acceptedCompanies.length} to Companies
              </>
            ) : savedCount > 0 ? (
              <>
                <Check className="h-4 w-4" />
                {savedCount} Saved
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add to Companies
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
