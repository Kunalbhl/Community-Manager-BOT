# Community Recruiter

> Production-oriented foundation for an intelligent Discord Community Recruitment and Application Management platform.

## 1. Project Purpose

Community Recruiter provides communities with a robust, scalable system to manage member recruitment, candidate applications, interview workflows, recruiter referral attribution, automated onboarding role assignments, and administrative telemetry.

This repository represents **Task 1: Production Foundation**. It establishes typed schemas, repository interfaces, least-privilege Role-Based Access Control (RBAC), multi-channel notification abstractions, external integration facades (Discord, Gemini AI, Google Sheets), and a responsive management interface—strictly without fake production data or mock stubs.

---

## 2. Architecture & Design Principles

* **Free-First Cost Control**: Built around `FREE_MODE=true` with strict daily caps (`MAX_AI_REQUESTS_PER_DAY`, `MAX_APPLICATIONS_PER_DAY`, `MAX_SHEET_WRITES_PER_DAY`, `MAX_AI_TOKENS_PER_REQUEST`). When quotas are reached, processes automatically fallback to manual queues rather than incurring silent cloud charges.
* **Least-Privilege RBAC**: Both client navigation and server-side API routes independently evaluate permissions. Controllers are not assumed to have administrator rights; their permissions are individually configurable.
* **Separate Portals**: Full isolation between the Owner/Controller Management Dashboard and the candidate Applicant Portal.
* **Pluggable Integration Layers**: Clean service abstractions for `discord.js`, `@google/genai`, Google Sheets API, and Firestore database.

---

## 3. Folder Structure

```
.
├── client / src/             # Management UI & Applicant Portal (React 19 + Tailwind CSS)
│   ├── components/layout/    # Header, Sidebar (permission-aware), NotificationDrawer
│   ├── components/views/     # DashboardOverview, ModuleFoundationView, ApplicantPortalView, AccessDeniedView
│   ├── types/                # Frontend UI types
│   ├── App.tsx               # Primary dashboard shell & role router
│   └── main.tsx              # React DOM bootstrap
├── server/                   # Backend Express API & Microservice Abstractions
│   ├── config/               # Environment loader & Free Mode limits
│   ├── controllers/          # RFC 7807 versioned API controllers
│   ├── integrations/         # Pluggable integration facades
│   │   ├── discord/          # discord.js bot lifecycle & actions
│   │   ├── gemini/           # @google/genai analysis & prompt screening
│   │   └── google/           # Google Sheets & Drive sync
│   ├── logging/              # Structured logger with secret redactor
│   ├── middleware/           # Request ID, Auth/RBAC guard, Error handler, Rate limiter
│   ├── models/               # Strongly-typed Firestore model definitions
│   ├── repositories/         # Firestore repository interfaces (15 collections)
│   ├── routes/               # Versioned routes (/api/v1/*)
│   ├── security/             # RBAC engine, visibility filters, rate limiter
│   ├── services/             # Audit logging, notifications, quota tracker
│   └── utils/                # Standard AppError hierarchy
├── shared/                   # Shared TypeScript definitions
│   └── types/                # RBAC, Community Config, Models, API contracts
├── test/                     # Core automated test suite
├── server.ts                 # Full-stack server entry point (Express + Vite)
├── .env.example              # Documented environment template
└── package.json
```

---

## 4. Environment Variables

See `.env.example` for all configurable keys. Key variables include:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `PORT` | HTTP server port | `3000` |
| `FREE_MODE` | Strict free-tier cost enforcement | `true` |
| `MAX_AI_REQUESTS_PER_DAY` | Maximum Gemini AI calls per day | `100` |
| `MAX_APPLICATIONS_PER_DAY` | Maximum candidate applications processed per day | `50` |
| `MAX_SHEET_WRITES_PER_DAY` | Maximum Google Sheets sync writes per day | `200` |
| `MAX_AI_TOKENS_PER_REQUEST`| Maximum tokens allowed per Gemini request | `2048` |
| `DISCORD_BOT_TOKEN` | Discord Application Bot Token (Task 2) | Unset in Foundation |
| `GEMINI_API_KEY` | Gemini API Key for candidate screening | Unset in Foundation |
| `GOOGLE_SHEETS_SPREADSHEET_ID`| Target Google Sheets database spreadsheet ID | Unset in Foundation |
| `FIRESTORE_DATABASE_ID` | Firestore Database instance ID | `(default)` |

---

## 5. Development & Build Commands

* **Run Development Server**:
  ```bash
  npm run dev
  ```
* **Run Test Suite**:
  ```bash
  npm test
  ```
* **Typecheck (Lint)**:
  ```bash
  npm run lint
  ```
* **Production Build**:
  ```bash
  npm run build
  ```
* **Start Production Bundle**:
  ```bash
  npm start
  ```

---

## 6. Security Notes

* **No Secret Exposure**: Discord bot tokens, Gemini keys, Google credentials, and service account keys are stored server-side only and are never bundled into client assets.
* **Sensitive Log Redaction**: The central logger automatically inspects payload objects and redacts any strings resembling bot tokens, passwords, authorization headers, or private keys.
* **Independent Server Verification**: Client-side UI state is treated strictly as an interface convenience. All `/api/v1/*` endpoints independently verify request authorization via `requirePermission` and `requireRole`.
* **Zero Mock Compromises**: The database and API endpoints do not fabricate mock candidates or pretend integrations succeed when credentials are absent.

---

## 7. Google Cloud Deployment

The application is structured for direct deployment to a Google Cloud Compute Engine VM or Cloud Run container:
1. Container boots via `server.ts` on port 3000.
2. In production, Vite pre-builds static assets to `dist/`, and Express serves the bundled assets and `/api/v1/*` endpoints.
3. System uses standard service account credentials attached to GCP instances or explicit environment variables.
