/**
 * /chat — Multi-pane web chat for talking to agents.
 * Sidebar of past threads + active pane + new-thread dialog.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/contexts/OrgContext';
import { useChatThreads, useCreateThread } from '@/hooks/useChatThreads';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatPane } from '@/components/chat/ChatPane';
import { NewThreadDialog } from '@/components/chat/NewThreadDialog';

interface AgentRow { id: string; name: string; role: string | null; status: string }

export function Chat() {
  const params = useParams<{ id?: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { orgId } = useOrg();

  const [dialogOpen, setDialogOpen] = useState(false);

  // Active thread id from route param or ?thread query.
  const activeThreadId = params.id ?? search.get('thread');

  // Threads list.
  const threadsQuery = useChatThreads({ status: 'active' });

  // Org's agents — used for sidebar grouping + new-thread dialog.
  const agentsQuery = useQuery<AgentRow[]>({
    queryKey: ['org-agents', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, role, status')
        .eq('org_id', orgId!)
        .in('status', ['active', 'deploying']);
      if (error) throw error;
      return (data ?? []) as AgentRow[];
    },
    staleTime: 60_000,
  });

  const agentsById = useMemo(() => {
    const map = new Map<string, AgentRow>();
    for (const a of agentsQuery.data ?? []) map.set(a.id, a);
    return map;
  }, [agentsQuery.data]);

  // ?new=<agent_id> → auto-create a new thread with that agent.
  const newAgentId = search.get('new');
  const createMut = useCreateThread();
  const newCreatedRef = useState({ doneFor: '' as string });
  useEffect(() => {
    if (!newAgentId) return;
    if (newCreatedRef[0].doneFor === newAgentId) return;
    newCreatedRef[0].doneFor = newAgentId;
    createMut.mutateAsync({ agentId: newAgentId })
      .then((t) => {
        threadsQuery.refetch();
        navigate(`/chat/${t.id}`, { replace: true });
      })
      .catch((err) => console.error('[Chat] auto-create failed', err));
  }, [newAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pick the most recent thread if none selected and threads exist.
  useEffect(() => {
    if (activeThreadId || newAgentId) return;
    const first = threadsQuery.data?.[0];
    if (first) navigate(`/chat/${first.id}`, { replace: true });
  }, [activeThreadId, newAgentId, threadsQuery.data, navigate]);

  const activeThread = threadsQuery.data?.find((t) => t.id === activeThreadId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border/50 px-4 py-2 text-sm">
        <button onClick={() => navigate('/')} className="opacity-70 hover:opacity-100">← Inicio</button>
        <span className="ml-2 font-semibold">Chat</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <ChatSidebar
          threads={threadsQuery.data ?? []}
          agentsById={agentsById}
          selectedId={activeThreadId}
          onSelect={(id) => navigate(`/chat/${id}`)}
          onNewChat={() => setDialogOpen(true)}
        />
        {activeThread ? (
          <ChatPane
            key={activeThread.id}
            thread={activeThread}
            agentName={agentsById.get(activeThread.agent_id)?.name ?? 'Agente'}
            agentRole={agentsById.get(activeThread.agent_id)?.role ?? null}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Bot className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p className="text-sm">Selecciona o crea un chat para empezar.</p>
            </div>
          </div>
        )}
      </div>

      <NewThreadDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agents={(agentsQuery.data ?? []).map((a) => ({ id: a.id, name: a.name, role: a.role }))}
        onCreated={(threadId) => {
          // refresh the threads list and navigate to the new one
          threadsQuery.refetch();
          navigate(`/chat/${threadId}`);
        }}
      />
    </div>
  );
}

export default Chat;
