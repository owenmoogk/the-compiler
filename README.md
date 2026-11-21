# The Compiler

Useful links and resources, live at **https://owenmoogk.com/the-compiler/**.

Anyone can browse, search and filter by tag. Signing in with GitHub (with push access to
[owenmoogk/bookmarks](https://github.com/owenmoogk/bookmarks)) turns on editing: add links,
edit, delete and rename tags. Each link's title and favicon are fetched when it's added.

MASSIVE thanks to [janik](https://github.com/JanikThePanic), who inspired the original version.

## How it works

```
browser ──▶ compiler.owenmoogk.com (Cloudflare Tunnel → basement server)
   │          ├ bookmarks.json on the server: the source of truth, saves are instant
   │          ├ GitHub App sign-in, sessions (tokens never reach the browser)
   │          ├ daily push of bookmarks.json to owenmoogk/bookmarks, as you
   │          └ metadata scraper (oEmbed + HTML; blocks LAN/loopback addresses)
   │
   └─ if the server is down ─▶ raw.githubusercontent.com/owenmoogk/bookmarks/main/bookmarks.json
```

- **Data** lives on the server (`~/.local/share/the-compiler/bookmarks.json`) and is pushed
  to the public repo `owenmoogk/bookmarks` once a day at `SYNC_HOUR` (default 3am), as one
  commit listing that day's changes. On first start the server copies the file from GitHub.
  The server's copy wins: edits made directly on GitHub are overwritten by the next push.
- **Pushing** uses the token of the most recent signed-in editor, refreshed automatically.
  If nobody with edit access has signed in for ~6 months, the push is skipped (and retried
  hourly) until someone signs in. Editors can also push immediately with `POST /api/sync`.
- **Auth** is a GitHub App installed only on that repo. Only users with push access to the
  repo can edit; the server checks this on every change. The server holds no PAT.
- If the server is down, the site still works read-only from GitHub's copy (up to a day old).

## Layout

Yarn workspaces:

| Folder | What |
|---|---|
| `shared/` | `@compiler/shared`: zod schema for `bookmarks.json`, tag helpers, filter/sort logic |
| `backend/` | Express 5 API, bundled by tsup into one file, `backend/dist/server.js` |
| `frontend/` | Vite + React 19 + Mantine 8 (from frontend-template), served by GitHub Pages |

## Development

```sh
yarn install
cp backend/.env.example backend/.env    # then fill in SESSION_KEY (command is in the file)
yarn dev                                 # backend :8788 + frontend http://localhost:3000/the-compiler/
```

The example `.env` runs without a GitHub App: on first start, `backend/.data/bookmarks.json`
is copied from the public bookmarks repo, edits are saved to it and never pushed back,
and "Sign in" logs you in as a fake editor (`DEV_LOGIN`). Delete that file to start over
from the current GitHub copy.

```sh
yarn lint        # eslint + prettier, all workspaces
yarn typecheck
yarn build
```

## Releasing

```sh
yarn ver:patch   # or ver:minor / ver:major
```

This bumps the root version and pushes a `vX.Y.Z` tag. CI then:

1. lints, typechecks and builds;
2. creates a GitHub Release with `backend-dist` and `frontend-dist` zips;
3. deploys `frontend/dist` to GitHub Pages;
4. SSHes to the server through the Cloudflare Tunnel and pipes the backend zip into
   `backend/deploy/compiler-deploy.sh`. That script swaps the release in, restarts the
   service, checks `/healthz`, and rolls back if the check fails.

## One-time setup

### 1. Bookmarks repo
Create the public repo `owenmoogk/bookmarks` and push `bookmarks.json` (generated with
`yarn migrate ... --git-dir . --scrape`).

### 2. GitHub App
GitHub → Settings → Developer settings → GitHub Apps → New:
- **Callback URL:** `https://compiler.owenmoogk.com/auth/callback`
- **Expire user authorization tokens:** on
- **Webhook:** off
- **Repository permissions:** Contents: *Read and write* (Metadata: read is automatic). Nothing else.
- **Where can it be installed:** only this account

Then generate a client secret, and **install the app on `owenmoogk/bookmarks` only**.

### 3. Server (same box and pattern as learn-mcp)
```sh
mkdir -p ~/.config/the-compiler
cp backend/deploy/env.example ~/.config/the-compiler/env   # fill in, then chmod 600
sudo cp backend/deploy/compiler.service /etc/systemd/system/   # replace USER, HOME, NODE
sudo install -m 0440 backend/deploy/compiler-sudoers /etc/sudoers.d/compiler   # replace USER
cp backend/deploy/compiler-deploy.sh ~/bin/ && chmod +x ~/bin/compiler-deploy.sh
sudo systemctl daemon-reload && sudo systemctl enable compiler
```
Add a **new** deploy key to `~/.ssh/authorized_keys`. A forced command is set per key,
so it can't share learn-mcp's key:
```
command="/home/USER/bin/compiler-deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... the-compiler-deploy
```

### 4. Cloudflare
In the existing tunnel, add a public hostname `compiler.owenmoogk.com` → `http://localhost:8788`.
SSH for deploys reuses the existing SSH hostname and Access service token.

### 5. This repo's settings
- **Pages:** Source = *GitHub Actions*. After the first deploy, delete the old `gh-pages` branch.
- **Secrets:** `DEPLOY_SSH_KEY` (the new key's private half), `DEPLOY_KNOWN_HOSTS`,
  `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`
- **Variables:** `DEPLOY_HOST`, `DEPLOY_USER`

Then run `yarn ver:major` to release v2.0.0.
