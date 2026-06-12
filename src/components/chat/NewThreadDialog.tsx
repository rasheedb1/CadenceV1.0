import { useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateThread } from '@/hooks/useChatThreads';

interface AgentOption { id: string; name: string; role?: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  agents: AgentOption[];
  onCreated: (threadId: string) => void;
}

export function NewThreadDialog({ open, onClose, agents, onCreated }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const create = useCreateThread();

  const submit = async () => {
    if (!selected) return;
    try {
      const thread = await create.mutateAsync({ agentId: selected });
      onCreated(thread.id);
      onClose();
      setSelected(null);
    } catch (err) {
      console.error('[NewThreadDialog] create failed', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo chat</DialogTitle>
          <DialogDescription>Elige el agente con el que quieres conversar.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[300px] space-y-1 overflow-y-auto py-2">
          {agents.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No tienes agentes activos.</div>
          ) : agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                selected === a.id ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                {a.role && <div className="truncate text-xs text-muted-foreground">{a.role}</div>}
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!selected || create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear chat'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
