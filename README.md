# Webhistory memory aid — Domain Journal

**Domain Journal** is a local-first Chrome/Brave extension (Manifest V3) that logs visits only on **allowlisted domains** and supports **manual** page summarisation via an OpenAI-compatible API (no automatic summarisation of every visit).

| Resource | Location |
|----------|----------|
| Extension source & user docs | [`domain-journal/README.md`](./domain-journal/README.md) |
| Architecture notes | [`domain-journal/DESIGN.md`](./domain-journal/DESIGN.md) |
| Original build specification | [`prompt.md`](./prompt.md) |
| **Publish to GitHub** | [`docs/GITHUB.md`](./docs/GITHUB.md) |
| License | [MIT](./LICENSE) |

## Quick start

```bash
cd domain-journal
npm install
npm run build
```

Load **unpacked** from `domain-journal/dist` in `chrome://extensions` (Developer mode). Details, tests, and OpenAI API setup are in [`domain-journal/README.md`](./domain-journal/README.md).

## OpenAI API key (short version)

1. Create or sign in to an OpenAI account.
2. Open **[API keys](https://platform.openai.com/api-keys)** on the OpenAI Platform.
3. **Create new secret key**, copy it once, and paste it into Domain Journal **Settings** (stored only in your browser).

You need [billing / usage limits](https://platform.openai.com/settings/organization/billing) configured on your OpenAI account for API calls to succeed. Full steps are in the extension README.

## Publishing this project on GitHub

See **[`docs/GITHUB.md`](./docs/GITHUB.md)** for creating a **public** repository, initial `git` commands, and optional `gh` CLI usage.
