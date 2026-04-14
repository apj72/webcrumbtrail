# WebCrumbTrail

<p align="center">
  <img src="./extension/images/named_banner.png" alt="WebCrumbTrail" width="520" />
</p>

WebCrumbTrail is a local-first Chrome and Brave extension (Manifest V3). It records page visits only for hostnames you allow, and it can attach summaries when you ask for them. Summaries never run automatically.

## What it does

Visit logging

- Tracks pages whose hostname matches your allowlist (exact names or patterns such as `*.example.com`).
- Deduplicates visits within a configurable time window so repeated loads do not inflate counts without reason.
- Stores pages and visit history in IndexedDB on your machine.
- Optional logging in Incognito windows (off by default; enable in Settings if you want it).

Allowlist without opening Settings

- On a page that is not yet allowlisted, open the extension popup and use “Add this domain to allowlist & log page”. That adds the current tab’s hostname to the list, enables it if the rule already existed but was off, and records this visit. Use a normal http(s) tab; the hostname must match what you see in the address bar (for example `www.example.com` and `example.com` are different rules).

Popup

- Shows whether the current site is allowlisted and whether the page is already stored.
- OpenAI-compatible cloud API, Google Gemini, or local Ollama summarisation on demand, plus a manual path that copies a prompt for a browser chat and lets you paste the reply back.

Report viewer

- Open from the popup. Filter and sort the table, open the detail pane for one page, export filtered rows as CSV, or export or import full JSON backups.
- In the detail pane, **Open in new window** next to the URL opens the stored page in a new browser window (uses the last-seen URL when available).
- Delete stored pages from the table or the detail pane. Deleting removes that page and all of its visit events. Turn on “Enable delete” at the top of the report before delete buttons work, so stray clicks do not remove data.

Options

- Edit the allowlist, dedupe interval, summarisation provider (OpenAI, Gemini, or Ollama), endpoints, and Incognito behaviour.

Other

- Context menu entry to request a summary for the current page (when summarisation is enabled).
- No telemetry.

## Quick install

```bash
cd extension
npm install
npm run build
```

In the browser, open the extensions page (`chrome://extensions` or `brave://extensions`), enable developer mode, choose Load unpacked, and select the `extension/dist` folder inside this repository.

Local **Ollama** on the default URL (`http://127.0.0.1:11434` or `localhost`) works without manual `OLLAMA_ORIGINS` configuration (the extension adjusts the request for CORS). Other ports or hosts may still need `OLLAMA_ORIGINS` on the Ollama side. **OpenAI**, **Gemini**, or other cloud APIs need a key in Settings when you use that provider. Install, build, providers, and troubleshooting are documented in [`extension/README.md`](./extension/README.md).

## Repository layout

| Topic | Location |
|-------|----------|
| Install and Ollama notes | [`extension/README.md`](./extension/README.md) |
| User guide | [`extension/USER_GUIDE.md`](./extension/USER_GUIDE.md) |
| Technical design | [`extension/DESIGN.md`](./extension/DESIGN.md) |
| License | [MIT](./LICENSE) |
