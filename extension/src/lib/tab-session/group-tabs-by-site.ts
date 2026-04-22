import { classifyTabUrl, type TabGroupInfo } from "./classify-tab";

const SKIP_GROUP_IDS = new Set([
  "browser-internal",
  "new-tab",
  "other-protocol",
  "invalid-url",
]);

export function tabIsEligibleForSiteConsolidation(tab: {
  pinned?: boolean;
  url?: string;
  pendingUrl?: string;
}): boolean {
  if (tab.pinned) return false;
  const url = tab.url ?? tab.pendingUrl ?? "";
  if (!url.startsWith("http")) return false;
  const g = classifyTabUrl(url);
  if (SKIP_GROUP_IDS.has(g.id)) return false;
  return true;
}

type TabLite = { id: number; title?: string; url?: string; pendingUrl?: string };

/** Buckets by session-overview “type”, ordered like the session page (sortOrder then label). */
export function sortTabsIntoClassifiedClusters(
  tabs: TabLite[],
): { info: TabGroupInfo; tabIds: number[] }[] {
  const byKey = new Map<string, { info: TabGroupInfo; tabs: TabLite[] }>();
  for (const tab of tabs) {
    const url = tab.url ?? tab.pendingUrl ?? "";
    const info = classifyTabUrl(url);
    let e = byKey.get(info.id);
    if (!e) {
      e = { info, tabs: [] };
      byKey.set(info.id, e);
    }
    e.tabs.push(tab);
  }
  const clusters = [...byKey.values()].map((v) => {
    v.tabs.sort((a, b) =>
      (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" }),
    );
    return { info: v.info, tabIds: v.tabs.map((t) => t.id) };
  });
  clusters.sort((a, b) => {
    if (a.info.sortOrder !== b.info.sortOrder) return a.info.sortOrder - b.info.sortOrder;
    return a.info.label.localeCompare(b.info.label, undefined, { sensitivity: "base" });
  });
  return clusters;
}

const GROUP_COLORS: chrome.tabGroups.ColorEnum[] = [
  "blue",
  "cyan",
  "green",
  "grey",
  "orange",
  "pink",
  "purple",
  "red",
  "yellow",
];

/**
 * Moves all eligible tabs (same incognito mode as the target) into `targetWindowId`, ordered by
 * classified site type (Jira, Google Docs, …) then tab title. Creates Chrome tab groups for types
 * with 2+ tabs. Skips pinned tabs and internal / non-http tabs.
 */
export async function consolidateTabsByClassifiedSite(
  targetWindowId: number,
): Promise<{ ok: true; tabCount: number; groupCount: number } | { ok: false; error: string }> {
  let targetWindow: chrome.windows.Window;
  try {
    targetWindow = await chrome.windows.get(targetWindowId, { populate: false });
  } catch {
    return {
      ok: false,
      error: "Target window not found. Focus a normal browser window and try again.",
    };
  }
  if (targetWindow.type !== "normal") {
    return { ok: false, error: "Only normal windows can be used as the consolidation target." };
  }
  const targetIncognito = targetWindow.incognito ?? false;

  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const eligible: chrome.tabs.Tab[] = [];
  for (const w of windows) {
    if (!w.tabs || (w.incognito ?? false) !== targetIncognito) continue;
    for (const tab of w.tabs) {
      if (tab.id == null) continue;
      if (tabIsEligibleForSiteConsolidation(tab)) eligible.push(tab);
    }
  }

  if (eligible.length === 0) {
    return {
      ok: false,
      error: "No eligible tabs (unpinned http(s) pages). Pinned and internal tabs are skipped.",
    };
  }

  const eligibleWithIds = eligible.filter((t): t is chrome.tabs.Tab & { id: number } => t.id != null);
  const clusters = sortTabsIntoClassifiedClusters(eligibleWithIds);
  const orderedIds = clusters.flatMap((c) => c.tabIds);

  await chrome.tabs.ungroup(orderedIds);

  const targetTabs = await chrome.tabs.query({ windowId: targetWindowId });
  const sortedTarget = [...targetTabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const pinned = sortedTarget.filter((t) => t.pinned);
  const insertIndex =
    pinned.length === 0 ? 0 : (pinned[pinned.length - 1].index ?? 0) + 1;

  await chrome.tabs.move(orderedIds, { windowId: targetWindowId, index: insertIndex });

  let groupCount = 0;
  let colorIdx = 0;
  for (const cluster of clusters) {
    if (cluster.tabIds.length < 2) continue;
    try {
      const gid = await chrome.tabs.group({ tabIds: cluster.tabIds });
      const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length];
      colorIdx += 1;
      await chrome.tabGroups.update(gid, {
        title: cluster.info.label,
        color,
        collapsed: false,
      });
      groupCount += 1;
    } catch {
      /* e.g. race with user closing a tab */
    }
  }

  return { ok: true, tabCount: orderedIds.length, groupCount };
}
