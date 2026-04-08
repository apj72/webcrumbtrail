# Domain Journal — Technical design

## Overview

Domain Journal is a Manifest V3 extension built with **Vite**, **React**, and **TypeScript**. The UI uses relative asset paths (`base: './'`) so scripts load correctly under `chrome-extension://` URLs.

## Components

| Piece | Role |
| --- | --- |
| Service worker | Subscribes to `chrome.tabs.onCompleted` (via `tabs.onUpdated` with `status === 'complete'`); filters by allowlist and incognito policy; writes pages/visits to IndexedDB; handles summarisation via `chrome.scripting.executeScript` to read `document.body.innerText`; exposes messaging for popup/report/options |
| IndexedDB (`idb`) | Stores `PageRecord` and `VisitEvent`; indexes on domain, last seen, page id, visited_at |
| `chrome.storage.local` | Stores `SettingsRecord` including API key and domain rules |
| Popup / Options / Report | React apps; report reads IndexedDB directly (same extension origin) |

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
- `storage`, `tabs`, `scripting`, `contextMenus` — settings, tab access, script injection, optional menu.

## Future (Phase 3 hints)

- Stronger canonical index (e.g. by `canonical_url` key) for large datasets
- Tags/notes, semantic search, local model provider implementing the same interface as `summarizeWithOpenAICompatible`
