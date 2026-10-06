# AuditReady

Vendor risk management for teams of about 20–500 people. One workflow is the product: vendor, assessment, questionnaire, evidence, findings, risk decision, report.

AuditReady is not a certification, and this application is not SOC 2 compliant. The built-in questionnaire is a general vendor-security questionnaire. It does not claim coverage of SOC 2, ISO 27001, NIST CSF, CIS Controls, PCI DSS, or HIPAA. A few questions carry illustrative control references only.

## Architecture

The browser talks to one Next.js app. Domain rules (permissions, risk, workflow, validation, reports) live in `src/lib/domain` and `src/lib/data` and do not know which database is behind them. Two adapters implement the same repository:

- **Demo** (`DemoRepository`) keeps the workspace in `localStorage` under `auditready.demo.v1` and file bytes in IndexedDB. This is the default. No external account is required.
- **Supabase** (`SupabaseRepository`) is selected only when `NEXT_PUBLIC_DATA_MODE=supabase` and both public Supabase keys are set. The signed-in user's session loads that user's organizations. Mutations run through the same engine, then inserts and updates are written with the user JWT so Postgres row-level security is the production boundary.

Vendor portal users are not organization members. In Supabase mode the portal calls `/api/portal/[token]`, which uses the service role only after the token hash matches one invitation, and then reads and writes that assessment only.

```text
UI  ->  repository  ->  domain engine  ->  demo store
                                  \---->  Supabase (RLS) or portal API (service role, scoped)
```

## Local setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). **View demo** opens the Acme Technologies workspace as Alex Rivera.

Sample passwords, demo only: `AuditReady-demo-2026`

| Person | Email | Role |
| --- | --- | --- |
| Jordan Hale | jordan@acme.example | Owner |
| Priya Shah | priya@acme.example | Admin |
| Alex Rivera | alex@acme.example | Analyst |
| Sam Okonkwo | sam@acme.example | Viewer |

Forgot-password in demo mode does not send mail. If the email belongs to a sample user, the page shows the shared demo password. That behavior is demo-only.

## Environment variables

See `.env.example`.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | Public | `demo` (default) or `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key. RLS still applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Vendor portal route. Never expose it to the browser. |
| `AUDITREADY_AI_PROVIDER` | Server | Optional. Leave unset. The app does not call an AI API. |

If Supabase mode is requested but the public URL or anon key is missing, the app stays in demo mode.

## Supabase setup

1. Create a Supabase project.
2. Apply `supabase/migrations/20261006120000_init.sql` with the Supabase SQL editor or CLI (`supabase db push`).
3. In Authentication, allow email/password sign-up. For local development, disable email confirmation or the sign-up screen will ask the user to confirm before entering the workspace.
4. Confirm the private Storage bucket `evidence` exists and is not public. The migration creates it.
5. Set the environment variables and deploy. `src/proxy.ts` refreshes the auth session only in Supabase mode.

The migration creates tables, foreign keys, checks, indexes, soft-delete columns, and forced row-level security. Helper functions `is_org_member`, `member_role`, `can_write`, and `can_admin` are `security definer` so policies do not recurse. Direct deletes are not granted. Audit events can be inserted and selected, and a trigger rejects updates and deletes. High and critical risk acceptances are rejected unless the caller is an owner or admin. Plan changes are rejected unless the JWT role is `service_role`. Workspace creation and invite acceptance go through `create_workspace` and `accept_workspace_invite` because a new member cannot insert those rows under RLS. `handle_new_user` copies `auth.users` into `profiles`. Passwords are stored by Supabase Auth, not in `profiles`.

## Storage

Evidence paths are `{organizationId}/{vendorId}/{documentId}/{fileName}`. The `evidence` bucket is private. Authenticated members receive 60-second signed URLs. Portal uploads go through the service role and must use the invited assessment's organization and vendor. Allowed types: PDF, DOCX, XLSX, CSV, TXT, PNG, JPEG, WebP. Maximum size 10 MB. SVG and HTML are rejected. Filenames are stripped of paths and control characters. Files are never executed.

Seeded demo documents have metadata and no bytes. Download asks you to upload the file again. Uploads in the current browser are stored in IndexedDB.

## Demo mode

Demo mode is the whole product without credentials: marketing site, sign-in, a seeded Acme workspace, vendors, assessments, questionnaires, the vendor portal, findings, reports, exports, and a development panel. The panel is rendered only when `repo.mode === "demo"` and `NEXT_PUBLIC_DATA_MODE` is not `supabase`. It can switch sample users, move assessment status, submit a questionnaire, create a finding, override residual risk, shift due dates, and reset the browser database.

Demo passwords are salted SHA-256 with the prefix `auditready.demo-password.v1:`. That is not a production password hash. Production sign-in uses Supabase Auth. Demo entitlements are unlimited so the sample story is not truncated. A new demo workspace is on the Business plan for the same reason. A new Supabase workspace starts on Starter.

The development portal links are stable:

- Northstar Cloud: `/portal/ar_demo_northstar_7f3c9a2e4b81`
- BrightMail: `/portal/ar_demo_brightmail_19ab44c0de77`

## Assessment workflow

Statuses: draft, questionnaire sent, vendor responded, in review, remediation, approved, approved with conditions, rejected, closed. Transitions are listed in `src/lib/domain/workflow.ts`. A decision records approved, approved with conditions, rejected, or requires remediation. Requires remediation moves the assessment to remediation. High or critical residual risk can require a second approval from an owner or admin; the decision stays pending and does not change status until that approval. Reassessment copies vendor metadata into a new draft and does not copy previous answers.

## Questionnaire model

Templates are organization data. Creating an assessment copies the template into `assessment_questions` so later template edits do not rewrite an in-flight review. Question types: yes/no, yes/no/not applicable, text, multiple choice, file request. Each question has a risk weight, guidance, and an optional evidence flag. The built-in template key is `vendor-security-v1` (about 62 questions). Custom templates and duplicates follow the plan entitlement. Demo mode does not enforce that limit. In Supabase mode, Starter cannot create custom questionnaires; Pro and Business can. Editing the built-in template is limited to owners and admins.

## Risk model

Ratings are Low, Moderate, High, or Critical. The formulas are in `src/lib/domain/risk.ts`.

- **Inherent.** Eight yes/no factors, weights summing to 18. Bands: 0–1 low, 2–5 moderate, 6–10 high, 11–18 critical.
- **Control.** Pass is 0, partial is half the weight, fail is the full weight. Not applicable is excluded. Unreviewed questions are left out of the ratio and reduce coverage. Under 15% low, under 35% moderate, under 60% high, otherwise critical. No reviewed questions yields moderate and preliminary. Coverage under 50% stays preliminary.
- **Residual.** Start at inherent. Low control risk steps down one (floor low). Moderate stays. High steps up one. Critical steps up two (cap critical). Critical inherent plus low control risk remains high.
- **Overrides.** Inherent and residual overrides require a justification of at least 8 characters and are written to the audit log.

Criticality (low, moderate, high, critical) is a separate analyst judgment about data, access, dependency, and impact. High or critical criticality requires a justification.

## Reports

The assessment report is print-friendly HTML. Use the browser's print dialog to save a PDF. The executive summary is a deterministic template from the vendor, service, risks, findings, and decision. An analyst can replace that text. No AI is involved.

## Authorization

Roles are owner, admin, analyst, and viewer. The matrix is `src/lib/domain/permissions.ts`. The engine reads the membership role stored for the session's user and organization. It does not trust a role or organization id supplied by the client as authority. Every query is filtered by the caller's organization. High and critical risk acceptance requires owner or admin, in the engine and again in a database trigger. Closing a finding that has remediation actions requires a verified action and closure notes.

## Audit log

Events are append-only. The engine records actor, time, action, entity, and before/after where it has them. Vendor actors on the portal have a null user id and a label such as `Vendor (email)`. The Supabase table rejects updates and deletes. The app loads the latest 500 events per workspace in Supabase mode.

## Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Tests cover risk bands, permissions, status transitions, questionnaire scoring, finding workflow, report text, token hashing, upload validation, CSV formula injection, organization isolation on the seeded database, and the demo repository. `collectChanges` checks that a Supabase flush sends only changed rows and can exclude another organization's rows.

## Deployment

Deploy the Next.js app to Vercel. Set the environment variables in the project settings. Do not set `NEXT_PUBLIC_` on the service role key. Apply the migration before pointing the app at the project. Security headers are set in `next.config.ts` (frame denial, nosniff, referrer policy, a partial content security policy, and a 12 MB proxy body limit so a 10 MB upload can pass).

## Security notes before production

- Row-level security is the production boundary. The service role bypasses it. Keep that key on the server, and keep the portal route scoped to the invitation's organization, vendor, and assessment.
- The content security policy does not set `script-src`, because a strict policy needs a nonce story this version does not ship. Tighten it before production.
- Login and portal rate limits use an in-memory limiter. It does not coordinate across instances. Put a shared limiter in front of sign-in and `/api/portal` before a public launch.
- Demo password hashing and the forgot-password demo hint must never run when Supabase mode is on. They do not.
- Organization delete sets `deleted_at` and signs the user out. Rows and storage objects remain for an operator purge. Membership checks treat a deleted organization as inaccessible.
- Invite codes and portal tokens are stored as SHA-256 hashes with the prefix `auditready.token.v1:`. The raw value is shown once.
- CSV exports prefix cells that start with `=`, `+`, `-`, `@`, tab, or carriage return.
- Document intelligence is not implemented. `DeterministicDocumentAnalysisService` does not read file bytes and does not invent findings. `AIEnhancedDocumentAnalysisService` throws if a provider is set. The SOC 2 form is analyst-entered metadata.
- This product does not implement SSO, SCIM, continuous monitoring, ticketing integrations, or a native mobile app.

## Data retention

Deleting a workspace is a soft delete. Production access checks ignore deleted organizations. Retained rows and private objects need an operator process before a customer-data deletion request can be called complete. The schema does not yet implement a compliance retention schedule.

## First fifteen minutes

Open the demo, go to the dashboard, open Northstar Cloud, open the active assessment, finish the SOC 2 review metadata, mark a control pass, partial, or fail, create a finding, add remediation, set residual risk, approve with conditions, and open the report. The development panel can reset the story if the browser database has drifted.
