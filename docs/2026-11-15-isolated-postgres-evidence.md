# SUDERN isolated PostgreSQL execution evidence — 15 November 2026

## Scope and source
- Source base: merged `main` commit `f093ea1970f810db2edc498021076e6d3251901a`.
- Fix: independent per-endpoint in-memory throttles for `/api/auth/login`, `/api/auth/mfa/setup`, and `/api/auth/mfa/verify`. Database-backed per-account authentication caps and challenge caps remain.
- Runtime: isolated ephemeral Vercel Sandbox `sbx_x1tAw6mRJmMaYnqBpnFyE8fWUNwH` with local PostgreSQL **18.6** (Ubuntu 26.04). No live SUDERN Preview data used.
- Synthetic-only database: `sudern_test_second`, a separately created empty local PostgreSQL database.
- The sandbox's complete PostgreSQL HTTP integration flow was run after applying the equivalent single-line source change; the exact committed patch must still be checked by an exact-head reproducible run before merge.

## Defect reproduced
Against unmodified `main`, `npm run test:postgres` **failed** while enrolling six synthetic staff roles:
- HTTP 429 “Too many attempts” received where HTTP 202 MFA challenge was expected.
- Root cause: login, MFA setup, and MFA verification shared a single per-IP counter, despite endpoint-specific limits of 15/20/25. Normal multi-staff enrolment consumed all three limits together.

## Fix verification
After scoping each throttle key to the originating request pathname:
- `npm run test:postgres`: **1 passed, 0 failed, 0 skipped**.
- Tested six staff-role password → MFA enrolment → verification flows, challenge reuse rejection, TOTP replay rejection, programme cohort/enrolment, assessments, finance two-person approval, deliberate 200/409 concurrent approvals, evidence self-review prohibition, governance, M&E, and chained audit integrity.
- PostgreSQL DB migration versions 1 and 2 passed on an empty isolated database.
- The baseline `npm test` on merged main previously passed **22 tests, 0 failures, 1 PostgreSQL skip** (because no PostgreSQL test URL was set); the PostgreSQL run above resolves the skipped-runtime evidence for this isolated environment.

## Independent encrypted backup and restore
- Created custom-format `pg_dump -Fc` from the populated synthetic `sudern_test_second`.
- Encrypted with application AES-256-GCM secure backup utility; decrypted to a separate dump; binary `cmp` PASS.
- Restored via `pg_restore --exit-on-error --no-owner --no-acl` into a separately created empty `sudern_restore`.
- Restored schema migration max version: **2**.
- Original and restored checksums matched for six users, one fund, two expenses, one application, and final audit event hash `1583813de66974523c63fbf919ff6ed38ef9917f377792dbd61f2641f2cc7c60`.
- **Result: isolated PostgreSQL backup integrity / empty-target restore PASS.**
- This is **not** an independent recovery of the real managed Neon production/Preview database.

## Live Vercel exact-main staging
- Deployment `dpl_DPNFohxdR8qL34B42Qjtc8DufW89` is `READY` at exact merged main SHA `f093ea1970f810db2edc498021076e6d3251901a`, target `staging` (nonproduction).
- GET `/api/health` returned HTTP 200, PostgreSQL schema v2 and matching `commit_sha`, `production_authorized: false`.
- GET `/`, `/portal.html`, `/apply.html` returned HTTP 200.
- Authenticated remote write workflows with actual authorised Preview staff were **not executed** for this particular deployment.

## GitHub Actions separate provider blocker
- Mainline runner canary `43692810646` was retried (attempt 2) and still failed **before any step ran**.
- Runner name and job steps absent. Repository quality job `43692810735` similarly failed before executable steps.
- Local/Sandbox PASS cannot be called GitHub Actions PASS or mainline CI certification.
- Owner/support must unblock GitHub-hosted runner startup, or record an accountable exception restricted to merge only. **No production authorization**.

## Decision
- Isolated synthetic PostgreSQL runtime and restore: PASS for the tested patched candidate.
- GitHub Actions remote jobs: BLOCKED.
- Real managed DB recovery and authenticated exact-head Preview flow: UNVERIFIED.
- Production authorization: **HOLD**.
