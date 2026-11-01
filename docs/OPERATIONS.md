# Community Manager — how it runs (₹0)

```
Discord ◀── bot (Oracle VM, 24/7, active) ──┐
                │ HTTPS (Caddy, sslip.io)   ├──▶ Supabase Postgres (schema community_manager)
Website users ─▶ Cloud Run (standby) ────────┘
```

| Piece | Where | Updates |
|---|---|---|
| Discord bot + API (active) | Oracle Always Free VM `community-manager-bot` (137.23.46.177), containers `community-manager-bot` + `community-manager-caddy` | VM pulls `main` every 5 min (`cm-update.timer`) |
| Website + standby bot | Cloud Run `community-manager-bot`, asia-southeast1, https://community-manager-bot-720940628402.asia-southeast1.run.app | GitHub Actions **Deploy website** on every push to `main` |
| Database | Supabase project `Community-Manager-BOT` (session pooler) | tables created automatically |

* Only one bot is ever online: a database lease (VM priority 100, Cloud Run 10). If the VM is down for ~1 minute Cloud Run takes over.
* While Cloud Run is standby it forwards `/api` calls to the VM (`LEADER_API_URL`), because only the active bot has the live Discord connection.
* SocialCord Notifier is a separate bot and project. Community Manager only stores the on/off switch and links to it.

## Making changes
1. Branch → PR → CI (build, boot, real-Postgres tests) → merge to `main`.
2. Everything deploys itself. AI Studio is optional: import the latest `main` zip first, then push.

## Useful commands (Oracle Cloud Shell)
```
ssh -i ~/.ssh/cm_vm ubuntu@137.23.46.177
sudo docker logs -f community-manager-bot
sudo cm-update --force                                   # redeploy now
sudo nano /opt/community-manager/bot.env && sudo cm-update --force   # change settings
```
Health: `/health/live`, `/health/leader` on either URL.
