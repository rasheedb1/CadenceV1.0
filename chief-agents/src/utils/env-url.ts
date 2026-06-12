/**
 * Defensive URL resolution from environment variables.
 *
 * Why this exists: env vars on Railway can be set to placeholder strings
 * like "PENDIENTE", "TODO", "<replace_me>", etc. when the service is being
 * configured. The naive pattern `process.env.X || fallback` only triggers
 * the fallback when the var is empty/undefined — a non-empty placeholder
 * silently produces invalid URLs like `PENDIENTE/integrations/salesforce/refresh`
 * that fail at request time with cryptic errors.
 *
 * pickUrl(): returns the first candidate that LOOKS like a URL (starts with
 * http:// or https://). Falls back to the last candidate (the safe default).
 */
export function pickUrl(...candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    if (typeof c === 'string' && (c.startsWith('http://') || c.startsWith('https://'))) {
      return c;
    }
  }
  // Last candidate is always the hardcoded safe default
  return candidates[candidates.length - 1] || '';
}
