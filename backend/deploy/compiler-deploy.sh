#!/bin/sh
# Installs a backend release on the server. CI runs it over SSH as the forced
# command of the deploy key (see ~/.ssh/authorized_keys), sending the release
# zip on stdin and the tag (e.g. v2.0.0) as the command:
#
#   ssh deploy-host v2.0.0 < backend-dist.zip
#
# The zip holds dist/server.js, a single bundled file, so there is nothing to
# install. Each release goes in ~/the-compiler-releases/<tag>;
# ~/the-compiler-app points at the live one. If the restarted service does not
# answer /healthz, the previous release is put back.
set -eu

TAG="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if ! printf '%s' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "usage: compiler-deploy vX.Y.Z < backend-dist.zip" >&2
  exit 2
fi

RELEASES="$HOME/the-compiler-releases"
CURRENT="$HOME/the-compiler-app"
PORT="${PORT:-8788}"

mkdir -p "$RELEASES"
INCOMING=$(mktemp -d "$RELEASES/.incoming.XXXXXX")
trap 'rm -rf "$INCOMING"' EXIT

cat > "$INCOMING/release.zip"
python3 -m zipfile -e "$INCOMING/release.zip" "$INCOMING/app"
[ -f "$INCOMING/app/dist/server.js" ] || { echo "release is missing dist/server.js" >&2; exit 1; }

PREVIOUS=$(readlink -f "$CURRENT" 2>/dev/null || true)
rm -rf "$RELEASES/$TAG"
mv "$INCOMING/app" "$RELEASES/$TAG"

switch_to() {
  ln -sfn "$1" "$CURRENT.next"
  mv -T "$CURRENT.next" "$CURRENT"
  sudo -n /usr/bin/systemctl restart compiler
}

healthy() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    curl -fsS "http://127.0.0.1:$PORT/healthz" > /dev/null 2>&1 && return 0
  done
  return 1
}

switch_to "$RELEASES/$TAG"
if healthy; then
  echo "Deployed $TAG"
else
  echo "$TAG did not pass the health check" >&2
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASES/$TAG" ]; then
    switch_to "$PREVIOUS"
    echo "Rolled back to $PREVIOUS" >&2
  fi
  exit 1
fi

# Keep the three newest releases.
ls -1dt "$RELEASES"/v* 2>/dev/null | tail -n +4 | xargs -r rm -rf
