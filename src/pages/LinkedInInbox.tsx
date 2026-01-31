import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Send, MessageSquare, Building2, Mail, Linkedin } from 'lucide-react'
import type { LinkedInConversation, LinkedInMessage, Lead } from '@/types'

export function LinkedInInbox() {
  const { user } = useAuth()
  const { leads } = useCadence()
  const queryClient = useQueryClient()

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['linkedin-conversations', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('linkedin_conversations')
        .select('*, linkedin_messages(*)')
        .order('updated_at', { ascending: false })
      if (error) throw error

      return (data || []).map((conv: Record<string, unknown>) => ({
        ...conv,
        messages: conv.linkedin_messages as LinkedInMessage[],
        lead: leads.find((l) => l.id === conv.lead_id),
      })) as (LinkedInConversation & { lead?: Lead })[]
    },
    enabled: !!user && leads.length > 0,
  })

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId)
  const selectedLead = selectedConversation?.lead

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const { data, error } = await supabase
        .from('linkedin_messages')
        .insert({
          conversation_id: conversationId,
          owner_id: user!.id,
          direction: 'outbound',
          body: content,
          provider: 'unipile',
          delivery_status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin-conversations'] })
      setNewMessage('')
    },
  })

  const handleSendMessage = async () => {
    if (!selectedConversationId || !newMessage.trim()) return
    await sendMessageMutation.mutateAsync({
      conversationId: selectedConversationId,
      content: newMessage,
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'replied':
        return 'success'
      case 'awaiting_reply':
        return 'warning'
      case 'failed':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Conversations List */}
      <div className="w-80 border-r">
        <div className="p-4">
          <h2 className="text-lg font-semibold">LinkedIn Inbox</h2>
          <p className="text-sm text-muted-foreground">{conversations.length} conversations</p>
        </div>
        <Separator />
        <ScrollArea className="h-[calc(100vh-8rem)]">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`w-full p-4 text-left transition-colors hover:bg-secondary ${
                    selectedConversationId === conversation.id ? 'bg-secondary' : ''
                  }`}
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {conversation.lead
                          ? `${conversation.lead.first_name[0]}${conversation.lead.last_name[0]}`
                          : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">
                          {conversation.lead
                            ? `${conversation.lead.first_name} ${conversation.lead.last_name}`
                            : 'Unknown'}
                        </p>
                        <Badge variant={getStatusColor(conversation.status) as 'default'}>
                          {conversation.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      {conversation.lead?.company && (
                        <p className="truncate text-sm text-muted-foreground">
                          {conversation.lead.company}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Messages Panel */}
      <div className="flex flex-1 flex-col">
        {selectedConversation ? (
          <>
            <div className="border-b p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>
                    {selectedLead
                      ? `${selectedLead.first_name[0]}${selectedLead.last_name[0]}`
                      : '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {selectedLead
                      ? `${selectedLead.first_name} ${selectedLead.last_name}`
                      : 'Unknown'}
                  </p>
                  {selectedLead?.title && selectedLead?.company && (
                    <p className="text-sm text-muted-foreground">
                      {selectedLead.title} at {selectedLead.company}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {selectedConversation.messages
                  ?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.direction === 'outbound' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          message.direction === 'outbound'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary'
                        }`}
                      >
                        <p className="text-sm">{message.body}</p>
                        <p
                          className={`mt-1 text-xs ${
                            message.direction === 'outbound'
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {new Date(message.created_at).toLocaleTimeString()}
                          {message.direction === 'outbound' && ` • ${message.delivery_status}`}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </ScrollArea>

            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Select a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>

      {/* Lead Details Panel */}
      {selectedLead && (
        <div className="w-72 border-l">
          <div className="p-4">
            <h3 className="font-semibold">Lead Details</h3>
          </div>
          <Separator />
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">
                  {selectedLead.first_name[0]}{selectedLead.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {selectedLead.first_name} {selectedLead.last_name}
                </p>
                {selectedLead.title && (
                  <p className="text-sm text-muted-foreground">{selectedLead.title}</p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {selectedLead.company && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedLead.company}</span>
                </div>
              )}
              {selectedLead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{selectedLead.email}</span>
                </div>
              )}
              {selectedLead.linkedin_url && (
                <div className="flex items-center gap-2 text-sm">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={selectedLead.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-primary hover:underline"
                  >
                    View Profile
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
