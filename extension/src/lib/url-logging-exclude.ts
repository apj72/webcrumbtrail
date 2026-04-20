/**
 * If the tab URL starts with any non-empty trimmed prefix, the visit should not be logged.
 */
export function shouldSkipLoggingForUrl(url: string, excludePrefixes: string[]): boolean {
  const u = url.trim();
  if (!u) return false;
  for (const raw of excludePrefixes) {
    const p = raw.trim();
    if (p && u.startsWith(p)) return true;
  }
  return false;
}
