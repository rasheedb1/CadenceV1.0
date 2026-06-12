import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  archiveThread,
  createThread,
  listThreads,
  patchThread,
  type ChatThread,
} from '@/lib/chat/client';

const KEY_THREADS = ['chat-threads'] as const;

export function useChatThreads(opts: { status?: string } = { status: 'active' }) {
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  return useQuery({
    queryKey: [...KEY_THREADS, opts.status ?? 'active'],
    queryFn: () => listThreads(token!, opts),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useCreateThread() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const qc = useQueryClient();

  return useMutation<ChatThread, Error, { agentId: string; title?: string }>({
    mutationFn: ({ agentId, title }) => createThread(token!, agentId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_THREADS }),
  });
}

export function usePatchThread() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const qc = useQueryClient();

  return useMutation<ChatThread, Error, { threadId: string; title?: string; status?: 'active' | 'paused' | 'archived' }>({
    mutationFn: ({ threadId, title, status }) =>
      patchThread(token!, threadId, { title, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_THREADS }),
  });
}

export function useArchiveThread() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const qc = useQueryClient();

  return useMutation<void, Error, { threadId: string }>({
    mutationFn: ({ threadId }) => archiveThread(token!, threadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_THREADS }),
  });
}
