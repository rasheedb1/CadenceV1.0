/**
 * Shared Supabase REST helpers
 * Ported from event-loop.js sbGet/sbPatch/sbRpc
 */

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const sbHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SB_KEY}`,
  apikey: SB_KEY,
};

export function isConfigured(): boolean {
  return !!(SB_URL && SB_KEY);
}

export async function sbGet<T = unknown[]>(path: string): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) return [] as unknown as T;
  return res.json() as Promise<T>;
}

export async function sbPatch(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

export async function sbPost(path: string, body: Record<string, unknown>, prefer = 'return=minimal'): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: prefer },
    body: JSON.stringify(body),
  });
}

export async function sbPostReturn<T = unknown>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data[0] ? data[0] : data;
}

export async function sbRpc<T = unknown>(fnName: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export async function sbUpsert(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
}

export function getSupabaseUrl(): string {
  return SB_URL;
}

export function getSupabaseHeaders(): Record<string, string> {
  return { ...sbHeaders };
}
