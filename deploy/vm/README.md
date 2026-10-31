# Community Manager — 24/7 bot on the Oracle Always Free VM (₹0)

```
Discord users ─▶ Discord ◀── bot engine (Oracle VM, 24/7, priority 100) ─┐
                                                                          ├─▶ Supabase Postgres
Website users ─▶ Cloud Run (AI Studio publish, standby, priority 10) ─────┘   schema "community_manager"
```

* Runs as its own container (`community-manager-bot`, compose project `community-manager`)
  next to SocialCord on the same VM. It never touches SocialCord's container.
* A database **leadership lease** makes sure only ONE copy of the bot is online. The VM always
  wins; Cloud Run takes over only if the VM has been down for about a minute.
* Every 5 minutes the VM checks GitHub `main` and redeploys itself when it changes.
* Tables are created automatically on first start (`community_manager.documents`,
  `community_manager.runtime_leases`).

## One-time setup

1. Supabase → your project → **Connect** → *Session pooler* → copy the URI (port 5432).
2. Fill `deploy/vm/bot.env.example` values with your real secrets + that `DATABASE_URL`.
3. On the VM:
   ```
   curl -fsSLo cm-setup.sh https://raw.githubusercontent.com/Kunalbhl/Community-Manager-BOT/main/deploy/vm/setup.sh
   sudo bash cm-setup.sh
   ```
   Add the printed key on GitHub as a **read-only** deploy key, then paste the settings block.
4. Check: `docker logs -f community-manager-bot` shows `is now the ACTIVE bot (leader)`.
   `curl -s localhost:3101/health/leader` shows the leader status.

## Cloud Run (website)

Add a `DATABASE_URL` secret (same value), plus `BOT_INSTANCE_ROLE=web`, `BOT_LEADER_PRIORITY=10`,
and keep **max instances = 1**. To make Cloud Run a website only, set `BOT_ENABLED=false`.

## Useful commands

```
docker logs -f community-manager-bot      # live logs
sudo cm-update --force                    # redeploy now
sudo nano /opt/community-manager/bot.env && sudo cm-update --force   # change settings
```
