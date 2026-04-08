import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "../src/lib/canonicalize";

describe("canonicalizeUrl", () => {
  it("lowercases host and strips fragment", () => {
    const u = canonicalizeUrl("HTTPS://Docs.RedHat.Com/EN-US/Topic#section");
    expect(u).toContain("docs.redhat.com");
    expect(u).not.toContain("#");
  });

  it("strips utm params", () => {
    const u = canonicalizeUrl("https://example.com/path?utm_source=x&utm_campaign=y&id=1");
    expect(u).not.toContain("utm_");
    expect(u).toContain("id=1");
  });

  it("strips fbclid", () => {
    const u = canonicalizeUrl("https://example.com/?fbclid=abc");
    expect(u).not.toContain("fbclid");
  });
});
