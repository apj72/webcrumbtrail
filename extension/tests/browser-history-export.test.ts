import { describe, expect, it, vi } from "vitest";
import {
  BROWSER_HISTORY_EXPORT_EPOCH_MS,
  buildBrowserHistoryExportFile,
  nextHistoryExportStartMs,
  searchHistoryPaged,
  type HistorySearchFn,
} from "../src/lib/browser-history-export";

describe("BROWSER_HISTORY_EXPORT_EPOCH_MS", () => {
  it("is local midnight on 1 May 2025", () => {
    expect(BROWSER_HISTORY_EXPORT_EPOCH_MS).toBe(new Date(2025, 4, 1, 0, 0, 0, 0).getTime());
  });
});

describe("nextHistoryExportStartMs", () => {
  it("uses epoch when never exported", () => {
    expect(nextHistoryExportStartMs(null)).toBe(BROWSER_HISTORY_EXPORT_EPOCH_MS);
    expect(nextHistoryExportStartMs(undefined)).toBe(BROWSER_HISTORY_EXPORT_EPOCH_MS);
  });

  it("starts one ms after last commit", () => {
    expect(nextHistoryExportStartMs(1_700_000_000_000)).toBe(1_700_000_000_001);
  });
});

describe("buildBrowserHistoryExportFile", () => {
  it("embeds query window and items", () => {
    const f = buildBrowserHistoryExportFile({
      items: [
        {
          url: "https://example.com/a",
          title: "A",
          lastVisitTime: 100,
          visitCount: 2,
          typedCount: 0,
        },
      ],
      startTime: 10,
      endTime: 99,
      preparedAt: 1000,
    });
    expect(f.kind).toBe("chrome_history_incremental");
    expect(f.export.query).toEqual({ startTime: 10, endTime: 99 });
    expect(f.export.itemCount).toBe(1);
    expect(f.items[0].url).toBe("https://example.com/a");
  });
});

describe("searchHistoryPaged", () => {
  it("requests further pages when a batch is full", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([
        { url: "https://a.test/", title: "A", lastVisitTime: 3000, visitCount: 1, typedCount: 0 },
        { url: "https://b.test/", title: "B", lastVisitTime: 2000, visitCount: 1, typedCount: 0 },
      ])
      .mockResolvedValueOnce([
        { url: "https://c.test/", title: "C", lastVisitTime: 1000, visitCount: 1, typedCount: 0 },
      ]) as HistorySearchFn;

    const items = await searchHistoryPaged(1000, 5000, search, 2);
    expect(items.map((i) => i.url).sort()).toEqual([
      "https://a.test/",
      "https://b.test/",
      "https://c.test/",
    ]);
    expect(search).toHaveBeenCalledTimes(2);
    expect(vi.mocked(search).mock.calls[1][0].endTime).toBe(1999);
  });

  it("skips entries with empty url", async () => {
    const search = vi.fn().mockResolvedValue([
      { url: "", title: "", lastVisitTime: 1000, visitCount: 1, typedCount: 0 },
      { url: "https://ok.test/", title: "OK", lastVisitTime: 1000, visitCount: 1, typedCount: 0 },
    ]) as HistorySearchFn;
    const items = await searchHistoryPaged(0, 2000, search);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://ok.test/");
  });
});
