import { describe, expect, it } from "vitest";
import { classifyTabUrl, normalizeTabUrlForDedupe } from "../src/lib/tab-session/classify-tab";

describe("classifyTabUrl", () => {
  it("groups Jira on Atlassian Cloud", () => {
    const g = classifyTabUrl("https://foo.atlassian.net/browse/FOO-123");
    expect(g.id).toBe("jira-atlassian");
  });

  it("groups Google Docs and Slides", () => {
    expect(classifyTabUrl("https://docs.google.com/document/d/abc/edit").id).toBe("google-docs");
    expect(classifyTabUrl("https://docs.google.com/presentation/d/xyz/edit").id).toBe("google-slides");
  });

  it("groups Red Hat docs and portal", () => {
    expect(classifyTabUrl("https://docs.redhat.com/en/foo").id).toBe("redhat-docs");
    expect(classifyTabUrl("https://access.redhat.com/solutions/123").id).toBe("redhat-access");
  });

  it("buckets unknown https sites by registrable host", () => {
    const g = classifyTabUrl("https://wiki.example.org/foo");
    expect(g.id).toBe("site:example.org");
    expect(g.label).toBe("example.org");
  });

  it("handles browser-internal URLs", () => {
    expect(classifyTabUrl("chrome://settings/").id).toBe("browser-internal");
  });
});

describe("normalizeTabUrlForDedupe", () => {
  it("strips hash and lowercases host", () => {
    expect(normalizeTabUrlForDedupe("HTTPS://Example.COM/a#b")).toBe("https://example.com/a");
  });
});
