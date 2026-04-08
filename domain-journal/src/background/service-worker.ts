import { hostMatchesRules } from "../lib/allowlist";
import { canonicalizeUrl } from "../lib/canonicalize";
import { shouldCountNewVisit } from "../lib/dedupe";
import { sha256Hex } from "../lib/hash";
import { getDB, getLastVisitForPage, getPageByCanonical, putPage, addVisit } from "../lib/storage/idb";
import { loadSettings, saveSettings } from "../lib/storage/settings";
import { exportAll } from "../lib/storage/export-import";
import { summarizeWithOpenAICompatible } from "../lib/summarize/openai-compatible";
import type { MsgPageStatusReply, MsgSummaryResult } from "../shared/messages";

async function handleVisit(
  tabId: number,
  url: string,
  title: string,
  incognito: boolean,
): Promise<void> {
  const settings = await loadSettings();
  if (incognito && !settings.allowIncognitoLogging) return;

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }
  if (!hostMatchesRules(hostname, settings.domainRules)) return;

  const canonical = canonicalizeUrl(url);
  const domain = hostname.toLowerCase();
  const now = Date.now();
  const db = await getDB();

  let page = await getPageByCanonical(db, canonical);
  if (!page) {
    const id = crypto.randomUUID();
    page = {
      id,
      canonical_url: canonical,
      original_url: url,
      domain,
      title: title || "(no title)",
      first_seen_at: now,
      last_seen_at: now,
      visit_count: 1,
      content_hash: null,
      latest_summary: null,
      latest_summary_updated_at: null,
      summary_status: "not_requested",
    };
    await putPage(db, page);
    await addVisit(db, {
      id: crypto.randomUUID(),
      page_id: page.id,
      visited_at: now,
      title_at_visit: title || "(no title)",
    });
    return;
  }

  page.title = title || page.title;
  page.last_seen_at = now;
  page.original_url = url;

  const lastVisit = await getLastVisitForPage(db, page.id);
  if (shouldCountNewVisit(lastVisit?.visited_at, now, settings.visitDedupeMinutes)) {
    page.visit_count += 1;
    await addVisit(db, {
      id: crypto.randomUUID(),
      page_id: page.id,
      visited_at: now,
      title_at_visit: title || page.title,
    });
  }

  await putPage(db, page);
}

function extractVisibleText(): string {
  try {
    return document.body?.innerText?.slice(0, 120_000) ?? "";
  } catch {
    return "";
  }
}

async function runSummaryForTab(tabId: number, refresh: boolean): Promise<MsgSummaryResult> {
  const settings = await loadSettings();
  if (!settings.summarizationEnabled) {
    return { ok: false, error: "Summarisation is disabled in settings." };
  }
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url;
  if (!url?.startsWith("http")) {
    return { ok: false, error: "Not a web page." };
  }

  const [{ result: text } = { result: "" }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractVisibleText,
  });

  const title = tab.title ?? "";
  const canonical = canonicalizeUrl(url);
  const db = await getDB();
  let page = await getPageByCanonical(db, canonical);
  if (!page) {
    const id = crypto.randomUUID();
    const now = Date.now();
    page = {
      id,
      canonical_url: canonical,
      original_url: url,
      domain: new URL(url).hostname.toLowerCase(),
      title,
      first_seen_at: now,
      last_seen_at: now,
      visit_count: 0,
      content_hash: null,
      latest_summary: null,
      latest_summary_updated_at: null,
      summary_status: "not_requested",
    };
    await putPage(db, page);
  }

  if (!refresh && page.summary_status === "completed" && page.latest_summary) {
    return { ok: false, error: "Summary already exists. Use refresh to regenerate." };
  }

  page.summary_status = "queued";
  await putPage(db, page);

  try {
    const hash = await sha256Hex(text ?? "");
    const summary = await summarizeWithOpenAICompatible(settings.openaiCompatible, {
      title,
      text: text ?? "",
      url,
    });
    page.content_hash = hash;
    page.latest_summary = summary;
    page.latest_summary_updated_at = Date.now();
    page.summary_status = "completed";
    await putPage(db, page);
    return { ok: true };
  } catch (e) {
    page.summary_status = "failed";
    await putPage(db, page);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function pageStatusForUrl(url: string): Promise<MsgPageStatusReply> {
  const settings = await loadSettings();
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return {
      allowed: false,
      canonical_url: url,
      page: null,
    };
  }
  const allowed = hostMatchesRules(hostname, settings.domainRules);
  const canonical = canonicalizeUrl(url);
  if (!allowed) {
    return { allowed: false, canonical_url: canonical, page: null };
  }
  const db = await getDB();
  const page = await getPageByCanonical(db, canonical);
  return { allowed: true, canonical_url: canonical, page: page ?? null };
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const u = tab.url;
  if (!u?.startsWith("http")) return;
  void handleVisit(tabId, u, tab.title ?? "", tab.incognito ?? false);
});

chrome.runtime.onMessage.addListener((message: { type: string; [k: string]: unknown }, _s, sendResponse) => {
    if (message.type === "GET_PAGE_STATUS") {
      const m = message as unknown as { url: string };
      void pageStatusForUrl(m.url).then(sendResponse);
      return true;
    }
    if (message.type === "REQUEST_SUMMARY") {
      const m = message as unknown as { tabId: number; refresh: boolean };
      void runSummaryForTab(m.tabId, m.refresh).then(sendResponse);
      return true;
    }
    if (message.type === "GET_SETTINGS") {
      void loadSettings().then(sendResponse);
      return true;
    }
    if (message.type === "SAVE_SETTINGS") {
      const m = message as unknown as { settings: import("../shared/types").SettingsRecord };
      void saveSettings(m.settings).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.type === "EXPORT_JSON") {
      void exportAll().then((bundle) => sendResponse({ ok: true, bundle }));
      return true;
    }
    return false;
  },
);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "dj-summarize",
      title: "Request Domain Journal summary for this page",
      contexts: ["page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "dj-summarize" || tab?.id == null) return;
  void runSummaryForTab(tab.id, true);
});
