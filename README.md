# WebCrumbTrail

**WebCrumbTrail** is a local-first Chrome/Brave extension (Manifest V3) that logs visits only on **allowlisted domains** and supports **manual** (web chat) or **API** summarisation (OpenAI cloud or **local Ollama**) when you explicitly request it.

| Resource | Location |
|----------|----------|
| **Install & Ollama setup** | [`webcrumbtrail/README.md`](./webcrumbtrail/README.md) |
| Architecture | [`webcrumbtrail/DESIGN.md`](./webcrumbtrail/DESIGN.md) |
| Original specification | [`prompt.md`](./prompt.md) |
| Push to GitHub | [`docs/GITHUB.md`](./docs/GITHUB.md) |
| License | [MIT](./LICENSE) |

## Quick install

```bash
cd webcrumbtrail
npm install
npm run build
```

Load **unpacked** from **`webcrumbtrail/dist`** in `chrome://extensions` (enable **Developer mode**).

**Ollama (local summaries):** install [Ollama](https://ollama.com), pull a model (`ollama pull llama3.2`), set `OLLAMA_ORIGINS='chrome-extension://*'` when starting Ollama (avoids **403** from the extension), then in the extension choose **Ollama (local)** under Settings → Summarisation and use **Test API connection**. Full steps: **[`webcrumbtrail/README.md`](./webcrumbtrail/README.md)**.

**OpenAI (cloud):** add an API key under **Settings** when **OpenAI (cloud API)** is selected. Keys: [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

## GitHub

This repo is intended to be pushed to a public GitHub remote. See [`docs/GITHUB.md`](./docs/GITHUB.md) for `git remote` and `git push`. If you use [GitHub CLI](https://cli.github.com/) (`gh`), ensure your token includes the **`repo`** scope (`gh auth refresh -h github.com -s repo`) so create/push works.
