# Local verification — SUDERN 0.3.1

Date: 2026-11-15; release status **LOCAL-ONLY / PRODUCTION HOLD**.

- `npm run check`: PASS (JavaScript parse checks).
- `npm test`: 17 passing, 1 intentionally skipped (`PG_TEST_DATABASE_URL` missing); security, legacy SQLite workflow, backup AES-GCM round-trip & tamper detection, production gate.
- Local browser verification (legacy SQLite, synthetic database, isolated port): PASS: desktop portal, staff sign-in, 8 operational workspaces, governance write; mobile login/sidebar; public intake closed; no JavaScript page errors.
- PostgreSQL migration to managed provider: **NOT RUN** (Neon project creation restricted by Vercel).
- GitHub Actions: **NOT RUN** (no dedicated repository).
- PostgreSQL dump/restore via `pg_dump` / `pg_restore`: **NOT RUN** (no usable isolated PostgreSQL host). Authenticated encryption algorithm test is not a database restore.
- Vercel Preview deployment: **NOT CREATED** (protected project exists, but no database/repository).
- Exact-head authenticated remote E2E: **NOT RUN**.
- `npm install --package-lock-only --offline`: **FAILED** (`pg` metadata not cached); current package has no lockfile, so CI dependency reproducibility is an outstanding gate. Execute a networked locked install, inspect and commit lockfile before remote release.

No secrets, tokens, personally identifying participant data, or real fundraising records were used in these tests. Test names and funds are synthetic.
- Hardening after the local run: PostgreSQL `/api/health` schema-ledger check and exact commit metadata support; PostgreSQL test added a fresh-database guard. JavaScript syntax PASS; full PostgreSQL behaviour still cannot be certified without a live test DB.
