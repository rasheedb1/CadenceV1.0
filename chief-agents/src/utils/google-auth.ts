/**
 * Google OAuth helper — calls the Supabase `refresh-google-token` edge function
 * which reads/updates `ae_integrations` (the same table the web AE flow writes
 * to) and refreshes the access_token against Google when it's near expiry.
 *
 * The Google client secret stays in Supabase secrets — chief-agents only needs
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Convention: when only `orgId` is given, returns the most-recently-connected
 * Google account in that org.
 *
 * Usage:
 *   const token = await getFreshGoogleToken(agent.orgId);
 *   if (!token) throw new Error('Google not connected');
 *   await fetch('https://gmail.googleapis.com/...', {
 *     headers: { Authorization: `Bearer ${token.accessToken}` }
 *   });
 */

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface GoogleTokenResult {
  accessToken: string;
  email: string | null;
  expiresAt: string | null;
}

/**
 * Get a fresh Google access_token for an org (and optional user).
 * Returns null if not connected or if refresh failed (user must reconnect).
 */
export async function getFreshGoogleToken(orgId: string, userId?: string): Promise<GoogleTokenResult | null> {
  if (!orgId || !SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(`${SB_URL}/functions/v1/refresh-google-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify({ org_id: orgId, user_id: userId }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      if (data?.error !== 'not_connected') {
        console.warn(`[google-auth] refresh failed for org ${orgId}:`, data);
      }
      return null;
    }
    return {
      accessToken: data.access_token,
      email: data.email || null,
      expiresAt: data.expires_at || null,
    };
  } catch (e: any) {
    console.error(`[google-auth] refresh error:`, e.message);
    return null;
  }
}

/**
 * Convenience: returns true if the org has Google currently connected.
 */
export async function isGmailConnected(orgId: string): Promise<boolean> {
  const t = await getFreshGoogleToken(orgId);
  return t !== null;
}
