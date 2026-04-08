# WebCrumbTrail — Cursor Build Prompt

Build a local-first Chrome/Brave browser extension called **WebCrumbTrail**.

## Goal
Create a browser extension that automatically logs pages I visit, but only for a configurable allowlist of domains. The tool is for knowledge work and memory aid. It must track unique pages, revisit history, and page metadata. It must include a report viewer where I can browse what I looked at and click links back to the original pages.

A key requirement is **efficiency**: the extension must **log matching page visits automatically**, but it must **not automatically generate page summaries**. Summarisation must be an **explicit user action** so that I only spend LLM/API cost on pages I decide are worth keeping or understanding later.

## Primary use case
I revisit pages such as Jira tickets, SharePoint pages, and Red Hat docs many times. I want to know:
- what I looked at
- when I first looked at it
- when I last looked at it
- how many times I visited it
- a visit timeline for each page
- optionally, a manually requested summary for important pages

Example domains:
- redhat.atlassian.net
- nokia.sharepoint.com
- docs.redhat.com

## Core product principles
- **Local-first** by default
- **Automatic logging** only for configured domains
- **Manual summarisation** only when explicitly requested by the user
- **Low noise** visit tracking with sensible deduplication
- **Practical reporting UI** with clickable links back to source pages
- **No telemetry**

## Requirements

### 1. Browser extension
- Use **Chrome Extension Manifest V3**
- Must work in **Chrome and Brave**
- No mandatory backend for v1
- Everything should work locally except optional LLM/API summarisation

### 2. Domain allowlist
- Provide a **settings page** where I can configure allowed domains
- Support:
  - exact domains
  - wildcard subdomains
- Only log pages when the current URL matches the allowlist
- Support enabling/disabling domains without deleting config

### 3. Unique page tracking
- Canonicalize URLs before storing them
- Remove obvious tracking query parameters where safe to do so
- Store one unique page record per canonical URL
- Each page record must include:
  - `id`
  - `canonical_url`
  - `original_url`
  - `domain`
  - `title`
  - `first_seen_at`
  - `last_seen_at`
  - `visit_count`
  - `content_hash` (optional until a page is summarised or inspected)
  - `latest_summary` (nullable)
  - `latest_summary_updated_at` (nullable)
  - `summary_status` (`not_requested`, `queued`, `completed`, `failed`)

### 4. Visit journaling
- Every page view on an allowed domain should create or update tracking state
- Each page visit event must include:
  - `id`
  - `page_id`
  - `visited_at`
  - `title_at_visit`
- Add **deduplication/debouncing** so repeated refreshes, redirects, or quick tab switches do not create noisy duplicate visit events
- Example policy:
  - count a new visit if URL changed, or
  - count a new visit if at least **N minutes** have elapsed since the last logged visit for that page in that tab/session
- Make this threshold configurable

### 5. Manual page summarisation
This is a critical requirement.

- The extension must **not automatically summarise pages on visit**
- Summaries must be created **only when the user explicitly requests one**
- The request can be triggered from:
  - the extension popup on the current page
  - the page detail view in the report UI
  - optionally a context menu action
- Use a content script to extract visible page text because many target pages are authenticated
- Summarisation must use the content visible in the browser, not a server-side refetch of the URL
- When a summary is requested:
  - extract current page content
  - compute/store a content hash
  - generate a summary
  - save summary to the page record
- If the page was previously summarised, provide an option to **refresh summary** only when explicitly requested
- Do **not** automatically refresh or regenerate summaries just because content changes; that should also be user-controlled
- Summary format should be practical for recall, e.g.:
  - short paragraph plus key bullets, or
  - 5–8 bullets focused on the important content
- Make summarisation provider pluggable:
  - start with **OpenAI-compatible API support**
  - API key stored locally in extension settings
  - clear provider abstraction for future local model support
- Include a global toggle to disable summarisation features entirely
- Clearly indicate in the UI when page text will be sent to an external API

### 6. Local storage
- Use **IndexedDB** for v1
- Create a storage abstraction layer so storage can later be swapped to SQLite/export format
- Add:
  - JSON export/import
  - optional CSV export for report data

### 7. Report viewer
Build a clean report UI inside the extension, preferably as a full-page dashboard.

Must support:
- list of all tracked pages
- search by title or URL
- filter by domain
- filter by date range
- filter by summary status
- sort by last seen, first seen, visit count, domain
- click each item to open the original page in a new tab
- detail page showing:
  - page metadata
  - latest summary if available
  - summary status
  - visit timeline
  - button to request or refresh summary

The viewer should be practical, fast, and suitable for regular use as a memory aid.

### 8. Popup / quick actions
Create a simple popup for the active tab that shows:
- whether the current page matches the allowlist
- canonical URL
- whether the page is already tracked
- visit count
- first seen / last seen
- summary status
- button to request summary
- button to open the full report viewer

### 9. Privacy and safety
- Everything local-first by default
- No telemetry
- No silent upload of browsing history
- Do not monitor incognito/private windows unless explicitly enabled by the user
- If summarisation is enabled, make it explicit that selected page content may be sent to an external LLM provider
- Keep secrets/API keys in extension local storage with appropriate care

### 10. Architecture
- Use **TypeScript**
- Use a simple, maintainable structure
- Suggested stack:
  - Manifest V3
  - React for popup, settings, and report UI
  - background service worker for orchestration
  - content scripts for page extraction
  - IndexedDB for persistence
- Keep dependencies reasonable and minimal

### 11. URL canonicalisation guidance
Implement a practical URL canonicaliser with a clear extension point for domain-specific rules.

Base behaviour:
- lowercase scheme and host
- remove fragment/hash by default
- remove obvious tracking params like `utm_*`, `fbclid`, etc.
- preserve query params unless a domain-specific rule says otherwise

Domain-specific examples:
- `redhat.atlassian.net`: preserve issue/ticket identity and important navigation parameters if needed
- `docs.redhat.com`: avoid treating irrelevant anchors/fragments as separate pages unless configured otherwise
- `nokia.sharepoint.com`: preserve enough identity to avoid collapsing distinct pages incorrectly

The code should make domain-specific canonicalisation easy to extend.

### 12. Data model
At minimum define these logical entities:
- `DomainRule`
- `PageRecord`
- `VisitEvent`
- `SummaryRecord` or equivalent embedded page summary structure
- `SettingsRecord`

### 13. Build in phases
#### Phase 1
- Manifest V3 skeleton
- domain allowlist
- URL canonicalisation
- page logging
- visit journaling with deduplication
- popup showing tracking status
- report viewer
- JSON export

#### Phase 2
- manual summarisation flow
- content extraction via content script
- OpenAI-compatible summarisation provider
- summary status tracking
- page detail view with summary actions

#### Phase 3
- domain-specific canonicalisation plugins
- tags/notes
- CSV export
- optional semantic search over summaries
- optional local model support

### 14. Deliverables
Generate:
- complete project code
- `README.md` with install and development steps
- clear folder structure
- a short technical design document
- sample/mock seed data for UI development
- tests for:
  - allowlist matching
  - URL canonicalisation
  - visit deduplication
  - summary status transitions

### 15. UX expectations
- Clean, professional UI
- Practical over flashy
- Easy to inspect tracked pages and reopen links
- Easy to request summaries only when needed
- Clear visibility of what is tracked automatically vs what is summarised manually

### 16. Non-goals for v1
- No cloud sync
- No multi-user/team features
- No remote crawler
- No enterprise deployment complexity
- No automatic summarisation of every visited page

## Implementation request
Please start by:
1. proposing the folder structure
2. defining the TypeScript interfaces and storage schema
3. implementing the Manifest V3 skeleton
4. implementing domain allowlist matching
5. implementing URL canonicalisation
6. implementing page logging and visit journaling
7. implementing the popup and report viewer
8. then implementing manual summarisation

## Important design note
The tool must be efficient and cost-aware.

It should behave like this:
- **Logging is automatic** for matching domains
- **Summarisation is manual** and only happens when I explicitly ask for it
- The report viewer should make it easy to decide which pages are worth summarising later

The goal is to create a durable personal journal of pages visited across a small set of important work domains, without wasting resources summarising pages that turn out not to matter.