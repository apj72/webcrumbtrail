# WebCrumbTrail (extension package)

This folder contains the extension source and build output. For an overview of behaviour and features, see the [repository README](../README.md).

## Build and load

Prerequisites: Node.js 18+, npm, Chrome or Brave.

```bash
cd webcrumbtrail
npm install
npm run build
```

Load the unpacked extension from `dist/` (Developer mode → Load unpacked → choose `webcrumbtrail/dist`).

## First-time configuration

Open WebCrumbTrail → Settings from the popup or the extensions list. Add hostnames under Domain allowlist (exact or `*.suffix` patterns) and save. Configure summarisation if you want API or Ollama summaries; otherwise you can rely on the manual web-chat flow in the popup.

## Ollama (local)

Install [Ollama](https://ollama.com), pull a model (for example `ollama pull llama3.2`), and allow extension origins so requests are not rejected with 403:

```bash
OLLAMA_ORIGINS='chrome-extension://*' ollama serve
```

On macOS with the Ollama app, you may need `launchctl setenv` for `OLLAMA_ORIGINS` and a restart; see Ollama docs for your platform.

In Settings → Summarisation, choose Ollama (local), set base URL (default `http://127.0.0.1:11434/v1`) and model to match `ollama list`, save, then use Test API connection.

## OpenAI (cloud)

Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). In Settings → Summarisation, select OpenAI (cloud API), set base URL (often `https://api.openai.com/v1`), model, and API key, then save and test.

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
| `src/lib/` | Allowlist, URLs, storage, LLM helpers |
| `src/popup`, `src/options`, `src/report` | React UI |
| `public/manifest.json` | Copied into `dist` |

Architecture notes: [`DESIGN.md`](./DESIGN.md).
