/**
 * Returns true if a new visit should be counted (new URL or outside dedupe window).
 */
export function shouldCountNewVisit(
  lastVisitAt: number | undefined,
  now: number,
  dedupeMinutes: number,
): boolean {
  if (lastVisitAt == null) return true;
  const windowMs = Math.max(0, dedupeMinutes) * 60 * 1000;
  return now - lastVisitAt >= windowMs;
}
