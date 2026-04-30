# WebCrumbTrail (extension package)

This folder contains the extension source and build output. For an overview of behaviour and features, see the [repository README](../README.md).

## Build and load

Prerequisites: Node.js 18+, npm, Chrome or Brave.

```bash
cd extension
npm install
npm run build
```

Load the unpacked extension from `dist/` (Developer mode → Load unpacked → choose this repo’s `extension/dist` folder).

**Tab consolidation** uses the `tabGroups` permission so the extension can create named groups after moving tabs; rebuild and reload the extension after updates so the manifest stays in sync.

**Chrome history export** (report viewer) uses the `history` permission to read the browser’s native history for incremental JSON backups.

## First-time configuration

Open WebCrumbTrail → Settings from the popup or the extensions list. Add hostnames under Domain allowlist (exact or `*.suffix` patterns) and save. Configure summarisation if you want API or Ollama summaries; otherwise you can rely on the manual web-chat flow in the popup.

## Ollama (local)

Install [Ollama](https://ollama.com), pull a model (for example `ollama pull llama3.2` or `ollama pull qwen3:8b`). In Settings → Summarisation, choose **Ollama (local)**, set base URL (default `http://127.0.0.1:11434/v1`) and **model** to match `ollama list`, save, then use **Test API connection**.

### Default URL / port (no `OLLAMA_ORIGINS` required)

For API calls to **port 11434** on `127.0.0.1`, `localhost`, or `[::1]`, WebCrumbTrail uses **Declarative Net Request** rules to set the **`Origin` request header** to a value Ollama already allows (`http://127.0.0.1` or `http://localhost`). You normally **do not** need to configure `OLLAMA_ORIGINS` on Ollama for that setup.

After pulling extension updates, run `npm run build` and **Reload** the extension on `chrome://extensions` so the ruleset is applied.

### Custom host or port

If the Ollama base URL uses **another port or host**, the built-in rules do not apply. Set `OLLAMA_ORIGINS` on the Ollama process (comma-separated origins). See the [Ollama FAQ](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama). Example for a trusted machine:

```bash
OLLAMA_ORIGINS='chrome-extension://*,moz-extension://*,safari-web-extension://*' ollama serve
```

On **macOS**, if the menu bar app does not pick up environment variables, run Ollama from a terminal with the variable on the same line, or use `launchctl setenv` and verify with `launchctl getenv OLLAMA_ORIGINS` before starting Ollama. **Linux (systemd):** add `Environment="OLLAMA_ORIGINS=..."` under `[Service]` in an override for `ollama.service`, then `daemon-reload` and restart. **Windows:** set a user environment variable and restart Ollama.

### HTTP 403 from Ollama

Usually means the running Ollama process did not receive `OLLAMA_ORIGINS` (check the server log line for `OLLAMA_ORIGINS` — extension schemes appear only when set). Prefer the **default 11434 URL** so the extension can handle CORS; otherwise configure `OLLAMA_ORIGINS` as above. Reload WebCrumbTrail after `npm run build` if you still see an outdated error message.

## OpenAI (cloud)

Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). In Settings → Summarisation, select OpenAI (cloud API), set base URL (often `https://api.openai.com/v1`), model, and API key, then save and test.

## Google Gemini (cloud)

Create an API key in [Google AI Studio](https://aistudio.google.com/apikey). In Settings → Summarisation, select Google Gemini, enter the model id (for example `gemini-2.0-flash`), paste the key, save, then use Test API connection. Summaries use the Gemini `generateContent` REST API; page text is sent to Google when you request a summary.

## Development

```bash
npm run test
npm run typecheck
```

After code changes, rebuild and reload the extension on the extensions page.

## Sample data

`mock/seed-export.json` can be imported from the report viewer for UI testing.

## Privacy

Visit data stays on disk unless you use cloud API summarisation, in which case page text is sent only when you request a summary. Ollama keeps traffic on your machine. Keys live in `chrome.storage.local`.

## Layout

| Path | Role |
|------|------|
| `src/background/` | Service worker |
| `src/lib/` | Allowlist, URLs, storage, LLM helpers, tab-session helpers (`classify-tab`, `group-tabs-by-site`) |
| `src/popup`, `src/options`, `src/report` | React UI |
| `public/manifest.json` | Copied into `dist` |
| `public/rules/ollama_cors.json` | DNR rules: `Origin` header for default local Ollama port |

Architecture notes: [`DESIGN.md`](./DESIGN.md).
