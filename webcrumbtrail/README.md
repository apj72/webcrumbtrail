# WebCrumbTrail

Local-first Chrome/Brave extension (Manifest V3) that logs visits to **allowlisted domains only**, with optional **manual** (web chat) or **API** summarisation when you explicitly request it.

## Install (from source)

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm  
- **Google Chrome** or **Brave**  
- Git (to clone the repository)

### 2. Clone and build

From your machine (adjust the path if you cloned elsewhere):

```bash
git clone <your-repo-url>
cd WebCrumbTrail/webcrumbtrail
npm install
npm run build
```

The production bundle is written to **`dist/`**.

### 3. Load the extension in the browser

1. Open **`chrome://extensions`** (Chrome) or **`brave://extensions`** (Brave).  
2. Turn on **Developer mode** (top right).  
3. Click **Load unpacked**.  
4. Select the **`webcrumbtrail/dist`** folder (the one that contains `manifest.json`, `popup.html`, `background.js`, etc.).  
5. Optional: pin the WebCrumbTrail icon to the toolbar.

### 4. First-time configuration

1. Click **WebCrumbTrail → Settings** (from the popup or the extensions list).  
2. Under **Domain allowlist**, add the hostnames you want to journal (exact names or `*.example.com`). Save.  
3. Choose how **API summaries** should run (next section). You can skip API setup and only use **Manual journal (web chat)** in the popup if you prefer.

---

## Configure API summarisation (pick one)

API summaries use **Settings → Summarisation → API summary provider**. Use **Test API connection** after saving to verify.

### Option A — Ollama (local, no cloud)

Best when you want everything to stay on your machine.

1. **Install Ollama** from [ollama.com](https://ollama.com/) and start it (menu bar app or `ollama serve`). It listens on **`127.0.0.1:11434`** by default.  
2. **Pull a model** (once), e.g.  
   `ollama pull llama3.2`  
3. **Allow the browser extension** — Ollama returns **403** to extension requests unless you whitelist the Chrome origin. Quit Ollama, then start it with:

   ```bash
   OLLAMA_ORIGINS='chrome-extension://*' ollama serve
   ```

   On macOS with the GUI app, you can instead run `launchctl setenv OLLAMA_ORIGINS 'chrome-extension://*'` and restart Ollama (may need repeating after reboot). For quick local testing only, `OLLAMA_ORIGINS='*'` is possible but broad.

4. In **WebCrumbTrail → Settings → Summarisation**: select **Ollama (local)**, confirm **Base URL** `http://127.0.0.1:11434/v1` and **Model** matches `ollama list` (e.g. `llama3.2`). Use **Reset Ollama fields to defaults** if needed. **Save settings**.  
5. Click **Test API connection**. You should see a success message.  
6. On a tracked page, use **Request Ollama summary** in the popup.

If **Test API connection** or summarisation returns **403**, see the troubleshooting line in Settings or the section **Ollama 403** below.

### Option B — OpenAI (cloud API)

1. Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).  
2. In **Settings → Summarisation**, select **OpenAI (cloud API)**. Set **Base URL** to `https://api.openai.com/v1` (or another OpenAI-compatible host), **Model** (e.g. `gpt-4o-mini`), and paste your **API key**. **Save settings**.  
3. **Test API connection**, then **Request API summary** on a tracked page.

Billing and limits are on your OpenAI account; the ChatGPT website subscription is separate from API usage.

---

## Manual journal (web chat, no API)

Use this when you paste into **chatgpt.com** (or similar) and paste the answer back — **no API key**, no Ollama required.

1. Open a tracked page → WebCrumbTrail popup → **Copy prompt for web chat** (includes visible text from your tab; works on VPN/internal sites).  
2. Paste into your chat, get a reply with `TITLE:` / `DESCRIPTION:` lines.  
3. Paste into **Paste web chat reply** or type **Journal title** / **What the page covers** → **Save manual journal entry**.

---

## Ollama 403 (troubleshooting)

Chrome extensions call Ollama with a `chrome-extension://…` origin. Without **OLLAMA_ORIGINS**, Ollama responds **403 Forbidden**.

1. Quit Ollama.  
2. Start with:

   ```bash
   OLLAMA_ORIGINS='chrome-extension://*' ollama serve
   ```

3. Run **Test API connection** in WebCrumbTrail settings again.

See also **Option A** above for macOS GUI and dev-only `*` origin.

---

## Features (summary)

- Domain allowlist (exact + `*.wildcard` hosts)  
- URL canonicalisation, visit deduplication, IndexedDB storage  
- Popup: tracking status, summarisation status, API vs manual flows  
- Report: filters, summary previews in the table, export JSON/CSV  
- **No telemetry**

## Development

```bash
cd webcrumbtrail
npm install
npm run build
```

- `npm run test` — Vitest  
- `npm run typecheck` — TypeScript  

After code changes: rebuild and **Reload** the extension on `chrome://extensions`.

## Sample data

`mock/seed-export.json` can be imported from the report viewer for UI testing.

## Privacy

- Visit data stays local unless you use **cloud API** summarisation (page text is sent only when you request it).  
- **Ollama** keeps requests on your computer.  
- Keys are stored in `chrome.storage.local`.

## Project layout

| Path | Role |
|------|------|
| `src/background/` | Service worker |
| `src/lib/` | Allowlist, URL rules, storage, LLM helpers |
| `src/popup`, `src/options`, `src/report` | React UI |
| `public/manifest.json` | Copied to `dist` |

See **DESIGN.md** for architecture notes.

## Repository

The parent repo may include **`docs/GITHUB.md`** with steps to push this project to GitHub.
