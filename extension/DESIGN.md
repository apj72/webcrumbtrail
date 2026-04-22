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
- `storage`, `tabs`, `tabGroups`, `windows`, `scripting`, `contextMenus` — settings; tab access; **Chrome tab groups** for the optional “consolidate tabs by site type” action; **last-focused normal window** for “current tab” resolution; new window from report; script injection; optional menu.
- `declarativeNetRequest` — static rules (`public/rules/ollama_cors.json`) that set `Origin` to `http://127.0.0.1` / `http://localhost` for `fetch` requests to the default local Ollama port **11434**, so Ollama’s CORS allowlist accepts API calls from the extension without requiring `OLLAMA_ORIGINS` on the server for that case.

## Tab consolidation (popup)

`CONSOLIDATE_TABS_BY_SITE` in the service worker calls `consolidateTabsByClassifiedSite(targetWindowId)`. Eligible tabs are unpinned, `http`/`https`, and not classified as browser-internal in `classify-tab.ts`. Tabs are bucketed with the same rules as the session overview (`sortOrder` then label), sorted by title within a bucket, moved in one `chrome.tabs.move` into the target window after that window’s pinned tabs, then `chrome.tabs.group` + `chrome.tabGroups.update` for buckets with at least two tabs. Incognito vs normal windows are not mixed.

## Future (Phase 3 hints)

- Stronger canonical index (e.g. by `canonical_url` key) for large datasets
- Tags/notes, semantic search, local model provider implementing the same interface as `summarizeWithOpenAICompatible`
