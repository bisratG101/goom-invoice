/**
 * Escapes characters with special meaning in SQL LIKE / ILIKE patterns (% and _).
 * Also escapes backslashes (\) which serve as the default escape character in PostgreSQL.
 *
 * @param pattern Raw search string provided by user/client
 * @returns Sanitized string safe to interpolate into `%${escaped}%` parameterized values
 */
export function escapeIlikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, '\\$&');
}
