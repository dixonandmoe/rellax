/**
 * Tolerant JSON extraction for model responses.
 *
 * Kept in its own module (not inside the server-only Anthropic provider) so it can be
 * unit-tested without pulling in the SDK or the server-only guard.
 */
export function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // The model may wrap JSON in a fence or add trailing prose; take the outermost object.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
