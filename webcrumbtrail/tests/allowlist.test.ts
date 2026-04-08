import { describe, expect, it } from "vitest";
import { hostMatchesPattern, hostMatchesRules } from "../src/lib/allowlist";
import type { DomainRule } from "../src/shared/types";

describe("hostMatchesRules", () => {
  const rules: DomainRule[] = [
    { id: "1", pattern: "docs.redhat.com", enabled: true },
    { id: "2", pattern: "*.sharepoint.com", enabled: true },
    { id: "3", pattern: "disabled.example", enabled: false },
  ];

  it("matches exact host", () => {
    expect(hostMatchesRules("docs.redhat.com", rules)).toBe(true);
  });

  it("does not match partial", () => {
    expect(hostMatchesRules("evil.docs.redhat.com", rules)).toBe(false);
  });

  it("matches wildcard subdomains", () => {
    expect(hostMatchesRules("nokia.sharepoint.com", rules)).toBe(true);
    expect(hostMatchesRules("tenant.sharepoint.com", rules)).toBe(true);
  });

  it("does not match apex for wildcard", () => {
    expect(hostMatchesRules("sharepoint.com", rules)).toBe(false);
  });

  it("ignores disabled rules", () => {
    expect(hostMatchesRules("disabled.example", rules)).toBe(false);
  });
});

describe("hostMatchesPattern", () => {
  it("wraps single pattern", () => {
    expect(hostMatchesPattern("redhat.atlassian.net", "redhat.atlassian.net")).toBe(true);
  });
});
