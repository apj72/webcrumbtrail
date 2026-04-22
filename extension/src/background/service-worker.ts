import { consolidateTabsByClassifiedSite } from "../lib/tab-session/group-tabs-by-site";
import { hostMatchesRules } from "../lib/allowlist";
import { canonicalizeUrl } from "../lib/canonicalize";
import { shouldCountNewVisit } from "../lib/dedupe";
import { shouldSkipLoggingForUrl } from "../lib/url-logging-exclude";
import { sha256Hex } from "../lib/hash";
import { buildChatGptJournalDocument, MANUAL_JOURNAL_PAGE_CHAR_BUDGET } from "../lib/chatgpt-journal";
import { googleWorkspaceDocumentRollupKey } from "../lib/google-workspace-url";
import { hostnameIsSharePoint, normalizeTitleForRollup } from "../lib/page-rollup";
import {
  getDB,
  getLastVisitForPage,
  getPageByCanonical,
  getPageByDomainAndTitleKey,
  getPageByGoogleWorkspaceDocKey,
  getPageById,
  mergeRollupDuplicatePages,
  putPage,
  addVisit,
} from "../lib/storage/idb";
import { loadSettings, saveSettings } from "../lib/storage/settings";
import { exportAll } from "../lib/storage/export-import";
import { effectiveOpenAICompatible } from "../lib/llm-provider";
import { summarizeWithOpenAICompatible, testOpenAICompatibleConnection } from "../lib/summarize/openai-compatible";
import { summarizeWithGemini, testGeminiConnection } from "../lib/summarize/gemini";
import type { DomainRule, PageRecord } from "../shared/types";
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
  if (shouldSkipLoggingForUrl(url, settings.urlLoggingExcludePrefixes)) return;

  const canonical = canonicalizeUrl(url);
  const domain = hostname.toLowerCase();
  const now = Date.now();
  const db = await getDB();

  let page = await getPageByCanonical(db, canonical);
  const titleKey = normalizeTitleForRollup(title || "");
  if (!page && titleKey && hostnameIsSharePoint(domain)) {
    page = await getPageByDomainAndTitleKey(db, domain, titleKey);
  }
  const docKey = googleWorkspaceDocumentRollupKey(url);
  if (!page && docKey) {
    page = await getPageByGoogleWorkspaceDocKey(db, docKey);
  }
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
      summary_title: null,
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

/** API / LLM summaries: generous cap; extraction prefers main content to reduce nav noise. */
const API_SUMMARY_TEXT_MAX = 120_000;

/**
 * Injected into the page. Must stay self-contained (Chrome serialises the function).
 * Prefers main/article, Google Docs editor surface, then falls back to body.
 */
function extractPageTextForJournal(maxChars: number): string {
  const truncate = (text: string, max: number): string => {
    const t = text.replace(/\n{3,}/g, "\n\n").trim();
    if (t.length <= max) return t;
    const slice = t.slice(0, max);
    const br = slice.lastIndexOf("\n\n");
    const cut = br > max * 0.55 ? slice.slice(0, br) : slice;
    return cut.replace(/\s+$/, "") + "\n\n[… WebCrumbTrail: truncated for prompt size …]";
  };

  try {
    const hostname = window.location.hostname;
    const path = window.location.pathname;

    let source: Element | null = null;
    if (hostname === "docs.google.com" && path.includes("/document")) {
      source =
        document.querySelector(".kix-appview-editor") ||
        document.querySelector(".kix-page-content-wrapper") ||
        document.querySelector('[aria-label*="Document content" i]') ||
        document.querySelector('[role="document"]');
    }

    if (!source) {
      source =
        document.querySelector("main") ||
        document.querySelector("article") ||
        document.querySelector('[role="main"]') ||
        document.body;
    }

    const htmlSource = source as HTMLElement | null;
    let raw = htmlSource?.innerText ?? "";
    if (!raw.trim() && source !== document.body) {
      raw = document.body?.innerText ?? "";
    }
    return truncate(raw, maxChars);
  } catch {
    return "";
  }
}

function notWebPageMessage(resolvedUrl: string): string {
  const hint = resolvedUrl
    ? `Active tab address is not http(s): ${resolvedUrl.slice(0, 120)}${resolvedUrl.length > 120 ? "…" : ""}`
    : "Could not read a page URL (empty). Focus the Google Docs tab in your browser, then open the WebCrumbTrail popup again.";
  return `Not a web page. ${hint} (Not an auth issue: a loaded Doc still has an https address.)`;
}

async function resolveHttpTabUrl(tab: chrome.tabs.Tab, tabId: number): Promise<string> {
  let url = tab.url ?? tab.pendingUrl ?? "";
  if (url.startsWith("http")) return url;
  try {
    const [{ result } = { result: "" }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => location.href,
    });
    if (typeof result === "string" && result.startsWith("http")) return result;
  } catch {
    /* restricted or no script access */
  }
  return url;
}

async function runSummaryForTab(tabId: number, refresh: boolean): Promise<MsgSummaryResult> {
  const settings = await loadSettings();
  if (!settings.summarizationEnabled) {
    return { ok: false, error: "Summarisation is disabled in settings." };
  }
  const tab = await chrome.tabs.get(tabId);
  const url = await resolveHttpTabUrl(tab, tabId);
  if (!url.startsWith("http")) {
    return {
      ok: false,
      error: notWebPageMessage(url),
    };
  }

  const [{ result: text } = { result: "" }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageTextForJournal,
    args: [API_SUMMARY_TEXT_MAX],
  });

  const title = tab.title ?? "";
  const canonical = canonicalizeUrl(url);
  const db = await getDB();
  const domain = new URL(url).hostname.toLowerCase();
  let page = await getPageByCanonical(db, canonical);
  const sumTitleKey = normalizeTitleForRollup(title || "");
  if (!page && sumTitleKey && hostnameIsSharePoint(domain)) {
    page = await getPageByDomainAndTitleKey(db, domain, sumTitleKey);
  }
  const sumDocKey = googleWorkspaceDocumentRollupKey(url);
  if (!page && sumDocKey) {
    page = await getPageByGoogleWorkspaceDocKey(db, sumDocKey);
  }
  if (!page) {
    const id = crypto.randomUUID();
    const now = Date.now();
    page = {
      id,
      canonical_url: canonical,
      original_url: url,
      domain,
      title,
      first_seen_at: now,
      last_seen_at: now,
      visit_count: 1,
      content_hash: null,
      summary_title: null,
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
    const input = { title, text: text ?? "", url };
    const prov = settings.summarizationProvider ?? "openai";
    const summary =
      prov === "gemini"
        ? await summarizeWithGemini(settings.gemini, input)
        : await summarizeWithOpenAICompatible(effectiveOpenAICompatible(settings), input);
    page.content_hash = hash;
    page.latest_summary = summary;
    page.summary_title = null;
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

/** Add exact hostname to allowlist (or enable existing rule), then record this visit when policy allows. */
async function addDomainAndLogTab(
  tabId: number,
): Promise<{ ok: true; logged: boolean; warning?: string } | { ok: false; error: string }> {
  try {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return {
        ok: false,
        error: "Could not read that tab. Close the popup, focus the page you want, and try again.",
      };
    }
    const url = await resolveHttpTabUrl(tab, tabId);
    if (!url.startsWith("http")) {
      return { ok: false, error: "Only http(s) pages can be allowlisted." };
    }
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return { ok: false, error: "Invalid page URL." };
    }
    if (!hostname) {
      return { ok: false, error: "Could not read hostname." };
    }

    const settings = await loadSettings();
    const hostNorm = hostname;
    const rules: DomainRule[] = settings.domainRules.map((r) => ({ ...r }));
    const idx = rules.findIndex((r) => r.pattern.trim().toLowerCase() === hostNorm);
    if (idx >= 0) {
      rules[idx] = { ...rules[idx], enabled: true };
    } else {
      rules.push({ id: crypto.randomUUID(), pattern: hostname, enabled: true });
    }
    await saveSettings({ ...settings, domainRules: rules });

    const after = await loadSettings();
    const incognito = tab.incognito ?? false;
    if (incognito && !after.allowIncognitoLogging) {
      return {
        ok: true,
        logged: false,
        warning:
          "Domain added. Incognito visits are not logged — enable “Allow incognito logging” in Settings or use a normal window.",
      };
    }

    await handleVisit(tabId, url, tab.title ?? "", incognito);
    return { ok: true, logged: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Something went wrong while saving the allowlist." };
  }
}

async function pageStatusForUrl(url: string, tabTitle?: string): Promise<MsgPageStatusReply> {
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
  const domain = hostname.toLowerCase();
  let page = await getPageByCanonical(db, canonical);
  const stKey = normalizeTitleForRollup(tabTitle ?? "");
  if (!page && stKey && hostnameIsSharePoint(domain)) {
    page = await getPageByDomainAndTitleKey(db, domain, stKey);
  }
  const statusDocKey = googleWorkspaceDocumentRollupKey(url);
  if (!page && statusDocKey) {
    page = await getPageByGoogleWorkspaceDocKey(db, statusDocKey);
  }
  return { allowed: true, canonical_url: canonical, page: page ?? null };
}

async function buildChatGptPromptForTab(
  tabId: number,
): Promise<{ ok: true; document: string } | { ok: false; error: string }> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, error: "Could not read that tab. Focus the page and try again." };
  }
  const url = await resolveHttpTabUrl(tab, tabId);
  if (!url.startsWith("http")) return { ok: false, error: notWebPageMessage(url) };
  const [{ result: text } = { result: "" }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageTextForJournal,
    args: [MANUAL_JOURNAL_PAGE_CHAR_BUDGET],
  });
  const document = buildChatGptJournalDocument({
    pageUrl: url,
    tabTitle: tab.title ?? "",
    visibleText: text ?? "",
  });
  return { ok: true, document };
}

async function testLlmFromSettings(): Promise<{ ok: boolean; preview?: string; provider?: string; error?: string }> {
  try {
    const settings = await loadSettings();
    const prov = settings.summarizationProvider ?? "openai";
    if (prov === "gemini") {
      const preview = await testGeminiConnection(settings.gemini);
      return { ok: true, preview, provider: "Google Gemini" };
    }
    const opts = effectiveOpenAICompatible(settings);
    const preview = await testOpenAICompatibleConnection(opts);
    return {
      ok: true,
      preview,
      provider: prov === "ollama" ? "Ollama (local)" : "OpenAI / compatible API",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function saveManualJournalEntry(input: {
  pageId?: string;
  tabId?: number;
  summaryTitle: string;
  description: string;
}): Promise<{ ok: boolean; error?: string }> {
  const summaryTitle = input.summaryTitle.trim();
  const description = input.description.trim();
  if (!summaryTitle || !description) {
    return { ok: false, error: "Title and description are required." };
  }
  const db = await getDB();
  let page: PageRecord | undefined;
  if (input.pageId) {
    page = await getPageById(db, input.pageId);
  } else if (input.tabId != null) {
    const tab = await chrome.tabs.get(input.tabId);
    const url = await resolveHttpTabUrl(tab, input.tabId);
    if (!url.startsWith("http")) return { ok: false, error: notWebPageMessage(url) };
    const canonical = canonicalizeUrl(url);
    const domain = new URL(url).hostname.toLowerCase();
    page = await getPageByCanonical(db, canonical);
    const mjKey = normalizeTitleForRollup(tab.title ?? "");
    if (!page && mjKey && hostnameIsSharePoint(domain)) {
      page = await getPageByDomainAndTitleKey(db, domain, mjKey);
    }
    const mjDocKey = googleWorkspaceDocumentRollupKey(url);
    if (!page && mjDocKey) {
      page = await getPageByGoogleWorkspaceDocKey(db, mjDocKey);
    }
    if (!page) {
      const now = Date.now();
      page = {
        id: crypto.randomUUID(),
        canonical_url: canonical,
        original_url: url,
        domain,
        title: tab.title ?? "(no title)",
        first_seen_at: now,
        last_seen_at: now,
        visit_count: 1,
        content_hash: null,
        summary_title: null,
        latest_summary: null,
        latest_summary_updated_at: null,
        summary_status: "not_requested",
      };
      await putPage(db, page);
    }
  } else {
    return { ok: false, error: "Missing page context." };
  }
  if (!page) return { ok: false, error: "Page not found." };
  page.summary_title = summaryTitle;
  page.latest_summary = description;
  page.latest_summary_updated_at = Date.now();
  page.summary_status = "completed";
  await putPage(db, page);
  return { ok: true };
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const u = tab.url;
  if (!u?.startsWith("http")) return;
  void handleVisit(tabId, u, tab.title ?? "", tab.incognito ?? false);
});

chrome.runtime.onMessage.addListener((message: { type: string; [k: string]: unknown }, _s, sendResponse) => {
    if (message.type === "GET_PAGE_STATUS") {
      const m = message as unknown as { url: string; title?: string };
      void pageStatusForUrl(m.url, m.title).then(sendResponse);
      return true;
    }
    if (message.type === "ADD_DOMAIN_AND_LOG") {
      const m = message as unknown as { tabId: number };
      void addDomainAndLogTab(m.tabId)
        .then(sendResponse)
        .catch((e: unknown) =>
          sendResponse({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
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
    if (message.type === "BUILD_CHATGPT_PROMPT") {
      const m = message as unknown as { tabId: number };
      void buildChatGptPromptForTab(m.tabId).then(sendResponse);
      return true;
    }
    if (message.type === "SAVE_MANUAL_JOURNAL") {
      const m = message as unknown as {
        pageId?: string;
        tabId?: number;
        summaryTitle: string;
        description: string;
      };
      void saveManualJournalEntry(m).then(sendResponse);
      return true;
    }
    if (message.type === "TEST_LLM_CONNECTION") {
      void testLlmFromSettings().then(sendResponse);
      return true;
    }
    if (message.type === "CONSOLIDATE_TABS_BY_SITE") {
      const m = message as unknown as { windowId: number };
      void consolidateTabsByClassifiedSite(m.windowId)
        .then(sendResponse)
        .catch((e: unknown) =>
          sendResponse({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      return true;
    }
    return false;
  },
);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "dj-summarize",
      title: "Request WebCrumbTrail summary for this page",
      contexts: ["page"],
    });
  });
  void getDB()
    .then((db) => mergeRollupDuplicatePages(db))
    .catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "dj-summarize" || tab?.id == null) return;
  void runSummaryForTab(tab.id, true);
});
