/**
 * Text utilities — defensive helpers for the boundary between agent state
 * and the LLM API. The Anthropic API rejects any JSON body containing a
 * lone UTF-16 surrogate (high without low, or vice versa). JS string
 * methods like substring/slice cut by code units, so emoji or other
 * non-BMP characters can be split mid-pair when truncating user text.
 *
 * The agent loop accumulates user-generated text from many sources
 * (tasks, messages, knowledge, last_exchange, etc.) and runs many
 * substring(0, N) calls on it, so we sanitize at the API boundary
 * rather than chasing every truncation site.
 */

/**
 * Remove unpaired UTF-16 surrogates that would otherwise break JSON
 * encoding for the Anthropic API. Idempotent and safe on any string.
 */
export function stripLoneSurrogates(s: string): string {
  if (!s) return s;
  // High surrogate not followed by low surrogate, OR low surrogate not preceded by high
  return s.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '',
  );
}

/**
 * Truncate a string to N codepoints (not code units), preserving emoji
 * and other surrogate pairs intact. Use this in place of `s.substring(0, n)`
 * when `s` may contain non-BMP characters.
 */
export function truncCodepoint(s: string, n: number): string {
  if (!s) return s;
  return [...s].slice(0, n).join('');
}
