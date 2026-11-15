# SUDERN operational platform — verification register v0.3.2

**Date:** 2026-11-15  
**Decision:** **LOCAL DEVELOPMENT PASS / REMOTE CERTIFICATION BLOCKED / PRODUCTION HOLD**

This is an evidence register, **not** a production certificate. Tests are scoped to the specific implementation and environment stated. Synthetic data was used throughout; this document does not claim SUDERN legal status, real programme outcomes or funds.

## Executed checks (actual evidence)

| Gate | Evidence | Result and boundary |
|---|---|---|
| JavaScript parsing | `npm run check`; `node --check` on server/browser scripts | PASS (parsing only) |
| Legacy operational journeys | `npm test`, `tests/platform.test.js` | PASS on **SQLite development sandbox**, not PostgreSQL |
| Cryptographic controls | TOTP RFC test, encryption tamper test, recovery code test, one-use matching step | PASS (units only) |
| Production deployment switch | `tests/unit-prod-hold.test.js` | PASS: non-authorised Production and invalid MFA config fail closed |
| PostgreSQL migration contracts | `tests/unit-postgres-contract.test.js` | PASS (SQL/source structural assertions, no live PostgreSQL parser) |
| Browser workspace | `tests/browser-check.py` on fresh synthetic SQLite DB, random localhost port | PASS: desktop login, eight modules, governance write; mobile login/navigation; public intake disabled; no browser JS errors. Original first attempt hit an **occupied localhost port** (3108), then fixed by running on a verified available random port. |
| CI YAML | Python YAML parser (`BaseLoader`) | PASS: three jobs, valid YAML syntax; no remotely executing workflow. |
| PostgreSQL integration | `npm run test:postgres` | **BLOCKED**; exits 2 without `PG_TEST_DATABASE_URL`; no live PG proof. |
| Exact-head protected Preview | `npm run preview:smoke` | **BLOCKED**; exits 2 without URL, exact SHA and synthetic staff credentials. |
| Reproducible dependencies | `npm ci --offline` | **FAIL: missing package-lock.json**; npm network unavailable in this runtime; must generate/commit actual lockfile from trusted registry, no fabricated lock. |
| PostgreSQL backup restore | CI workflow includes encrypted `pg_dump -Fc`, `pg_restore` to an empty DB, `verify:postgres`, counts and audit tip comparisons | **NOT EXECUTED**; local AES-GCM algorithm check is not restore proof. |

## Repairs implemented in v0.3.2

1. **TOTP replay protection**: independently authenticated MFA time steps can only be consumed once; additive migration `002_mfa_replay_control.sql` stores `mfa_last_step`. Recovery code redemption remains single-use.
2. **Financial and casework state concurrency**: lock current record (`FOR UPDATE`) and validate status inside transactions for application review, participant status, expense rejection, governance approval, evidence review, enquiry review, and community opportunity status. Existing approved-expense fund-row locks remain.
3. **Correct schema gate**: PostgreSQL health and independent verifier expect migration version **2**; runtime refuses malformed MFA encryption key.
4. **Safe financial conversions**: reject PostgreSQL BIGINT/NUMERIC values that would silently lose JavaScript integer precision.
5. **CSRF**: authenticated logout is also subject to same-origin CSRF validation; malformed encoded static paths return a 400 rather than an uncaught error.
6. **Preview verification**: a no-write authenticated smoke test checks exact commit, schema version, public intake closed, MFA, session, dashboard, audit and logout. Requires deliberately provided synthetic Preview credentials.
7. **Release CI**: locked `npm ci` (fails until real lockfile is committed), PostgreSQL 17 isolated workflow, encrypted restore with record-count/audit-tip equality, and manually gated protected-preview smoke.

## Connected infrastructure status (independently inspected)

- **Vercel:** `sudern-institutional-ops-preview`, `prj_YEZ2GPwY56V6N4zQFt6tLTieVG9r`; all-deployment SSO protection enabled. **Zero** deployments. Environment has `SANDBOX`, `INTAKE_ENABLED`, `PG_POOL_MAX`, `NODE_ENV`, and `SUDERN_PRODUCTION_AUTHORIZED`. No `DATABASE_URL` or `MFA_ENCRYPTION_KEY` present.
- **Neon:** SUDERN-specific project search: none. Direct dedicated project creation was rejected by provider: `action restricted; organization is managed by Vercel`.
- **GitHub:** SUDERN repository search: none. Connected GitHub tools cannot create repositories; local Git source and bundle exist only inside artifact.
- **Safety gate:** `SUDERN_PRODUCTION_AUTHORIZED=false`, `INTAKE_ENABLED=false`. Do **not** flip until independent review and accountable GO.

## Evidence required to change a gate to PASS

1. Dedicated SUDERN managed PostgreSQL project/resource ID, isolated branch ID, non-sensitive schema/migration logs.
2. Fresh trusted package lockfile, reproducible `npm ci`, SQL migration and PostgreSQL 17 integration PASS logs (not skipped).
3. Private GitHub repo path, exact 40-character commit SHA, Actions run ID with actual jobs (no synthetic/cancelled startup) and required check results.
4. Protected Vercel Preview deployment ID, exact commit SHA, healthy database schema v2, fully authenticated synthetic browser/HTTP evidence for all privileged roles and workflow transitions, including intentional over-allocation HTTP 409.
5. `pg_dump -Fc` from the managed **synthetic** source; AES-256-GCM encryption; restoration to a *new empty* managed database; validation of schema, row counts and audit hashes; application readback. No real participant data.
6. Production security/privacy, organisational governance and legal approvals, monitoring/incident recovery, MFA enrolment and recovery policy, backup runbook, independent security review, accountable release decision.

**Nothing in the current test output satisfies gates 1–6. Production HOLD is the correct decision.**
