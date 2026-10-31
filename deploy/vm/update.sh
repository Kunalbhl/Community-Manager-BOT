#!/usr/bin/env bash
# Pulls the latest code from GitHub and rebuilds/restarts the bot when a new commit is available.
# Installed by setup.sh as a systemd timer (every 5 minutes).
#
# The commit that is actually running is stored in $STATE only after a successful build + start,
# so a failed build is retried on the next run instead of being skipped forever.
set -euo pipefail
# Same environment whether started by systemd, cron or by hand.
if [ -f /etc/cm-update.env ]; then set -a; . /etc/cm-update.env; set +a; fi
APP_DIR=/opt/community-manager/app
STATE=/opt/community-manager/deployed_sha
LOG=/var/log/cm-update.log
BRANCH="${CM_BRANCH:-main}"
COMPOSE="docker compose -p community-manager -f deploy/vm/docker-compose.yml"
cd "$APP_DIR"
exec >>"$LOG" 2>&1

if ! git fetch --quiet origin "$BRANCH"; then
  echo "[update] $(date -u +%FT%TZ) git fetch FAILED (deploy key / network)"
  exit 1
fi
REMOTE=$(git rev-parse "origin/$BRANCH")
DEPLOYED=$(cat "$STATE" 2>/dev/null || echo none)

if [ "$REMOTE" != "$DEPLOYED" ] || [ "${1:-}" = "--force" ]; then
  echo "[update] $(date -u +%FT%TZ) deploying ${REMOTE:0:7} (running ${DEPLOYED:0:7})"
  git reset --hard --quiet "origin/$BRANCH"
  # Keep this script itself up to date.
  install -m 755 deploy/vm/update.sh /usr/local/bin/cm-update || true
  export GIT_SHA="${REMOTE:0:7}"
  # Build at the lowest CPU/IO priority so the running bot stays responsive, then swap containers.
  if ! nice -n 19 ionice -c3 $COMPOSE build; then
    echo "[update] $(date -u +%FT%TZ) BUILD FAILED for ${REMOTE:0:7}; will retry next run"
    exit 1
  fi
  $COMPOSE up -d --remove-orphans
  echo "$REMOTE" > "$STATE"
  docker image prune -f >/dev/null 2>&1 || true
  echo "[update] $(date -u +%FT%TZ) running ${REMOTE:0:7}"
elif ! docker ps --format '{{.Names}}' | grep -q '^community-manager-bot$'; then
  # Make sure the bot is running even if nothing changed.
  export GIT_SHA="${DEPLOYED:0:7}"
  $COMPOSE up -d
fi
