/**
 * Google OAuth helper — delegates token refresh to the bridge so that
 * the refresh_token never leaves the bridge/BD trust boundary.
 *
 * Usage:
 *   const token = await getFreshGoogleToken(agent.orgId);
 *   if (!token) throw new Error('Gmail not connected');
 *   await fetch('https://gmail.googleapis.com/...', { headers: { Authorization: `Bearer ${token.accessToken}` } });
 */

const BRIDGE_URL = process.env.BRIDGE_URL || process.env.BRIDGE_PUBLIC_URL || 'https://twilio-bridge-production-241b.up.railway.app';

export interface GoogleTokenResult {
  accessToken: string;
  email: string | null;
  expiresAt: string | null;
}

export interface GoogleTokenError {
  error: string;
  message?: string;
}

/**
 * Get a fresh Google access_token for an org.
 * Returns null if not connected or if refresh failed (user must reconnect).
 */
export async function getFreshGoogleToken(orgId: string): Promise<GoogleTokenResult | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/integrations/google/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.warn(`[google-auth] refresh failed for org ${orgId}:`, data);
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
 * Convenience: returns true if the org has Gmail currently connected.
 */
export async function isGmailConnected(orgId: string): Promise<boolean> {
  const t = await getFreshGoogleToken(orgId);
  return t !== null;
}
