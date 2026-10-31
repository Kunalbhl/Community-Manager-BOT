# Google Cloud Platform (GCP) Infrastructure & Provisioning Guide

This guide details how to provision and configure Google Cloud services for **Community Recruiter** strictly following the **Free-First Cost Policy** (zero out-of-pocket expenses and no surprise billing).

---

## 1. Google Cloud Project Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Create Project** -> Project Name: `community-recruiter-prod` (or your chosen project name).
3. Record the **Project ID** -> Set as `community-manager-bot-508316` in your environment.

---

## 2. Google Cloud Firestore (Native Mode) — Free Tier

Firestore provides a generous permanent free tier (1 GiB storage, 50,000 document reads/day, 20,000 document writes/day, 20,000 document deletes/day).

1. In the GCP Console, search for **Firestore**.
2. Click **Create Database**.
3. Select **Firestore Native Mode** (Do NOT choose Datastore Mode).
4. Choose a region with Free Tier eligibility (e.g. `us-central1`, `us-east1`, or `europe-west1`).
5. Select Database ID: `(ai-studio-59f17f1d-8b74-490e-9248-bc41e69de7ef)` or custom `community-recruiter-db`.
6. Set `FIRESTORE_DATABASE_ID=(ai-studio-59f17f1d-8b74-490e-9248-bc41e69de7ef)` in your environment variables.

---

## 3. Google Sheets API & Service Account

1. Navigate to **APIs & Services** -> **Library**.
2. Search for **Google Sheets API** and click **Enable**.
3. Search for **Google Drive API** and click **Enable**.
4. Go to **APIs & Services** -> **Credentials**.
5. Click **Create Credentials** -> **Service Account**.
   - Service Account Name: `community-recruiter-bot`
   - Grant role: `Viewer` or Project Member.
6. Under the created Service Account, click **Keys** -> **Add Key** -> **Create New Key (JSON)**.
7. Save the JSON key securely (e.g. path in `GOOGLE_APPLICATION_CREDENTIALS` or configured in Secret Manager).
8. Share your target Google Spreadsheet with the service account email (e.g. `community-recruiter-bot@<project-id>.iam.gserviceaccount.com`) with **Editor** permissions.

---

## 4. Google Cloud Secret Manager (Optional)

1. Navigate to **Security** -> **Secret Manager**.
2. Click **Create Secret** for any of the following credentials:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_APPLICATION_ID`
   - `DISCORD_PUBLIC_KEY`
   - `GEMINI_API_KEY`
   - `PLATFORM_ADMIN_KEY`
3. The Community Recruiter redaction and secrets manager automatically prevents secrets from leaking into API responses or audit logs.

---

## 5. Free-First Cost Policy & Enforcement Guardrails

Community Recruiter enforces automated safeguards to guarantee zero unintended cloud spend:

| Guardrail | Free Tier Default | Enforcement Action |
| :--- | :--- | :--- |
| `FREE_MODE` | `true` | Refuses billable API provisioning requests |
| `MAX_AI_REQUESTS_PER_DAY` | `100` requests/day | Gracefully queues AI requests for manual review when limit reached |
| `MAX_APPLICATIONS_PER_DAY` | `50` apps/day | Throttles excessive applications with rate-limit status |
| `MAX_SHEET_WRITES_PER_DAY` | `200` writes/day | Batches spreadsheet updates |
| `MAX_AI_TOKENS_PER_REQUEST` | `2048` tokens | Truncates input prompts to prevent high token usage |

---

## 6. Environment Variables Reference (`.env`)

```env
# Server
PORT=3000
NODE_ENV=production

# Platform Ownership
PLATFORM_OWNER_EMAIL=pubgamingzone@gmail.com
PLATFORM_ADMIN_KEY=your_secure_admin_key_here

# Free-First Guardrails
FREE_MODE=true
MAX_AI_REQUESTS_PER_DAY=100
MAX_APPLICATIONS_PER_DAY=50
MAX_SHEET_WRITES_PER_DAY=200
MAX_AI_TOKENS_PER_REQUEST=2048

# Discord Credentials
DISCORD_APPLICATION_ID=your_discord_application_id
DISCORD_PUBLIC_KEY=your_discord_public_key
DISCORD_BOT_TOKEN=your_discord_bot_token

# Google Cloud & Google Sheets
GOOGLE_CLOUD_PROJECT_ID=your_gcp_project_id
FIRESTORE_DATABASE_ID=(default)
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
```
