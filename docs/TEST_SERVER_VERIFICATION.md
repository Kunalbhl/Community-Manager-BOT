# Discord Test Server Verification Checklist

Use this checklist to verify and validate your real Discord bot connection and feature capabilities on a staging or test Discord guild.

---

## Pre-Flight Verification

- [ ] **1. Bot Invocation & Permissions**
  - Bot is invited to test server with `bot` and `applications.commands` scopes.
  - Bot role has `Manage Roles`, `Send Messages`, `Embed Links`, and `Read Message History`.
  - Bot role is placed above member and recruiter reward roles in Server Settings -> Roles.

- [ ] **2. Gateway Connection & Truthful Health**
  - Check `GET /api/v1/health` endpoint:
    - Discord Gateway status shows `CONNECTED` when bot token is active, or `NOT_CONFIGURED` if token is absent (never fake "Connected").
    - Gateway ping and connected guilds count accurately reflect the test server.

- [ ] **3. Channel Allowlist Setup**
  - Navigate to **Community Admin -> Recruitment Trust -> Allowed Channels**.
  - Add `#recruitment-intake` as an authorized channel with purpose `APPLICATION`.
  - Add `#support` with purpose `SUPPORT`.
  - Verify messages in unlisted channels (e.g. `#general`) are ignored.

---

## Interactive Feature Verification

- [ ] **4. Slash Commands Execution**
  - Type `/recruiter-code action:Generate New Code` -> confirms code generation (e.g. `KRP-001`) locked to your permanent Discord User ID.
  - Type `/recruiter` -> returns your recruiter stats (0 recruits, active codes).
  - Type `/rules` -> outputs community recruitment standards.
  - Type `/support` -> outputs authorized support channel info.

- [ ] **5. Recruiter Benefits & Milestone Progression**
  - Configure a benefit tier in **Community Admin -> Recruiter Benefits** (e.g. "Gold Recruiter" at 1 confirmed recruit granting a test role).
  - Type `/recruiter-benefits` in Discord -> verify your progress and unlocked milestones are displayed.

- [ ] **6. Referral Lifecycle & Real Member Join**
  - Submit an application with a recruiter code.
  - Admin approves application.
  - Test account joins the server -> `GUILD_MEMBER_ADD` Gateway event fires.
  - Referral lifecycle transitions to `JOINED` -> `RECRUITMENT_SUCCESSFUL`.
  - Recruiter's successful recruits count automatically increments to 1.
  - Milestone role is automatically evaluated and assigned to the recruiter.

- [ ] **7. Applicant Restrictions & Blacklist Defense**
  - Add a caution or blacklist restriction for a test ID in **Recruitment Trust -> Restrictions**.
  - Type `/blacklist check target:<test_user_id>` -> alerts with matched restriction.
  - When flagged user joins or applies, risk alert is raised.

- [ ] **8. Google Sheets Synchronization**
  - Link a Google Spreadsheet in **Integrations -> Google Sheets**.
  - Trigger manual sync -> verify 13 bot template sheets or custom columns update accurately.
