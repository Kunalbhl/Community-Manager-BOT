#!/usr/bin/env bash
# One-time setup of the Community Manager bot engine on a fresh Ubuntu / Oracle Linux VM.
#   sudo bash setup.sh
# Safe to re-run. Never prints secret values.
set -euo pipefail
REPO_SSH="git@github.com:Kunalbhl/Community-Manager-BOT.git"
BASE=/opt/community-manager
APP_DIR=$BASE/app
KEY=$BASE/deploy_key
ENV_FILE=$BASE/bot.env

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash setup.sh"; exit 1; }
mkdir -p "$BASE"; chmod 700 "$BASE"

echo "==> 1/6 Installing Docker and git"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null 2>&1 || { (apt-get update -y && apt-get install -y git) || dnf install -y git; }
systemctl enable --now docker

echo "==> 2/6 Adding 2 GB swap (lets small VMs build the image)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> 3/6 GitHub read-only deploy key"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "community-manager-vm-deploy" -f "$KEY" >/dev/null
fi
export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
until git ls-remote "$REPO_SSH" >/dev/null 2>&1; do
  echo
  echo "Add this READ-ONLY deploy key to GitHub (repo Settings > Deploy keys > Add deploy key, leave 'Allow write access' OFF):"
  echo
  cat "$KEY.pub"
  echo
  read -r -p "Press Enter after adding it..." _
done

echo "==> 4/6 Downloading the code"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --quiet "$REPO_SSH" "$APP_DIR"
fi
git -C "$APP_DIR" config core.sshCommand "ssh -i $KEY -o IdentitiesOnly=yes"

echo "==> 5/6 Bot settings (secrets are typed here, stored only on this VM: $ENV_FILE)"
if [ ! -s "$ENV_FILE" ]; then
  echo "Paste the settings block (KEY=value lines), then press Ctrl+D on an empty line:"
  cat > "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
for required in DATABASE_URL DISCORD_BOT_TOKEN DISCORD_CLIENT_ID; do
  grep -q "^${required}=." "$ENV_FILE" || { echo "Missing $required in $ENV_FILE — edit it and re-run."; exit 1; }
done

echo "==> 6/6 Starting the bot and enabling automatic updates"
install -m 755 "$APP_DIR/deploy/vm/update.sh" /usr/local/bin/cm-update
# Everything the updater needs, in one place (systemd and manual runs read the same file).
cat > /etc/cm-update.env <<ENVF
GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
ENVF
touch /var/log/cm-update.log && chmod 644 /var/log/cm-update.log
cat > /etc/systemd/system/cm-update.service <<UNIT
[Unit]
Description=Community Manager auto-update from GitHub
After=network-online.target docker.service
Wants=network-online.target
[Service]
Type=oneshot
EnvironmentFile=/etc/cm-update.env
ExecStart=/usr/bin/flock -n /run/cm-update.lock /usr/local/bin/cm-update
TimeoutStartSec=1800
UNIT
cat > /etc/systemd/system/cm-update.timer <<UNIT
[Unit]
Description=Check GitHub for Community Manager updates every 5 minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now cm-update.timer
# Belt and braces: a cron entry runs the same updater if the timer ever stops.
echo "*/10 * * * * root . /etc/cm-update.env; export GIT_SSH_COMMAND; flock -n /run/cm-update.lock /usr/local/bin/cm-update" > /etc/cron.d/cm-update
set -a; . /etc/cm-update.env; set +a
/usr/local/bin/cm-update --force

echo
echo "Done. Useful commands:"
echo "  docker logs -f community-manager-bot          # live bot logs"
echo "  sudo cm-update --force         # redeploy now"
echo "  sudo nano $ENV_FILE && sudo cm-update --force   # change settings"
