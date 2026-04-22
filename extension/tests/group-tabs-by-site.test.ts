import { describe, expect, it } from "vitest";
import {
  sortTabsIntoClassifiedClusters,
  tabIsEligibleForSiteConsolidation,
} from "../src/lib/tab-session/group-tabs-by-site";

describe("tabIsEligibleForSiteConsolidation", () => {
  it("rejects pinned tabs", () => {
    expect(tabIsEligibleForSiteConsolidation({ pinned: true, url: "https://example.com/" })).toBe(false);
  });

  it("rejects non-http", () => {
    expect(tabIsEligibleForSiteConsolidation({ pinned: false, url: "chrome://version/" })).toBe(false);
  });

  it("accepts normal https", () => {
    expect(tabIsEligibleForSiteConsolidation({ pinned: false, url: "https://example.com/path" })).toBe(true);
  });
});

describe("sortTabsIntoClassifiedClusters", () => {
  it("orders clusters by sortOrder then label; tabs within cluster by title", () => {
    const clusters = sortTabsIntoClassifiedClusters([
      { id: 1, title: "Z doc", url: "https://docs.google.com/document/d/aaa/edit" },
      { id: 2, title: "Issue B", url: "https://acme.atlassian.net/browse/FOO-2" },
      { id: 3, title: "Issue A", url: "https://acme.atlassian.net/browse/FOO-1" },
      { id: 4, title: "A doc", url: "https://docs.google.com/document/d/bbb/edit" },
    ]);
    expect(clusters.map((c) => c.info.id)).toEqual(["jira-atlassian", "google-docs"]);
    expect(clusters[0].tabIds).toEqual([3, 2]);
    expect(clusters[1].tabIds).toEqual([4, 1]);
  });
});
