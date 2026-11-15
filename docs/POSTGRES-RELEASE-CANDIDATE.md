# SUDERN 0.3.0 — PostgreSQL, MFA, Secure Preview, CI/CD

**Status on 2026-11-15: RELEASE CANDIDATE CODE COMPLETE; PostgreSQL migration and end-to-end environment certification NOT EXECUTED. Production HOLD.**

## What was materially implemented

- Dedicated asynchronous PostgreSQL adapter with parameter binding, pooled connections, `AsyncLocalStorage`-bound transactions and database-enforced checks. The legacy SQLite development path is retained only for local comparison and earlier regression tests.
- Initial versioned PostgreSQL schema for all operational tables, with migrations failing closed if unrelated tables are present without the migration ledger. No production data was moved or copied. No schema was applied to a remote database.
- Mandatory TOTP MFA for **all six staff roles** (including read-only users because the portal exposes sensitive records): password → short-lived DB challenge → account enrolment or verification → authenticated session. Authenticator secrets are AES-256-GCM encrypted with a separate 32-byte key. Eight one-time recovery codes are shown once and are stored as HMAC hashes. A privilege session cannot be issued without successful MFA.
- DB-backed account-attempt limiting, challenge-attempt counting, short challenge expiry, HttpOnly SameSite=Strict Secure cookies in production, CSRF and Origin checks; explicit session/MFA audit entries.
- Transactional PostgreSQL row locks for budget allocation and cohort capacity to prevent concurrency over-allocation. Audit chain serialised with transaction-scoped PostgreSQL advisory lock. DB triggers reject audit update/delete.
- Vercel Node function entrypoint, fail-closed for missing secrets, `vercel.json`, protected-preview deployment guidance and GitHub Actions workflow with PostgreSQL 17 service and full HTTP workflow tests.
- Public intake defaults **OFF**, demo/test records remain entirely synthetic, production status always unapproved.

## Remote provisioning attempt

- A dedicated managed Neon project `sudern-institutional-ops` **could not be created**: the connected Neon organisation is Vercel-managed and the Neon API returned `action restricted; organization is managed by Vercel`. This is an infrastructure provider boundary, not a completed migration.
- Vercel project `sudern-institutional-ops-preview` was created on the user's connected team under project ID `prj_YEZ2GPwY56V6N4zQFt6tLTieVG9r`. Its **Vercel Authentication is enabled for ALL deployments**. Preview env `SANDBOX=true`, `PG_POOL_MAX=3`, `NODE_ENV=production`; public intake `INTAKE_ENABLED=false` on preview and production.
- No `DATABASE_URL`, `MFA_ENCRYPTION_KEY`, remote Git repository, deployment URL or public domain has been connected. The project has **no deployment**. CI workflow source files exist but there are no observed GitHub Actions runs for SUDERN.

## Required operator steps (secrets never in Git or chat)

1. Provision an **independent, dedicated PostgreSQL database** for SUDERN via the Vercel-managed Neon integration, or a separately owned managed PostgreSQL provider. Do not reuse the Mtendere, portfolio, Aöthothe or any other organization's database for SUDERN.
2. Create isolated Preview database/branch. Verify the branch has no production or real participant data. Target `sudern_sandbox` in isolated validation where appropriate. Do **not** import the example SQLite fixture data.
3. Connect pooled `DATABASE_URL` to **Preview only**, with TLS required. Use an application-level least-privilege role; keep schema migration permissions to a separate migration role after schema creation when possible. Assign `MFA_ENCRYPTION_KEY` (cryptographically random base64 32 bytes) through a protected secrets manager, not a source file. **Do not rotate it casually:** existing authenticator seeds and recovery hashes rely on the key.
4. In a controlled terminal/CI environment with database access, run `npm install`, `npm run migrate:pg`, then `npm run verify:postgres`; capture migration version, exact branch/database ID and evidence logs without secret values. Run on a **fresh empty isolated database first**.
5. In a throwaway PostgreSQL 17 test instance or dedicated ephemeral Neon test branch with database name `sudern_test` or `sudern_sandbox`, set `PG_TEST_DATABASE_URL` and run `npm run test:postgres`. The test creates synthetic people, logins, cohorts, enrolments, assessments, restricted funds, concurrent financial approvals, evidence review, governance and audit events. Never point it at real user/financial data.
6. Put project source into a **new dedicated private GitHub repository**, merge only after Quality workflow passes and branch protection/required reviewers are configured. Link this repository to the existing Vercel project. Require protected Preview SSO and exact-commit testing; production domain and promotion remain blocked.
7. Test authenticated live Vercel Preview on its **exact commit** and its **own isolated PostgreSQL branch**: sign in with MFA, create test application, approve/enrol, assess, create test fund and expense, one finance + director approval, deny competing over-allocation (HTTP 409), record fake payment reference (not a transfer), evidence review, governance, read back M&E/audit; verify cache/session behavior after redeploy, test role isolation, fail-closed missing env, restart durability, and separately restore an encrypted offsite backup to an empty target.
8. Obtain independent sign-off for legal identity/NGO registration, policies, privacy/safeguarding, financial signing powers, production secrets, domain/TLS, retained audit proofs, recovery drills, accessibility and monitoring. **Only then may production HOLD be reconsidered.**

## CLI (requires external provider and secrets)

```bash
npm install --ignore-scripts
npm run check
npm test

# Isolated PostgreSQL database ONLY; set DATABASE_URL and MFA_ENCRYPTION_KEY via secrets manager:
npm run migrate:pg
npm run verify:postgres

# Disposable database named sudern_test/sudern_sandbox ONLY:
PG_TEST_DATABASE_URL='[secret from test environment]' npm run test:postgres
```

### Bootstrap test administrator safely

Only for a **brand-new empty synthetic SANDBOX** database; no default password:

```bash
SANDBOX=true ADMIN_PASSWORD='[from secret manager]' npm run create-admin:pg -- 'Synthetic Administrator' 'admin@sudern-test.invalid'
```

## Current verification evidence

| Gate | Observation | Result |
|---|---|---|
| Original SQLite HTTP integration chain | 9 tests executed on isolated local SQLite instance | PASS — legacy local only |
| MFA TOTP, encryption, recovery | 4 Node unit tests | PASS — algorithm tests |
| PostgreSQL SQL adapter and migration structural checks | 2 Node unit tests | PASS — static contract only |
| Desktop/mobile browser and live local UI API bridge | Login, navigation, governance write, intake disabled; no JS page errors | PASS — local SQLite backend, not PG |
| GitHub Actions workflow | Defined with isolated Postgres17 CI service | NOT RUN — no SUDERN repository |
| Actual PostgreSQL 17 HTTP chain | Test code available; `PG_TEST_DATABASE_URL` not supplied | SKIPPED — NOT VERIFIED |
| Managed Neon database and migrations | Provider creation rejected | BLOCKED |
| Exact-head protected Vercel Preview deployment | Project protected, no code deployment/database wiring | NOT DEPLOYED |
| Production public release / real funds and PII | Legal and runtime gates not approved | HOLD |

## Security limitations before GO

- No demonstrated live PostgreSQL migration or full chain on managed infrastructure, no offsite encrypted backup restore evidence, no independent penetration testing, no second-factor account reset governance. Existing SQLite script remains a dev-only baseline; **never expose it externally**.
- Live user/account email verification, email notice delivery, password resets, custody of MFA key, emergency access, compromised account revocation and credential-rotation procedures require approved operational policy.
- Funds remain **ledger/test-record entries**, not bank-verified cash balances, physical fund custody or authorised disbursements. `POST /api/expenses/:id/pay` accepts an evidence URL but makes **no bank transfer**.
- Technical controls do not prove SUDERN's legal registration, programme accreditation, beneficiary numbers, available grants or actual economic outcomes.
