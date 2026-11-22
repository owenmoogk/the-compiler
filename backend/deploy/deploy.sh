#!/bin/sh
# Deploys a release on the server. CI runs it over SSH as the forced command of
# the deploy key (see ~/.ssh/authorized_keys), sending backend/deploy/compose.yaml on
# stdin and the tag (e.g. v1.2.3) as the command:
#
#   ssh deploy-host v1.2.3 < backend/deploy/compose.yaml
#
# It lives in the app's folder on the server (~/the-compiler/deploy.sh), next to
# compose.yaml, .env (TAG=, APP_UID=, APP_GID=), secrets.env and data/. It installs the new
# compose file, sets TAG, pulls the image from ghcr.io and restarts the container.
# If /healthz does not answer, the previous compose file and tag are put back.
set -eu

PORT=8788
IMAGE=ghcr.io/owenmoogk/the-compiler

TAG="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if ! printf '%s' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "usage: deploy.sh vX.Y.Z < compose.yaml" >&2
  exit 2
fi

cd "$(dirname "$(readlink -f "$0")")"
[ -f .env ] || { echo "missing $(pwd)/.env" >&2; exit 1; }

NEW=$(mktemp compose.yaml.XXXXXX)
trap 'rm -f "$NEW"' EXIT
cat > "$NEW"
grep -q "image: $IMAGE:" "$NEW" || { echo "compose file does not use $IMAGE" >&2; exit 1; }
TAG="$TAG" docker compose --env-file .env -f "$NEW" config -q

PREV_TAG=$(sed -n 's/^TAG=//p' .env)
[ -f compose.yaml ] && cp compose.yaml compose.yaml.prev

set_tag() {
  if grep -q '^TAG=' .env; then
    sed -i "s/^TAG=.*/TAG=$1/" .env
  else
    printf 'TAG=%s\n' "$1" >> .env
  fi
}

healthy() {
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    sleep 2
    curl -fsS "http://127.0.0.1:$PORT/healthz" > /dev/null 2>&1 && return 0
  done
  return 1
}

echo "Pulling $IMAGE:$TAG"
docker pull -q "$IMAGE:$TAG"
mv "$NEW" compose.yaml
set_tag "$TAG"
docker compose up -d --remove-orphans

if healthy; then
  echo "Deployed $TAG"
else
  echo "$TAG did not pass the health check" >&2
  docker compose logs --tail 40 >&2 || true
  if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ]; then
    [ -f compose.yaml.prev ] && mv compose.yaml.prev compose.yaml
    set_tag "$PREV_TAG"
    docker compose up -d --remove-orphans
    echo "Rolled back to $PREV_TAG" >&2
  fi
  exit 1
fi

# Keep the three newest images of this app.
docker image ls "$IMAGE" --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' |
  sort -r | tail -n +4 | cut -f2 | xargs -r docker image rm > /dev/null 2>&1 || true
