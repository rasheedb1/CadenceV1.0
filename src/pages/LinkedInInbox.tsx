import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Send, MessageSquare, RefreshCw, Loader2, Settings, ChevronUp as ChevronDown, Check, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type {
  GetChatsResponse,
  MessageItem,
  GetMessagesResponse,
} from '@/lib/edge-functions'

// Auto-refresh interval (30 seconds)
const REFRESH_INTERVAL = 30000

export function LinkedInInbox() {
  const { user, session } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null)
  const [allMessages, setAllMessages] = useState<MessageItem[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Fetch chats from Unipile via edge function
  const {
    data: chatsData,
    isLoading: isLoadingChats,
    isError: isChatsError,
    refetch: refetchChats,
  } = useQuery({
    queryKey: ['linkedin-chats', user?.id],
    queryFn: async (): Promise<GetChatsResponse> => {
      if (!session?.access_token) {
        throw new Error('No session')
      }

      const { data, error } = await supabase.functions.invoke<GetChatsResponse>(
        'linkedin-get-chats',
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      if (error) throw error
      return data!
    },
    enabled: !!user && !!session?.access_token,
    refetchInterval: REFRESH_INTERVAL,
    staleTime: 10000,
  })

  // Fetch messages for selected chat
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
  } = useQuery({
    queryKey: ['linkedin-messages', selectedChatId],
    queryFn: async (): Promise<GetMessagesResponse> => {
      if (!session?.access_token || !selectedChatId) {
        throw new Error('No session or chat selected')
      }

      const { data, error } = await supabase.functions.invoke<GetMessagesResponse>(
        'linkedin-get-messages',
        {
          body: { chatId: selectedChatId },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      if (error) throw error
      return data!
    },
    enabled: !!user && !!session?.access_token && !!selectedChatId,
    refetchInterval: REFRESH_INTERVAL,
    staleTime: 10000,
  })

  // Reset pagination state when chat changes
  useEffect(() => {
    setMessagesCursor(null)
    setAllMessages([])
  }, [selectedChatId])

  // Update all messages when new data comes in
  useEffect(() => {
    if (messagesData?.messages) {
      setAllMessages(messagesData.messages)
      setMessagesCursor(messagesData.cursor)
    }
  }, [messagesData])

  // Load more messages function
  const handleLoadMore = async () => {
    if (!messagesCursor || isLoadingMore || !session?.access_token || !selectedChatId) return

    setIsLoadingMore(true)
    try {
      const { data, error } = await supabase.functions.invoke<GetMessagesResponse>(
        'linkedin-get-messages',
        {
          body: { chatId: selectedChatId, cursor: messagesCursor },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      if (!error && data) {
        setAllMessages((prev) => [...prev, ...data.messages])
        setMessagesCursor(data.cursor)
      }
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ chatId, message }: { chatId: string; message: string }) => {
      if (!session?.access_token) {
        throw new Error('No session')
      }

      const { data, error } = await supabase.functions.invoke('linkedin-send-message', {
        body: {
          chatId,
          message,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (error) throw error
      return data
    },
    onMutate: async ({ chatId, message }) => {
      // Optimistic update - add message to UI immediately
      const optimisticMessage: MessageItem = {
        id: `temp-${Date.now()}`,
        chat_id: chatId,
        text: message,
        timestamp: new Date().toISOString(),
        is_from_self: true,
        sender_id: user?.id || '',
        attachments: [],
      }

      queryClient.setQueryData<GetMessagesResponse>(
        ['linkedin-messages', chatId],
        (old) => {
          if (!old) return { success: true, messages: [optimisticMessage], cursor: null, hasMore: false }
          return {
            ...old,
            messages: [optimisticMessage, ...old.messages],
          }
        }
      )

      return { optimisticMessage }
    },
    onSuccess: () => {
      setNewMessage('')
      // Refetch messages to get the actual message ID
      queryClient.invalidateQueries({ queryKey: ['linkedin-messages', selectedChatId] })
      // Also refresh chats to update last message preview
      queryClient.invalidateQueries({ queryKey: ['linkedin-chats'] })
    },
    onError: (_error, variables, context) => {
      // Revert optimistic update on error
      queryClient.setQueryData<GetMessagesResponse>(
        ['linkedin-messages', variables.chatId],
        (old) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.filter((m) => m.id !== context?.optimisticMessage.id),
          }
        }
      )
    },
  })

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messagesData?.messages])

  const handleSendMessage = async () => {
    if (!selectedChatId || !newMessage.trim()) return
    await sendMessageMutation.mutateAsync({
      chatId: selectedChatId,
      message: newMessage,
    })
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const isYesterday =
      new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString()

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (isYesterday) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  // Show not connected state
  if (chatsData?.notConnected) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md p-8">
          <MessageSquare className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">LinkedIn Not Connected</h2>
          <p className="text-muted-foreground mb-6">
            Connect your LinkedIn account to view and manage your messages directly from Closr.
          </p>
          <Button onClick={() => navigate('/settings')} className="gap-2">
            <Settings className="h-4 w-4" />
            Go to Settings
          </Button>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoadingChats) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading conversations...</p>
          <p className="text-xs text-muted-foreground">This may take ~15 seconds</p>
        </div>
      </div>
    )
  }

  // Error state
  if (isChatsError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md p-8">
          <MessageSquare className="mx-auto mb-4 h-16 w-16 text-destructive" />
          <h2 className="text-xl font-semibold mb-2">Failed to Load Conversations</h2>
          <p className="text-muted-foreground mb-6">
            There was an error loading your LinkedIn conversations. Please try again.
          </p>
          <Button onClick={() => refetchChats()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const chats = chatsData?.chats || []
  const selectedChat = chats.find((c) => c.id === selectedChatId)

  // Sort messages by timestamp (oldest first for display)
  const sortedMessages = [...allMessages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return (
    <div className="flex h-full">
      {/* Conversations List - Left Sidebar */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">LinkedIn Inbox</h2>
            <p className="text-sm text-muted-foreground">{chats.length} conversations</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetchChats()}
            title="Refresh conversations"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-2">
                If you expect to see messages, try refreshing or check your LinkedIn connection in{' '}
                <button
                  className="text-primary underline hover:no-underline"
                  onClick={() => navigate('/settings')}
                >
                  Settings
                </button>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2"
                onClick={() => refetchChats()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  className={`w-full p-4 text-left transition-colors hover:bg-secondary ${
                    selectedChatId === chat.id ? 'bg-secondary' : ''
                  }`}
                  onClick={() => setSelectedChatId(chat.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        {chat.profile_picture_url ? (
                          <AvatarImage src={chat.profile_picture_url} alt={chat.name} />
                        ) : null}
                        <AvatarFallback>{getInitials(chat.name)}</AvatarFallback>
                      </Avatar>
                      {chat.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                          {chat.unread_count > 9 ? '9+' : chat.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`font-medium truncate ${
                            chat.unread_count > 0 ? 'text-foreground' : ''
                          }`}
                        >
                          {chat.name}
                        </p>
                        {chat.last_message?.timestamp && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimestamp(chat.last_message.timestamp)}
                          </span>
                        )}
                      </div>
                      {chat.last_message?.text && (
                        <p
                          className={`text-sm truncate ${
                            chat.unread_count > 0
                              ? 'text-foreground font-medium'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {chat.last_message.is_from_self ? 'You: ' : ''}
                          {truncateText(chat.last_message.text, 50)}
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

      {/* Messages Panel - Right Side */}
      <div className="flex flex-1 flex-col">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="border-b p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {selectedChat.profile_picture_url ? (
                    <AvatarImage src={selectedChat.profile_picture_url} alt={selectedChat.name} />
                  ) : null}
                  <AvatarFallback>{getInitials(selectedChat.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">{selectedChat.name}</p>
                  {selectedChat.profile_url && (
                    <a
                      href={selectedChat.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View LinkedIn Profile
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
              {isLoadingMessages ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Load More Button */}
                  {messagesCursor && (
                    <div className="flex justify-center pb-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="gap-2"
                      >
                        {isLoadingMore ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronDown className="h-4 w-4 rotate-180" />
                        )}
                        Load older messages
                      </Button>
                    </div>
                  )}

                  {sortedMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <p>No messages in this conversation</p>
                    </div>
                  ) : (
                    sortedMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.is_from_self ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-4 py-2 ${
                            message.is_from_self
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                          <div
                            className={`mt-1 flex items-center justify-end gap-1 text-xs ${
                              message.is_from_self
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground'
                            }`}
                          >
                            <span>{formatTimestamp(message.timestamp)}</span>
                            {/* Read receipt indicator for sent messages */}
                            {message.is_from_self && (
                              message.is_read ? (
                                <span title="Visto">
                                  <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
                                </span>
                              ) : (
                                <span title="Enviado">
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
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
                  disabled={sendMessageMutation.isPending}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
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
    </div>
  )
}
