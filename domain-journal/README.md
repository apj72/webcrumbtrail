# Domain Journal

Local-first Chrome/Brave extension (Manifest V3) that logs visits to **allowlisted domains only**, with a **manual** summarisation flow so page text is only sent to an LLM when you explicitly request it.

## Features

- Configurable domain allowlist (exact hosts and `*.wildcard.com` patterns)
- URL canonicalisation with optional per-domain rules (Atlassian, SharePoint, docs.redhat.com examples)
- IndexedDB storage for pages and visits, settings in `chrome.storage.local`
- Visit deduplication (configurable minute window)
- Popup: tracking status, canonical URL, visit stats, summary actions
- Full-page report: search, filters, sort, visit timeline, JSON + CSV export/import
- OpenAI-compatible summarisation (API key in settings)
- Optional context menu: “Request Domain Journal summary for this page”
- No telemetry

## OpenAI API key

Summaries use the **OpenAI API** (or any **OpenAI-compatible** endpoint you configure). The extension does not ship a key; you create one on your account.

1. Sign in at [OpenAI Platform](https://platform.openai.com/).
2. Go to **[API keys](https://platform.openai.com/api-keys)** (also under **Settings → API keys** in the dashboard).
3. Click **Create new secret key**, give it a name (e.g. `Domain Journal`), and **copy the key immediately** — you will not see it again.
4. In the extension: **Domain Journal → Settings**, paste the key into **API key** and save.

**Billing:** API usage is billed to your OpenAI account. Add a payment method or prepaid credits under [Billing](https://platform.openai.com/settings/organization/billing) if required. You can set [usage limits](https://platform.openai.com/settings/organization/limits) in the dashboard.

**Compatible providers:** Any service that exposes `/v1/chat/completions` in OpenAI’s format works if you set **OpenAI-compatible base URL**, **Model**, and **API key** accordingly (e.g. some local gateways or other hosts).

**Security:** Treat the key like a password. It is stored in `chrome.storage.local` only on your machine and is **not** sent except to the base URL you configure when you request a summary.

## Install (development)

1. **Build**

   ```bash
   cd domain-journal
   npm install
   npm run build
   ```

2. **Load unpacked**

   - Open `chrome://extensions` (or Brave equivalent)
   - Enable **Developer mode**
   - **Load unpacked** → select the `domain-journal/dist` folder

3. **Optional: incognito**

   - Extension details → allow in Incognito (if you enable “Allow logging in private windows” in settings)

## Development

- `npm run build` — production bundle to `dist/`
- `npm run test` — Vitest unit tests
- `npm run typecheck` — TypeScript check

After code changes, rebuild and use **Reload** on the extension card.

## Sample data

`mock/seed-export.json` is a valid export bundle you can import from the report viewer to populate the UI during development.

## Privacy

- Browsing data stays on device except when you **explicitly** request a summary; then visible page text is sent to the API endpoint you configure.
- API keys are stored locally in extension storage.

## Project layout

- `src/background/` — service worker (logging, summarisation orchestration, messaging)
- `src/lib/` — allowlist, canonicalisation, storage, dedupe, hashing, summarisation provider
- `src/popup`, `src/options`, `src/report` — React UIs
- `public/manifest.json` — MV3 manifest (copied to `dist`)

See `DESIGN.md` for architecture notes.

## Repository (GitHub)

To publish this project as a **public** GitHub repository (clone, issues, README on the repo home), follow **[`../docs/GITHUB.md`](../docs/GITHUB.md)** from the repo root.
