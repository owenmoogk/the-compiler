# The Compiler

Useful links and resources, live at **https://owenmoogk.com/the-compiler/**.

Anyone can browse, search and filter by tag. Signing in with GitHub as `owenmoogk` turns on
editing: add links, edit, delete and rename tags. Each link's title and favicon are fetched when it's added.

MASSIVE thanks to [janik](https://github.com/JanikThePanic), who inspired the original version.

## How it works

```
browser ──▶ compiler.owenmoogk.com (Cloudflare Tunnel → basement server)
              ├ bookmarks.json on the server: the only copy, saves are instant
              ├ GitHub App sign-in, sessions (tokens never reach the browser)
              └ metadata scraper (HTML; blocks LAN/loopback addresses)

server's data/ ──▶ NAS, nightly tar.gz (homelab repo's backup script, 30 days kept)
```

- **Data** lives only on the server, in `~/the-compiler/data/bookmarks.json`. The whole
  `data/` folder is backed up to the NAS every night (see the homelab repo). If the server
  is down, the site shows "Unable to retrieve content".
- **Auth** is a GitHub App used for sign-in only. Only the GitHub account with id
  `EDITOR_GITHUB_ID` (owenmoogk, set in `backend/deploy/compose.yaml`) can edit; the server
  checks this on every change.

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

The example `.env` runs without a GitHub App: "Sign in" logs you in as a fake editor
(`DEV_LOGIN`) and edits are saved to `backend/.data/bookmarks.json`, which starts empty.
To work on a copy of the live list:

```sh
curl -o backend/.data/bookmarks.json https://compiler.owenmoogk.com/api/bookmarks
```

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

### 1. GitHub App
GitHub → Settings → Developer settings → GitHub Apps → New:
- **Callback URL:** `https://compiler.owenmoogk.com/auth/callback`
- **Expire user authorization tokens:** on
- **Webhook:** off
- **Permissions:** none. It is only used to sign in.
- **Where can it be installed:** only this account

Then generate a client secret. The app doesn't need to be installed on any repo.

### 2. Server (same box and pattern as learn-mcp)
The backend runs in Docker from `~/the-compiler`:
```
~/the-compiler/
  compose.yaml   installed by each deploy (from backend/deploy/compose.yaml)
  .env           TAG=vX.Y.Z, APP_UID=, APP_GID= (the user that owns data/)
  secrets.env    installed by each deploy from GitHub secrets (chmod 600)
  deploy.sh      copy of backend/deploy/deploy.sh (the deploy key's forced command)
  data/          state the server writes: bookmarks.json (the only copy), sessions.enc
```
Settings that aren't secret (URLs, editor id, GitHub App client ID) are in
`backend/deploy/compose.yaml`. `data/` is backed up nightly to the NAS (see the homelab repo).
To restore, stop the container (`docker compose down`), untar the newest
`/mnt/nas/minecraft/server-state/the-compiler/the-compiler_*.tar.gz` into `data/`
(`tar -xzf <archive> -C ~/the-compiler/data`), and start it again (`docker compose up -d`).
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

### 3. Cloudflare
In the existing tunnel, add a public hostname `compiler.owenmoogk.com` → `http://localhost:8788`.
SSH for deploys reuses the existing SSH hostname and Access service token.

### 4. This repo's settings
- **Pages:** Source = *GitHub Actions*. After the first deploy, delete the old `gh-pages` branch.
- **Secrets:** `DEPLOY_SSH_KEY` (the new key's private half), `DEPLOY_KNOWN_HOSTS`,
  `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, and the backend's own `SESSION_KEY` and
  `APP_CLIENT_SECRET` (GitHub App client secret; secret names can't start with `GITHUB_`).
  GitHub never shows a secret again, so keep your own copy (e.g. a password manager).
- **Variables:** `DEPLOY_HOST`, `DEPLOY_USER`

