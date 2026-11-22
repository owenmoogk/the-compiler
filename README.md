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

- **Data** lives on the server (`~/the-compiler/data/bookmarks.json`) and is pushed
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
4. builds the backend Docker image (`Dockerfile`) and pushes it to
   `ghcr.io/owenmoogk/the-compiler:vX.Y.Z` (and `:latest`);
5. SSHes to the server through the Cloudflare Tunnel and pipes a bundle of
   `backend/deploy/compose.yaml` and a `secrets.env` built from this repo's secrets into
   `~/the-compiler/deploy.sh` (`backend/deploy/deploy.sh`). That script installs both, sets
   the image tag, pulls the image, restarts the container, checks `/healthz`, and rolls back
   to the previous compose file, secrets and tag if the check fails.

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
The backend runs in Docker from `~/the-compiler`:
```
~/the-compiler/
  compose.yaml   installed by each deploy (from backend/deploy/compose.yaml)
  .env           TAG=vX.Y.Z, APP_UID=, APP_GID= (the user that owns data/)
  secrets.env    installed by each deploy from GitHub secrets (chmod 600)
  deploy.sh      copy of backend/deploy/deploy.sh (the deploy key's forced command)
  data/          state the server writes: bookmarks.json, sync-state.json, sessions.enc
```
Settings that aren't secret (URLs, bookmarks repo, GitHub App client ID) are in
`backend/deploy/compose.yaml`. `data/` is backed up nightly to the NAS (see the homelab repo).
```sh
mkdir -p ~/the-compiler/data && cd ~/the-compiler
cp <repo>/backend/deploy/deploy.sh . && chmod +x deploy.sh
printf 'TAG=\nAPP_UID=%s\nAPP_GID=%s\n' "$(id -u)" "$(id -g)" > .env
```
The deploy user must be in the `docker` group. The container shares the host network and
listens on `127.0.0.1:8788`. Logs: `docker compose logs -f` in `~/the-compiler`.

Add a **new** deploy key to `~/.ssh/authorized_keys`. A forced command is set per key,
so it can't share learn-mcp's key:
```
command="/home/USER/the-compiler/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... the-compiler-deploy
```

### 4. Cloudflare
In the existing tunnel, add a public hostname `compiler.owenmoogk.com` → `http://localhost:8788`.
SSH for deploys reuses the existing SSH hostname and Access service token.

### 5. This repo's settings
- **Pages:** Source = *GitHub Actions*. After the first deploy, delete the old `gh-pages` branch.
- **Secrets:** `DEPLOY_SSH_KEY` (the new key's private half), `DEPLOY_KNOWN_HOSTS`,
  `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, and the backend's own `SESSION_KEY` and
  `APP_CLIENT_SECRET` (GitHub App client secret; secret names can't start with `GITHUB_`).
  GitHub never shows a secret again, so keep your own copy (e.g. a password manager).
- **Variables:** `DEPLOY_HOST`, `DEPLOY_USER`

Then run `yarn ver:major` to release v2.0.0.
