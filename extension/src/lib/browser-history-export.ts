/**
 * Incremental export of Chrome’s native history (chrome.history) for JSON backups.
 * First run uses a fixed epoch floor; later runs use the committed watermark from settings.
 */

/** Local midnight 1 May 2025 — earliest time included when no prior export exists. */
export const BROWSER_HISTORY_EXPORT_EPOCH_MS = new Date(2025, 4, 1, 0, 0, 0, 0).getTime();

export const DEFAULT_HISTORY_SEARCH_PAGE_SIZE = 10_000;

export type BrowserHistoryExportItem = {
  url: string;
  title: string;
  lastVisitTime: number;
  visitCount: number;
  typedCount: number;
};

export type BrowserHistoryExportFile = {
  formatVersion: 1;
  kind: "chrome_history_incremental";
  export: {
    preparedAt: number;
    epochFloorMs: number;
    query: { startTime: number; endTime: number };
    itemCount: number;
  };
  items: BrowserHistoryExportItem[];
};

export type HistorySearchFn = (query: chrome.history.HistoryQuery) => Promise<chrome.history.HistoryItem[]>;

/**
 * All distinct URLs with at least one visit in [startMs, endMs], merged from paged search.
 * Chrome returns results ordered by descending lastVisitTime.
 */
export async function searchHistoryPaged(
  startMs: number,
  endMs: number,
  search: HistorySearchFn = (q) => chrome.history.search(q),
  pageSize: number = DEFAULT_HISTORY_SEARCH_PAGE_SIZE,
): Promise<BrowserHistoryExportItem[]> {
  const byUrl = new Map<string, BrowserHistoryExportItem>();
  let windowEnd = endMs;

  while (windowEnd >= startMs) {
    const batch = await search({
      text: "",
      startTime: startMs,
      endTime: windowEnd,
      maxResults: pageSize,
    });
    if (batch.length === 0) break;

    for (const item of batch) {
      const url = item.url?.trim();
      if (!url) continue;
      byUrl.set(url, {
        url,
        title: item.title ?? "",
        lastVisitTime: item.lastVisitTime ?? 0,
        visitCount: item.visitCount ?? 0,
        typedCount: item.typedCount ?? 0,
      });
    }

    if (batch.length < pageSize) break;

    const times = batch.map((b) => b.lastVisitTime ?? 0).filter((t) => t > 0);
    if (times.length === 0) break;
    const minTime = Math.min(...times);
    windowEnd = minTime - 1;
    if (windowEnd < startMs) break;
  }

  return [...byUrl.values()];
}

export function buildBrowserHistoryExportFile(input: {
  items: BrowserHistoryExportItem[];
  startTime: number;
  endTime: number;
  preparedAt: number;
}): BrowserHistoryExportFile {
  return {
    formatVersion: 1,
    kind: "chrome_history_incremental",
    export: {
      preparedAt: input.preparedAt,
      epochFloorMs: BROWSER_HISTORY_EXPORT_EPOCH_MS,
      query: { startTime: input.startTime, endTime: input.endTime },
      itemCount: input.items.length,
    },
    items: input.items,
  };
}

/** Next window start: one ms after last commit, or epoch if never exported. */
export function nextHistoryExportStartMs(lastCommittedEndMs: number | null | undefined): number {
  if (lastCommittedEndMs == null) return BROWSER_HISTORY_EXPORT_EPOCH_MS;
  return lastCommittedEndMs + 1;
}
