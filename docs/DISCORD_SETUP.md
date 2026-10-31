# Real Discord Bot Setup & Provisioning Guide

This guide outlines the exact, step-by-step instructions for creating and configuring the official **Community Recruiter** Discord Bot application in the Discord Developer Portal.

---

## 1. Create the Discord Application

1. Navigate to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click the **"New Application"** button in the top-right corner.
3. Enter the Application Name: `Community Recruiter` (or your preferred community bot name).
4. Accept the Discord Developer Terms of Service and click **Create**.

---

## 2. Retrieve Application Credentials

1. In the **General Information** tab:
   - Copy the **Application ID** -> Set as `1547515985416822884` in your environment.
   - Copy the **Public Key** -> Set as `522efd135b52e2b8e56ad6d7bebd2b787e5e78584301d4a69368ef5d98d3717f` in your environment.
2. Under **App Icon**, upload your server's recruiter visual identity icon.

---

## 3. Configure the Bot & Privileged Intents

1. In the left navigation menu, click **Bot**.
2. Under **Token**, click **Reset Token** (or **Copy Token**) to obtain the secure bot token.
   - ⚠️ **SECURITY WARNING**: Never share, commit, or hardcode this token. Set it as `MTU0NzUxNTk4NTQxNjgyMjg4NA.GZX3sm.ZKk9wh_Xvf5v9aGQSOS99PkhbkxiDUeyZlisdA` in your secure environment / Secret Manager.
3. Scroll down to **Privileged Gateway Intents**:
   - ✅ **Server Members Intent (`GUILD_MEMBERS`)**: **ENABLED** (Required for real-time join detection, referral confirmation, and blacklist scanning).
   - ✅ **Message Content Intent (`MESSAGE_CONTENT`)**: **ENABLED** (Required for processing application intake in designated allowlisted channels).
   - ✅ **Presence Intent**: Optional (not required).
4. Click **Save Changes**.

---

## 4. Generate the OAuth2 Bot Invite Link

1. In the left menu, select **OAuth2** -> **URL Generator**.
2. Under **SCOPES**, select:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Under **BOT PERMISSIONS**, select the following minimal required permissions:
   - **General Permissions:**
     - ✅ View Channels (`VIEW_CHANNEL`)
     - ✅ Manage Roles (`MANAGE_ROLES`) — *Required for recruiter milestone role granting*
   - **Text Permissions:**
     - ✅ Send Messages (`SEND_MESSAGES`)
     - ✅ Send Messages in Threads (`SEND_MESSAGES_IN_THREADS`)
     - ✅ Embed Links (`EMBED_LINKS`)
     - ✅ Attach Files (`ATTACH_FILES`)
     - ✅ Read Message History (`READ_MESSAGE_HISTORY`)
     - ✅ Add Reactions (`ADD_REACTIONS`)
     - ✅ Use Slash Commands (`USE_APPLICATION_COMMANDS`)
4. Copy the generated **OAuth2 URL** and open it in your browser to invite the bot to your Discord server.

---

## 5. Slash Commands Architecture

Community Recruiter provides the following registered slash commands:

| Command | Description | Permission Required |
| :--- | :--- | :--- |
| `/recruiter-code` | View or generate your unique recruiter referral code (e.g. `KRP-001`) | Recruiter / Member |
| `/recruiter` | View recruiter profile, confirmed recruit count, and stats | Recruiter / Member |
| `/application` | Check current application status or obtain apply guidelines | Member / Applicant |
| `/interview` | View scheduled interview details or room information | Member / Applicant |
| `/referral` | Track referral status and recruit lifecycle progression | Recruiter |
| `/recruiter-benefits` | View milestone benefits and unlocked reward tiers | Recruiter |
| `/blacklist` | Check restriction status or flag an applicant | Admin / Moderator / Controller |
| `/rules` | View community rules and recruiter standards | Public |
| `/support` | View community support and moderator contact channels | Public |

---

## 6. Channel Permissions & Security Configuration

1. In your Discord Server Settings, ensure the bot's role is positioned **above** any reward roles it will grant to recruiters in the role hierarchy.
2. In the Community Recruiter Web Dashboard, navigate to **Recruitment Trust -> Channel Allowlist** and add the specific text channels authorized for recruitment and intake.
3. Messages in non-allowlisted channels are ignored.
