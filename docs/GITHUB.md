# Publish to GitHub (public repository)

This assumes the code lives on your machine under this project folder and you want a **public** repo so others can clone and build the extension.

## 1. Create the repository on GitHub

1. Sign in at [github.com](https://github.com).
2. Click **+** → **New repository**.
3. Choose a name (e.g. `domain-journal` or `webhistory-memory-aid`).
4. Set visibility to **Public**.
5. Do **not** add a README, `.gitignore`, or license on GitHub if you already have them locally (avoids merge conflicts).
6. Click **Create repository**.

GitHub will show you commands; the ones below match a typical first push.

## 2. Initialize Git and push from your machine

In a terminal:

```bash
cd /path/to/Webhistory_memmory_aid

git init
git add .
git commit -m "Initial commit: Domain Journal browser extension"

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and the repo name you created.

If you use SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
```

## 3. Optional: GitHub CLI

If you have [`gh`](https://cli.github.com/) installed, sign in with a token that includes the **`repo`** scope (otherwise create/push fails):

```bash
gh auth refresh -h github.com -s repo
```

Create the repo and push in one step (from the **repository root** — the folder that contains `domain-journal/` and this `docs/` folder):

```bash
cd /Users/ajoyce/git-repos/Webhistory_memmory_aid
git add .
git commit -m "Describe your changes"
gh repo create YOUR_REPO_NAME --public --source=. --remote=origin --push
```

Use a new `YOUR_REPO_NAME` that does not already exist on your account. If the folder is already a git repo with commits, skip `git init` and only `commit` / `gh repo create`.

## 4. What gets published

- Source code under `domain-journal/` (TypeScript, React, tests).
- `node_modules/` and `domain-journal/dist/` are **ignored** — clones must run `npm install` and `npm run build` locally (see the main README).

## 5. Repository description and topics

On GitHub: **Settings** (repo) or the gear on the main page to set:

- **Description**: e.g. *Local-first Chrome extension: journal allowlisted domains, manual LLM summaries.*
- **Topics**: `chrome-extension`, `manifest-v3`, `brave`, `typescript`, `react`, `productivity`

## Security reminder

Never commit API keys, `.env` files with secrets, or personal export JSON that contains private URLs. This repo’s `.gitignore` excludes `.env` and build artifacts.
