# SUDERN — managed infrastructure execution register

Date: **2026-11-15** | Candidate: **v0.3.1** | Decision: **PRODUCTION HOLD**

This is a status ledger, not a certificate. `PASS` requires independent evidence for the **exact source head**, **exact managed database branch**, and **exact deployment ID**. A prepared script or UI screenshot never counts as runtime proof.

| Gate | Actual evidence | Decision |
|---|---|---|
| 0. Source inspected | local v0.3.0 source and explicit test runner inspected; v0.3.1 adds encrypted PG backup/restore drill | PASS (source prep only) |
| 1. Dedicated managed PostgreSQL | Neon `create_project` rejected: `action restricted; organization is managed by Vercel` | **BLOCKED** |
| 2. Isolated managed branch and empty-target migration | no new database/branch ID, no actual managed connection, no migration result | **BLOCKED** |
| 3. Private GitHub repo / Actions execution | no SUDERN repository found in connected GitHub; repository-create action not exposed; local workflow authored but not run | **BLOCKED** |
| 4. Protected Vercel Preview | pre-existing project `sudern-institutional-ops-preview` ID `prj_YEZ2GPwY56V6N4zQFt6tLTieVG9r`, protection enabled for all deployments; source deployment not created | **BLOCKED** |
| 5. Authenticated exact-head E2E | local SQLite test suite passes, but PostgreSQL test skips without `PG_TEST_DATABASE_URL`; live Preview/MFA untested | **BLOCKED** |
| 6. PG encrypted backup → restore to empty target | script and CI synthetic drill authored; local authenticated crypto round-trip/tamper test passes. Full Postgres restore cannot run without PostgreSQL service | **NOT EXECUTED** |
| 7. Production readiness | no independent evidence for preceding gates or legal/privacy/governance approvals | **HOLD** |

## Remote actions requiring platform UI/provider support

1. **Vercel Storage → Create Database → Neon Postgres**: provision a **new** database/project named `sudern-ops` under the correct Vercel team. Do not reuse any Mtendere, Aöthothe, pharmacy, or portfolio database. Its connected Neon organisation is Vercel-managed, and the available database connector refuses new project creation. Do not modify existing branches.
2. Create `sudern_sandbox` on a separate isolated test branch/project from any future production dataset. Use separate roles for runtime and migration. Set `DATABASE_URL` and `MFA_ENCRYPTION_KEY` through **encrypted Preview environment variables only**. Turn `INTAKE_ENABLED` off.
3. Create a **new private SUDERN GitHub repository** in the organisation/owner who should own the project. Current connected GitHub tool can edit existing repositories but cannot create a new one. Push the committed source bundle, do not push `.env`, plaintext dumps, or synthetic SQLite databases. Gate `main` with required `static-and-legacy` + `isolated-postgres` Actions checks.
4. Run `npm run migrate:pg`, `npm run verify:postgres`, and `npm run test:postgres` **on the correct isolated branch**. The test runner refuses unsafe names; never point it at production data. Record project ID, branch ID, migration ledger, commit SHA, Action run ID, success logs.
5. Link GitHub to `sudern-institutional-ops-preview` and deploy from **non-production** branch, with Vercel Authentication enabled. Confirm the deployment ID, exact commit SHA, branch, linked Preview `DATABASE_URL` database name and schema version before testing.
6. Execute MFA logins for distinct roles and the synthetic chain: applicant → approval → enrollment → assessment → fund → two-authority expense approval → concurrent over-allocation 409 → payment evidence (ledger only) → M&E → governance → independent evidence verification → audit. Check session invalidation, access denial, no public intake, database durability after redeployment. Capture sanitized HTTP status and audit hashes.
7. For managed PG, obtain encrypted `pg_dump -Fc` or verified provider PITR and restore to a **new empty database** with `pg_restore --exit-on-error`, verify migration and audit chain, compare counts, and perform an authenticated readback. A provider console showing backup settings is **not** a restore certification.
8. Record executive approvals: registration/legal identity, policy adoption, director signatories, privacy, safeguarding, incident response, operations runbook, second factor recovery, domain/TLS and independent security review. Production promotion remains forbidden until these pass.

**No operator should paste a database connection string, password, backup key or TOTP seed into this report, an issue, a pull request, or chat.**

## Operational handoff — no guesswork

- Managed DB ID: `UNASSIGNED`
- Isolated test branch ID: `UNASSIGNED`
- Remote GitHub repository URL: `UNASSIGNED`
- Git commit SHA on provider: `UNASSIGNED`
- CI run ID: `UNASSIGNED`
- Vercel Preview deployment ID/URL: `UNASSIGNED`
- Verified encrypted restore evidence: `NOT EXECUTED`
- Production status: **HOLD**

## Hardened preview/production switch (v0.3.1)

The application now independently checks `VERCEL_ENV=production` and rejects every request with HTTP 503 unless `SUDERN_PRODUCTION_AUTHORIZED=true`. This is defense in depth; Vercel Authentication and no-domain production release controls still apply. The Vercel project was explicitly set to `SUDERN_PRODUCTION_AUTHORIZED=false` for **preview and production** on 2026-11-15. The user authorised preparation, not production promotion. Do **not** flip the switch without the full accountable GO decision and a reviewed release.

No live `DATABASE_URL`, `MFA_ENCRYPTION_KEY`, or secret value has been configured by this release. No deployment exists as of the cited remote check; the switch is configuration defense, not deployment evidence.

## Exact-head / destructive-test protections

The PostgreSQL `/api/health` route now verifies the schema migration ledger version and exposes the non-secret Vercel build commit SHA, if supplied, so the operator can compare it with the deployment record. A `200` health response is **not** proof of all application journeys. The isolated PostgreSQL workflow explicitly refuses to run if users, audit events, or applications already exist in the named test database, in addition to its safe-name restriction. Preserve this fail-closed guard during execution.
