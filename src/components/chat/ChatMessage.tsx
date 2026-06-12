import { Bot, User, AlertCircle, Pause } from 'lucide-react';
import type { ChatMessage as ChatMsg } from '@/hooks/useChatStream';
import { ChatToolCallCard } from './ChatToolCallCard';
import { cn } from '@/lib/utils';

interface Props { message: ChatMsg }

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3 py-4', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-primary/20 text-primary' : 'bg-emerald-500/15 text-emerald-300',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn('flex-1 max-w-[78%] space-y-1', isUser ? 'text-right' : 'text-left')}>
        <div className={cn(
          'inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
          isUser ? 'bg-primary/20 text-primary-foreground rounded-br-sm' : 'bg-muted/60 rounded-bl-sm',
        )}>
          {message.text || (message.status === 'streaming' && !isUser ? <span className="opacity-60 italic">…</span> : '')}
        </div>
        {!isUser && message.toolCalls.length > 0 && (
          <div className="space-y-1">
            {message.toolCalls.map((c, i) => (
              <ChatToolCallCard key={`${c.toolUseId}-${i}`} call={c} />
            ))}
          </div>
        )}
        {message.status === 'aborted' && (
          <div className="flex items-center gap-1 text-xs text-amber-400/90">
            <AlertCircle className="h-3 w-3" /> turno cancelado{message.errorMessage ? `: ${message.errorMessage}` : ''}
          </div>
        )}
        {message.status === 'paused' && (
          <div className="flex items-center gap-1 text-xs text-amber-400/90">
            <Pause className="h-3 w-3" /> reconectando…
          </div>
        )}
        {message.status === 'error' && (
          <div className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3" /> {message.errorMessage ?? 'error'}
          </div>
        )}
        {typeof message.costUsd === 'number' && message.costUsd > 0 && message.status === 'done' && (
          <div className="text-[10px] text-muted-foreground">${message.costUsd.toFixed(4)}</div>
        )}
      </div>
    </div>
  );
}
