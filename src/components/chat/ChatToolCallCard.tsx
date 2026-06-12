import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Wrench, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ChatToolCall } from '@/hooks/useChatStream';
import { cn } from '@/lib/utils';

interface Props { call: ChatToolCall }

function safeStringify(v: unknown, max = 800): string {
  try { const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2); return s.length > max ? s.slice(0, max) + '…' : s; }
  catch { return String(v); }
}

export function ChatToolCallCard({ call }: Props) {
  const [open, setOpen] = useState(false);
  const Icon = call.status === 'started' ? Loader2 : call.status === 'errored' ? AlertCircle : CheckCircle2;
  const tone = call.status === 'started' ? 'text-blue-400' : call.status === 'errored' ? 'text-red-400' : 'text-emerald-400';

  return (
    <div className="my-2 rounded-md border border-border/50 bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/50"
      >
        {open ? <ChevronDown className="h-3 w-3 opacity-60" /> : <ChevronRight className="h-3 w-3 opacity-60" />}
        <Wrench className="h-3.5 w-3.5 opacity-70" />
        <span className="font-mono text-xs">{call.toolName}</span>
        <Icon className={cn('h-3.5 w-3.5 ml-auto', tone, call.status === 'started' && 'animate-spin')} />
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2 space-y-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Input</div>
            <pre className="whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-xs">{safeStringify(call.input)}</pre>
          </div>
          {call.status !== 'started' && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Output</div>
              <pre className="whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-xs">{safeStringify(call.output)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
