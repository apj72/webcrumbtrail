import { describe, expect, it } from "vitest";
import { hostnameIsSharePoint, normalizeTitleForRollup, pickBestSummaryPage } from "../src/lib/page-rollup";
import type { PageRecord } from "../src/shared/types";

describe("normalizeTitleForRollup", () => {
  it("trims, collapses space, lowercases", () => {
    expect(normalizeTitleForRollup("  CISA   Meetings  ")).toBe("cisa meetings");
  });

  it("returns empty for no title sentinel", () => {
    expect(normalizeTitleForRollup("(no title)")).toBe("");
    expect(normalizeTitleForRollup("")).toBe("");
  });
});

describe("hostnameIsSharePoint", () => {
  it("matches tenant and personal hosts", () => {
    expect(hostnameIsSharePoint("contoso.sharepoint.com")).toBe(true);
    expect(hostnameIsSharePoint("contoso-my.sharepoint.com")).toBe(true);
    expect(hostnameIsSharePoint("docs.redhat.com")).toBe(false);
  });
});

describe("pickBestSummaryPage", () => {
  const base = (over: Partial<PageRecord>): PageRecord => ({
    id: "x",
    canonical_url: "https://a",
    original_url: "https://a",
    domain: "a.sharepoint.com",
    title: "t",
    first_seen_at: 1,
    last_seen_at: 1,
    visit_count: 1,
    content_hash: null,
    summary_title: null,
    latest_summary: null,
    latest_summary_updated_at: null,
    summary_status: "not_requested",
    ...over,
  });

  it("prefers completed with body", () => {
    const a = base({ id: "a", summary_status: "not_requested" });
    const b = base({
      id: "b",
      summary_status: "completed",
      latest_summary: "hello",
      latest_summary_updated_at: 100,
    });
    expect(pickBestSummaryPage([a, b]).id).toBe("b");
  });
});
