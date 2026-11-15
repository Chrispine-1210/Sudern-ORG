# SUDERN — Active Protected Preview (15 Nov 2026)

**Actual app preview:** https://sudern-institutional-ops-preview-q6r5t7x93.vercel.app — Vercel READY with isolated managed PostgreSQL; SSO enabled; authentication, MFA, dashboard, audit, and logout verified. **Production promotion and public intake remain blocked.** See `docs/LIVE-PREVIEW-RELEASE-2026-11-15.md` for exact evidence and known gaps.

---

# SUDERN — Institutional Operations Platform v0.3.3

**Development verification: PASS (22 tests passed; PostgreSQL integration skipped). Production authorisation: HOLD.**

Release 0.3.3 fixes a confirmed authentication defect in v0.3.2: privileged MFA verification had omitted `u.mfa_last_step` from the locked account query, potentially allowing TOTP replay despite the migration existing. This release selects the account's last-used time step and adds a regression assertion. It also enforces the production hold on direct Node deployments, not only on the Vercel production function. Browser tests were rerun on a fresh ephemeral-port synthetic SQLite sandbox and passed.

**Remote hosting evidence:** Vercel `sudern-institutional-ops-preview` has a protected synthetic canary Preview deployment (`dpl_7BS42KgEMmdN122K6BFv48ea5h75`, READY) and a protected static holding-page build (`dpl_EmTg3ay21Mp3Ryq7AnnzfpDCP8SF`, READY, production alias). **Neither contains the operational application, a database or live data.** The holding page was created as a smoke test and is not a production release. PostgreSQL creation is restricted by the Vercel-managed Neon organisation, and no dedicated GitHub repository exists; the CI workflow is not executed remotely. npm registry DNS failure prevents creating a defensible package-lock.json here; do not bypass `npm ci` in CI.

See [`docs/VERIFICATION-v0.3.3.md`](docs/VERIFICATION-v0.3.3.md) for exact evidence and the outstanding release gates.

---

# SUDERN — Institutional Operations Platform v0.3.2

**Current release gate: production HOLD.**

**v0.3.2 hardening:** one-use privileged TOTP step (additive PostgreSQL migration 002), correct schema-v2 health gate, transactional row locks on sensitive status transitions, precision-safe BIGINT parsing, invalid-key fail-closed checks, guarded Preview smoke and stronger CI restore comparison. **Local checks: 20 PASS, 1 PostgreSQL E2E skipped**; browser flow PASS against legacy SQLite sandbox. Dependency `pg` cannot be installed and a real package lockfile cannot be created in this offline environment; the CI now deliberately requires `npm ci` and will fail until a trusted lockfile is committed. The protected Vercel project has no deployment and remains at `SUDERN_PRODUCTION_AUTHORIZED=false`.

Read [`docs/VERIFICATION-v0.3.2.md`](docs/VERIFICATION-v0.3.2.md) and [`docs/PROVIDER-UNBLOCK-v0.3.2.md`](docs/PROVIDER-UNBLOCK-v0.3.2.md) for exact evidence and prerequisites. Historical v0.3.1 manifests and verification notes below must not be treated as current release certification.

 See [`docs/REMOTE-EXECUTION-GATES.md`](docs/REMOTE-EXECUTION-GATES.md) for exact evidence and blockers. This package includes a PostgreSQL-targeted backend, mandatory MFA for every staff account, Vercel preview configuration, GitHub Actions and isolated PostgreSQL test scenarios. **PostgreSQL managed migration/production-like E2E tests have NOT been executed**, because the connected provider rejected independent project creation.

**Read [`docs/POSTGRES-RELEASE-CANDIDATE.md`](docs/POSTGRES-RELEASE-CANDIDATE.md) first.** The prior v0.2.0 SQLite development instructions below describe the legacy local test baseline and MUST NOT be interpreted as PostgreSQL or production proof.

# SUDERN — Institutional Operations Platform

**Status: implemented and locally tested. NOT production-authorised.**

A dependency-free Node.js + SQLite operational foundation integrating SUDERN's existing branded institutional website with a governed, authenticated operational control centre. Uses SUDERN's provided navy, green, gold and emblem brand assets. The code never claims SUDERN is registered, has secured funding, has enrolled actual participants, or has delivered verified outcomes.

## Modules delivered

| Area | Working capabilities | Critical production limitation |
| --- | --- | --- |
| Public identity | Existing SUDERN site integrated with portal/intake links | Official registration, contacts, photography and copy require organisation approval. |
| Public intake / contact | Consent-based programme applications and institutional enquiries, configurable hard-disable, throttling, validation | `INTAKE_ENABLED=false` by default; privacy and safeguarding approvals required before real personal data collection. |
| Programmes | Tech Forge, Financial Academy, ChumaLab; lifecycle status, named cohorts, enrolment capacities | No LMS course player, external accreditation or offline synchronisation yet. |
| Applications | Submitted → under review → approved/rejected → enrolled | Selection policies and applicants' rights still need organisational approval. |
| People | Participants, cohorts, enrollment control, baseline/final/follow-up score records | Minimal personal-data fields; retention and access review pending. |
| Finance | Evidence-linked receipts, restricted funds, expense requests, two-role approval, over-allocation HTTP 409, payment reference register | Does NOT connect to a bank, transfer funds, reconcile bank balances or constitute audited financial records. |
| M&E | Indicators, baselines, targets, observations, evidence references, assessment results | Evidence entry does not imply independently verified social impact. |
| Governance | Decision register with categories, owners, resolutions, approval source links | Software director role is not a substitute for adopted board/legal authority. |
| Evidence | Source register, verification workflow, no self-review | Independent review is local to institution; not external auditor certification. |
| Community | Draft/active/closed challenges, mentorship and partnership opportunities; public active listing API; contact enquiry workflow | No public messaging forum, CRM automation or community voting yet. |
| Users & audit | Six RBAC roles, scrypt password hashes, opaque 8-hour sessions, CSRF, origin checks, append-only SHA-256 linked activity register | MFA, recovery, security monitoring, offsite audit notarisation pending. |

## Quick start (Node.js 22.13+)

```bash
cd sudern-platform
npm run check
npm test
# Set a NEW password in your process environment; use a secrets manager in actual service operation.
export ADMIN_PASSWORD='choose-a-long-unique-secret'
npm run create-admin -- 'System Administrator' 'admin@example.org'
unset ADMIN_PASSWORD
npm start
```

Then visit `http://127.0.0.1:3000/` for the public website, `/portal` for staff login, and `/apply` for the public expression-of-interest route (disabled by default). Replace the example email and password with organisation-approved credentials. **Never create a staff account with credentials from the sandbox documentation.**

Optional local environment variables: `PORT`, `HOST`, `DATABASE_PATH`, `INTAKE_ENABLED` (default false), `SANDBOX` (default false), `NODE_ENV`. For a `.env` file, load the configuration in your shell or hosting process — this project deliberately has no dependency on dotenv.

### Verifying a fresh empty database

```bash
npm run check
npm test
node scripts/verify-db.js
node scripts/backup.js /secure/path/sudern-2026-11-15.db
# Restore verification using an independent path:
DATABASE_PATH=/secure/path/sudern-2026-11-15.db node scripts/verify-db.js
```

The backup script refuses to overwrite existing backups and reports a SHA-256 file fingerprint. Its backups are **unencrypted** and must not be placed in a public folder. Encrypted offsite backup with recovery testing is still required for production. The tests create and discard their own temporary database.

### Demonstration with synthetic records

```bash
export SANDBOX=true
export DATABASE_PATH=./data/sandbox-preview.db
export SANDBOX_PASSWORD='unique-test-only-password-12-or-more-chars'
node scripts/seed-sandbox.js
unset SANDBOX_PASSWORD
npm start
# In another shell, verify desktop/mobile views using local API HTTP bridge:
BROWSER_SANDBOX_PASSWORD='same-test-only-password' python tests/browser-check.py
```

The seed script refuses to run unless the filename contains `sandbox`, the sandbox flag is set, and the database contains no existing users. Demo login is `admin@sandbox.sudern.invalid`, with your own `SANDBOX_PASSWORD`. Names, amounts, outcomes and activities are **fictional**; don't migrate this database into production. The portal prominently labels a sandbox dashboard. Do **not** enable `INTAKE_ENABLED=true` on any public-facing URL before approved privacy controls and operational procedures exist.

## File map

```text
public/                 public SUDERN website, intake form, portal HTML/CSS/JS and supplied emblem
src/db.js               schema, indexes, foreign keys, transactions, linked audit hashes
src/security.js         credentials, sessions, cookie and origin validation
src/server.js           HTTP, public and role-protected JSON API, static routes
scripts/create-admin.js one-time administrator creation
scripts/seed-sandbox.js opt-in synthetic data generator with safety guard
scripts/backup.js       SQLite consistent backup and SHA-256 manifest
scripts/verify-db.js    database integrity, foreign keys, chain verification
tests/platform.test.js  real-HTTP integration tests with ephemeral isolated database
tests/browser-check.py  desktop/mobile UI and real-HTTP-bridged browser verification
docs/                   implementation readiness and local screenshots
```

## Critical caveats

- The built-in `node:sqlite` API is experimental under Node 22. Operational production should use managed PostgreSQL, proper migrations and secure backups. Local persistence is real; production durability is **not proven**.
- This server binds `127.0.0.1` by default, deliberately preventing accidental network exposure. It is **not** a static Vercel artifact. Deploying only `public/` would break all operational capabilities.
- Do not use the application to manage real funding, personally identifying information or live programme placement until registration, authority, policy, privacy and security gates have passed.
- Account reset/revocation, MFA, durable IP rate limiting, external penetration testing, bank integration, email notifications, configurable retention, operator monitoring and disaster recovery are not yet implemented.
- A PDF/logo master was not delivered; `brand-emblem.png` is a raster extraction from the provided SUDERN brand board, not an SVG/vector master.

Read `docs/VERIFICATION.md`, `docs/ROLE-MATRIX.md` and `docs/RELEASE-GATES.md` before proceeding to production.
