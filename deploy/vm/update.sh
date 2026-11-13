#!/usr/bin/env bash
# Pulls the latest code from GitHub and updates the bot WITHOUT taking it down.
# Installed by setup.sh as a systemd timer (every 5 minutes).
#
# Safety rules:
#  1. Website-only changes (src/, public/, docs...) never restart the bot. The website is on Cloud Run.
#  2. A new version is built while the current bot keeps running.
#  3. Blue/green handoff: the new container starts next to the old one, must pass its health check,
#     and only then does the old one hand over (it releases the leadership lease on shutdown and the
#     new one takes over within ~2 s). The HTTPS front door waits for the new bot instead of failing.
#  4. If the new version fails to start or to take over, the old one is started again (automatic
#     rollback) and that commit is not retried until a newer commit arrives.
set -euo pipefail
if [ -f /etc/cm-update.env ]; then set -a; . /etc/cm-update.env; set +a; fi
APP_DIR=/opt/community-manager/app
STATE=/opt/community-manager/deployed_sha
FAILED=/opt/community-manager/failed_sha
ENV_FILE=/opt/community-manager/bot.env
LOG=/var/log/cm-update.log
BRANCH="${CM_BRANCH:-main}"
COMPOSE="docker compose -p community-manager -f deploy/vm/docker-compose.yml"
NET=community-manager_default
IMAGE=community-manager-bot
cd "$APP_DIR"
exec >>"$LOG" 2>&1
log() { echo "[update] $(date -u +%FT%TZ) $*"; }

active_bot() { docker ps --format '{{.Names}}' | grep -E '^(cm-bot-blue|cm-bot-green|community-manager-bot)$' | head -1 || true; }

# Probe a container's own health endpoint from inside it (no ports needed).
probe() { docker exec "$1" wget -qO- "http://127.0.0.1:3000$2" >/dev/null 2>&1; }
wait_for() { # container path seconds
  local i=0
  while [ $i -lt "$3" ]; do probe "$1" "$2" && return 0; sleep 2; i=$((i + 2)); done
  return 1
}

create_bot() { # name image-tag
  docker rm -f "$1" >/dev/null 2>&1 || true
  docker create --name "$1" --network "$NET" --network-alias "$1" \
    --env-file "$ENV_FILE" \
    -e NODE_ENV=production -e APP_RUNTIME_MODE=PRODUCTION -e BOT_INSTANCE_ROLE=vm \
    -e BOT_LEADER_PRIORITY=100 -e BOT_ENABLED=true -e BOT_HOT_STANDBY=true -e BOT_STANDBY_POLL_MS=2000 \
    -e DB_POOL_MAX=4 -e PORT=3000 -e GIT_SHA="$3" \
    --memory 450m --restart unless-stopped \
    --log-driver json-file --log-opt max-size=10m --log-opt max-file=5 \
    "$IMAGE:$2" >/dev/null
}

if ! git fetch --quiet origin "$BRANCH"; then log "git fetch FAILED (deploy key / network)"; exit 1; fi
REMOTE=$(git rev-parse "origin/$BRANCH")
DEPLOYED=$(cat "$STATE" 2>/dev/null || echo none)
ACTIVE=$(active_bot)

if [ "$REMOTE" = "$DEPLOYED" ] && [ "${1:-}" != "--force" ]; then
  # Nothing new. Make sure a bot is running.
  if [ -z "$ACTIVE" ]; then
    for c in cm-bot-blue cm-bot-green community-manager-bot; do
      if docker container inspect "$c" >/dev/null 2>&1; then log "no bot running; starting $c"; docker start "$c" >/dev/null && exit 0; fi
    done
    log "no bot container found; creating one"
    create_bot cm-bot-blue latest "${DEPLOYED:0:7}" && docker start cm-bot-blue >/dev/null
  fi
  exit 0
fi
if [ "$REMOTE" = "$(cat "$FAILED" 2>/dev/null || true)" ] && [ "${1:-}" != "--force" ]; then exit 0; fi

git reset --hard --quiet "origin/$BRANCH"
install -m 755 deploy/vm/update.sh /usr/local/bin/cm-update || true
SHORT=${REMOTE:0:7}
export GIT_SHA="$SHORT"

# 1. Website-only change? Record it and leave the bot alone.
if [ "$DEPLOYED" != none ] && [ -n "$ACTIVE" ] && [ "${1:-}" != "--force" ] && git cat-file -e "$DEPLOYED" 2>/dev/null; then
  BOT_FILES=$(git diff --name-only "$DEPLOYED" "$REMOTE" | grep -Ev '^(src/|public/|docs/|\.github/|index\.html$|vite\.config\.ts$|.*\.md$|tsconfig\.app\.json$)' || true)
  if [ -z "$BOT_FILES" ]; then
    echo "$REMOTE" > "$STATE"
    log "$SHORT is website-only; bot keeps running (${ACTIVE})"
    exit 0
  fi
fi

log "deploying $SHORT (running ${DEPLOYED:0:7} in ${ACTIVE:-nothing})"

# 2. Build while the current bot keeps serving.
if ! nice -n 19 ionice -c3 $COMPOSE build bot; then log "BUILD FAILED for $SHORT; bot unchanged"; echo "$REMOTE" > "$FAILED"; exit 1; fi
docker tag "$IMAGE:latest" "$IMAGE:$SHORT"
# Front door (only recreated when its config changed; the bot is not touched).
$COMPOSE up -d --no-deps caddy

# 3. Blue/green handoff.
if [ "$ACTIVE" = cm-bot-blue ]; then NEXT=cm-bot-green; else NEXT=cm-bot-blue; fi
create_bot "$NEXT" "$SHORT" "$SHORT"
MEM_FREE=$(awk '/MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)

rollback() {
  log "ROLLBACK: $1. Keeping ${ACTIVE:-previous bot}."
  docker rm -f "$NEXT" >/dev/null 2>&1 || true
  [ -n "$ACTIVE" ] && docker start "$ACTIVE" >/dev/null 2>&1 || true
  echo "$REMOTE" > "$FAILED"
  exit 1
}

if [ -n "$ACTIVE" ] && [ "$MEM_FREE" -ge 380 ]; then
  # Overlap: new one boots fully as a standby, then the old one hands over.
  docker start "$NEXT" >/dev/null
  wait_for "$NEXT" /health/live 120 || rollback "new version did not start"
  # Hot standby: let the new one finish logging in to Discord first, so the switch takes ~2 s.
  wait_for "$NEXT" /health/gateway 60 || log "new version not logged in to Discord yet; switching anyway"
  docker stop -t 25 "$ACTIVE" >/dev/null
  wait_for "$NEXT" /health/active 60 || rollback "new version did not take over"
else
  # Not enough memory for two at once: stop, start, and roll back on failure.
  log "low memory (${MEM_FREE} MB free): quick restart instead of overlap"
  [ -n "$ACTIVE" ] && docker stop -t 25 "$ACTIVE" >/dev/null
  docker start "$NEXT" >/dev/null
  wait_for "$NEXT" /health/active 120 || rollback "new version did not come online"
fi

[ -n "$ACTIVE" ] && docker rm "$ACTIVE" >/dev/null 2>&1 || true
echo "$REMOTE" > "$STATE"
rm -f "$FAILED"
# Keep the last few versions for manual rollback, prune the rest.
docker images "$IMAGE" --format '{{.Tag}}' | grep -Ev '^(latest|'"$SHORT"')$' | tail -n +4 | xargs -r -I{} docker rmi "$IMAGE:{}" >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
log "running $SHORT in $NEXT"
