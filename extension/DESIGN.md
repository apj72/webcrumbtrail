# WebCrumbTrail — Technical design

## Overview

WebCrumbTrail is a Manifest V3 extension built with **Vite**, **React**, and **TypeScript**. The UI uses relative asset paths (`base: './'`) so scripts load correctly under `chrome-extension://` URLs. The **`windows`** permission is used so the popup can resolve the active tab in the last-focused *normal* browser window (not the popup itself), which avoids treating `chrome-extension://…` as the “current page” when using Google Docs and similar sites.

## Components

| Piece | Role |
| --- | --- |
| Service worker | Subscribes to `chrome.tabs.onCompleted` (via `tabs.onUpdated` with `status === 'complete'`); filters by allowlist and incognito policy; writes pages/visits to IndexedDB; extracts page text via `executeScript` using a content-aware helper (`main` / `article` / Google Docs editor surface, capped length); exposes messaging for popup/report/options |
| IndexedDB (`idb`) | Stores `PageRecord` and `VisitEvent`; indexes on domain, last seen, page id, visited_at |
| `chrome.storage.local` | Stores `SettingsRecord` including domain rules, `summarizationProvider` (`openai` \| `ollama` \| `gemini`), and separate OpenAI, Ollama, and Gemini fields |
| Popup / Options / Report | React apps; report reads IndexedDB directly (same extension origin); detail pane can open the stored URL in a new window via `chrome.windows.create` |

## URL canonicalisation

`canonicalizeUrl()` normalises scheme/host, strips fragments, removes common tracking query parameters, then applies optional hostname-keyed plugins (including `*.sharepoint.com` suffix matching). `registerDomainCanonicalizer()` allows future plugins without changing core logic.

## Visit deduplication

For an existing page, a **new `VisitEvent`** is recorded only if `shouldCountNewVisit(lastVisitTime, now, dedupeMinutes)` is true. `PageRecord.last_seen_at` is updated every time a matching navigation completes, even within the dedupe window, so “last seen” stays accurate without inflating visit noise.

## Summarisation

- Never runs on automatic navigation.
- User triggers from popup, report (active tab), or context menu.
- Flow: `queued` → OpenAI-compatible HTTP API → `completed` or `failed`; content hash (SHA-256 of extracted text) stored on success.
- Blocking rule: if status is `completed` and `latest_summary` is set, non-refresh requests are rejected (user must use **Refresh summary**).

## Storage abstraction

`src/lib/storage/idb.ts` and `settings.ts` isolate persistence. `export-import.ts` serialises pages, visits, and settings to JSON; CSV export is derived from page rows.

## Security / permissions

- `host_permissions: <all_urls>` — required to read tab URLs for allowlist filtering and to inject the extraction script on user-initiated summary.
- `storage`, `tabs`, `tabGroups`, `history`, `windows`, `scripting`, `contextMenus` — settings; tab access; **Chrome tab groups** for the optional “consolidate tabs by site type” action; **read native Chrome history** for optional incremental JSON backups (report page); **last-focused normal window** for “current tab” resolution; new window from report; script injection; optional menu.
- `declarativeNetRequest` — static rules (`public/rules/ollama_cors.json`) that set `Origin` to `http://127.0.0.1` / `http://localhost` for `fetch` requests to the default local Ollama port **11434**, so Ollama’s CORS allowlist accepts API calls from the extension without requiring `OLLAMA_ORIGINS` on the server for that case.

## Tab consolidation (popup)

`CONSOLIDATE_TABS_BY_SITE` with `scope`: **`focused_window`** (default when omitted: only tabs already in `targetWindowId`) or **`all_normal`** (`consolidateTabsByClassifiedSiteAcrossWindows` — all normal windows sharing the target’s incognito mode). Bucketing and tab groups behave the same (`classify-tab.ts`, after pinned tabs).

## Chrome history backup (report)

`PREPARE_BROWSER_HISTORY_EXPORT` / `COMMIT_BROWSER_HISTORY_EXPORT`: paged `chrome.history.search` over `[nextStart, now]`, where `nextStart` is **1 May 2025 (local midnight)** if `lastBrowserHistoryExportEndMs` is unset, else **last commit + 1 ms**. The UI downloads JSON, then commits the watermark so the next run is strictly incremental. Export files are not imported into IndexedDB.

## Future (Phase 3 hints)

- Stronger canonical index (e.g. by `canonical_url` key) for large datasets
- Tags/notes, semantic search, local model provider implementing the same interface as `summarizeWithOpenAICompatible`
