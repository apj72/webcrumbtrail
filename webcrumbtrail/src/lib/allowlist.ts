import type { DomainRule } from "../shared/types";

/**
 * Match hostname against rules. Wildcard `*.example.com` matches `a.example.com` but not `example.com`.
 */
export function hostMatchesRules(hostname: string, rules: DomainRule[]): boolean {
  const host = hostname.toLowerCase();
  const enabled = rules.filter((r) => r.enabled);
  for (const rule of enabled) {
    const p = rule.pattern.trim().toLowerCase();
    if (!p) continue;
    if (p.startsWith("*.")) {
      const suffix = p.slice(2);
      if (host === suffix) continue;
      if (host.endsWith("." + suffix)) return true;
      continue;
    }
    if (host === p) return true;
  }
  return false;
}

/** For tests / debugging: single rule match. */
export function hostMatchesPattern(hostname: string, pattern: string): boolean {
  return hostMatchesRules(hostname, [
    { id: "t", pattern, enabled: true },
  ]);
}
