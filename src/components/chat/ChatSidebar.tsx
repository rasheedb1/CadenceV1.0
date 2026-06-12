import { Bot, Plus, Search, Archive } from 'lucide-react';
import { useState } from 'react';
import type { ChatThread } from '@/lib/chat/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useArchiveThread } from '@/hooks/useChatThreads';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  threads: ChatThread[];
  agentsById: Map<string, { id: string; name: string; role?: string | null }>;
  selectedId: string | null;
  onSelect: (threadId: string) => void;
  onNewChat: () => void;
}

export function ChatSidebar({ threads, agentsById, selectedId, onSelect, onNewChat }: Props) {
  const [q, setQ] = useState('');
  const archive = useArchiveThread();

  const filtered = threads.filter((t) => {
    if (!q) return true;
    const agentName = agentsById.get(t.agent_id)?.name ?? '';
    const haystack = `${t.title ?? ''} ${agentName}`.toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  // Group by agent.
  const groups = new Map<string, ChatThread[]>();
  for (const t of filtered) {
    const list = groups.get(t.agent_id) ?? [];
    list.push(t);
    groups.set(t.agent_id, list);
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border/50 bg-background/40">
      <div className="border-b border-border/40 p-3">
        <Button onClick={onNewChat} className="w-full justify-start gap-2" variant="default">
          <Plus className="h-4 w-4" /> Nuevo chat
        </Button>
        <div className="mt-3 relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar conversaciones…"
            className="w-full rounded-md border border-border/50 bg-background py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {[...groups.entries()].map(([agentId, list]) => {
          const agent = agentsById.get(agentId);
          return (
            <div key={agentId} className="mb-4">
              <div className="flex items-center gap-2 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Bot className="h-3 w-3" />
                {agent?.name ?? 'Agente'}
                <span className="ml-auto text-[10px]">{list.length}</span>
              </div>
              <div className="space-y-0.5">
                {list.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      'group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition',
                      selectedId === t.id ? 'bg-primary/15' : 'hover:bg-muted/50',
                    )}
                    onClick={() => onSelect(t.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{t.title ?? 'Sin título'}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Archivar"
                      className="opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); archive.mutate({ threadId: t.id }); }}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {q ? 'Sin resultados' : 'Aún no tienes chats. Crea uno para empezar.'}
          </div>
        )}
      </div>
    </aside>
  );
}
