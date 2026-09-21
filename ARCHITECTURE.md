# Community Recruiter Architecture Specification

## 1. System Overview

Community Recruiter is an end-to-end recruitment lifecycle system connecting Discord communities with candidate pipelines, interviewer schedules, recruiter codes, and administrative governance.

The platform is designed around four core architectural principles:
1. **Free-First Operational Mode**: Hard boundaries on daily automated transactions to ensure zero surprise billing.
2. **Least-Privilege Role-Based Access Control (RBAC)**: Fine-grained permissions enforced independently on server endpoints and mirrored in UI routing.
3. **Multi-Channel Notification Dispatch**: Channel-agnostic notification routing to Discord Direct Messages, community Discord channels, and web dashboard feeds.
4. **Pluggable Integration Layers**: Loose coupling between external services (`discord.js`, `@google/genai`, Google Sheets API, Firestore) and core business logic.

---

## 2. Major Modules & Interactions

```
┌────────────────────────────────────────────────────────────────────────┐
│                                CLIENT                                  │
│  ┌───────────────────────────────┐   ┌──────────────────────────────┐  │
│  │   Owner / Controller Shell    │   │       Applicant Portal       │  │
│  │  - Permission-aware Sidebar   │   │  - Status Tracking           │  │
│  │  - 13 Module Management Views │   │  - Candidate Checklists      │  │
│  │  - Notification Drawer        │   │  - Recruiter Attribution     │  │
│  └───────────────────────────────┘   └──────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (X-Request-ID, Bearer)
┌───────────────────────────────────▼────────────────────────────────────┐
│                             SERVER LAYER                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Middleware: RequestID ➔ RateLimiter (Quota) ➔ Auth (RBAC Guard)  │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│  ┌──────────────────────────────────▼───────────────────────────────┐  │
│  │                     Versioned API (/api/v1/*)                    │  │
│  │  /health, /auth, /community, /applications, /recruiters,         │  │
│  │  /recruiter-codes, /users, /notifications, /reports, /settings   │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│  ┌──────────────────────────────────▼───────────────────────────────┐  │
│  │                        Core Domain Services                      │  │
│  │  • AuditService        • NotificationService   • QuotaService    │  │
│  └──────┬───────────────────────────┬───────────────────────────┬───┘  │
│         │                           │                           │      │
│  ┌──────▼─────────────┐   ┌─────────▼─────────────┐   ┌─────────▼───┐  │
│  │ Integration: Discord│   │  Integration: Gemini  │   │ Int: Sheets │  │
│  │ (discord.js)       │   │  (@google/genai)      │   │ (Google API)│  │
│  └────────────────────┘   └───────────────────────┘   └─────────────┘  │
│                                     │                                  │
│  ┌──────────────────────────────────▼───────────────────────────────┐  │
│  │                 Repository Layer (15 Collections)                │  │
│  │  users, communities, roles, permissions, applications,           │  │
│  │  applicationAnswers, interviews, recruiters, recruiterCodes,     │  │
│  │  referrals, notifications, communityConfiguration, rewards,      │  │
│  │  auditLogs, systemSettings                                       │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      ▼
                        Firestore Database (GCP)
```

---

## 3. Database Architecture (15 Firestore Collections)

| Collection | Model Interface | Primary Key | Description |
| :--- | :--- | :--- | :--- |
| `users` | `UserDocument` | Discord User ID | Discord identity, username, avatar, global system role |
| `communities` | `CommunityDocument` | Community UUID | Registered Discord guild mapping and ownership |
| `roles` | `RoleDocument` | Role UUID | Role templates (`OWNER`, `CONTROLLER`, etc.) |
| `permissions` | `PermissionDocument`| Permission UUID | Specific user permission grants & revocations |
| `applications` | `ApplicationDocument`| Application UUID | Candidate submission, review stage, recruiter attribution |
| `applicationAnswers`| `ApplicationAnswerDocument`| Answer UUID | Normalized answers for questions in an application |
| `interviews` | `InterviewDocument` | Interview UUID | Scheduled Discord interview session, scoring, notes |
| `recruiters` | `RecruiterDocument` | Recruiter UUID | Verified recruiter profile, conversion metrics |
| `recruiterCodes`| `RecruiterCodeDocument`| Code UUID | Unique tracking codes (e.g. `ELITE-77`) with usage counters |
| `referrals` | `ReferralDocument` | Referral UUID | Attribution binding recruiter code to an application |
| `notifications` | `NotificationDocument`| Notification UUID | Multi-channel dispatch records across DM, Channel, Dashboard |
| `communityConfiguration`| `CommunityConfiguration`| Community UUID | Guild rules, requirements, toggles, visibility containers |
| `rewards` | `RewardDocument` | Reward UUID | Tiered recruitment point milestones and claims |
| `auditLogs` | `AuditLogDocument` | Audit UUID | Immutable audit trail of administrative actions |
| `systemSettings`| `SystemSettingsDocument`| `default` | Global operational flags, daily quotas, maintenance mode |

---

## 4. Role-Based Access Control (RBAC) & Visibility Matrix

### Roles
1. **`OWNER`**: Unconditional authorization across all 25 system permissions.
2. **`CONTROLLER`**: Individually configured management access. Cannot be assumed to be full administrator.
3. **`INTERVIEWER`**: Application viewing, review transitions, and interview scheduling/notes.
4. **`RECRUITER`**: Application pipeline viewing, personal recruiter code generation, referral logs, and rewards.
5. **`MEMBER`**: Public and community information views, personal notification inbox.
6. **`APPLICANT`**: Restricted strictly to personal application status, requirements checklist, and messages.

### Visibility Tiers
Section content within `CommunityConfiguration` supports 7 visibility tiers:
`PUBLIC` ➔ `APPLICANT` ➔ `MEMBER` ➔ `RECRUITER` ➔ `INTERVIEWER` ➔ `CONTROLLER` ➔ `OWNER`.
Users only possess clearance to view items matching or below their assigned clearance level.

---

## 5. Free-First Quota Architecture

To guarantee predictable cost boundaries when deployed on Google Cloud or personal infrastructure:
1. **QuotaService** maintains rolling daily consumption counters for:
   * AI requests (`MAX_AI_REQUESTS_PER_DAY = 100`)
   * Candidate intake applications (`MAX_APPLICATIONS_PER_DAY = 50`)
   * Google Sheets batch writes (`MAX_SHEET_WRITES_PER_DAY = 200`)
   * Maximum AI tokens per prompt (`MAX_AI_TOKENS_PER_REQUEST = 2048`)
2. **Manual Fallback Rule**: If an automated quota is reached, the system flags the operation for manual reviewer intervention (`fallbackToManualQueue = true`). It **never** triggers paid tier escalation or automatic billing.

---

## 6. Centralized Audit Logging

The `AuditService` logs every administrative action with:
* `actorUserId` & `actorRole`
* `action` (`APPLICATION_APPROVED`, `RECRUITER_CODE_REVOKED`, etc.)
* `targetType` and `targetId`
* Sanitized `metadata` (all tokens, credentials, and passwords automatically stripped)
* `timestamp` and optional `ipAddress`
