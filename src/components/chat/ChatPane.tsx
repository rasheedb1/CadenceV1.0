import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import type { ChatThread } from '@/lib/chat/client';
import { useChatStream } from '@/hooks/useChatStream';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface Props {
  thread: ChatThread;
  agentName: string;
  agentRole?: string | null;
}

export function ChatPane({ thread, agentName, agentRole }: Props) {
  const stream = useChatStream(thread.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Autoscroll to bottom on new content while in flight.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [stream.messages, stream.loading]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border/50 bg-background/40 px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">{agentName}</div>
          <div className="truncate text-xs text-muted-foreground">{agentRole ?? 'Agente'} · {thread.title ?? 'Sin título'}</div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-3xl">
          {stream.messages.length === 0 ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <Bot className="h-8 w-8 opacity-50" />
              <div>Saluda a {agentName} para empezar.</div>
            </div>
          ) : (
            stream.messages.map((m) => <ChatMessage key={m.id} message={m} />)
          )}
        </div>
      </div>

      <ChatInput
        loading={stream.loading}
        onSend={(t) => { stream.send(t).catch((err) => console.error('[ChatPane] send failed', err)); }}
        onCancel={stream.cancel}
      />
    </div>
  );
}
