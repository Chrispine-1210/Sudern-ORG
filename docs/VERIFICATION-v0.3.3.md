# SUDERN v0.3.3 — Evidence and certification boundary

Date: 2026-11-15 (Africa/Blantyre). Decision: DEVELOPMENT PASS / PRODUCTION HOLD.

## Reproduced and repaired

- **Critical privileged MFA replay defect in v0.3.2**: verification SQL selected challenge + account identity but omitted `u.mfa_last_step`. The application therefore compared against undefined and could accept a previously used TOTP on a fresh challenge. Fixed by selecting `u.mfa_last_step` from the locked user row; added explicit source-contract regression test. **The behavioral replay assertion still requires a real PostgreSQL runtime to prove end to end.**
- **Direct Node production hold bypass**: Vercel production function checked `SUDERN_PRODUCTION_AUTHORIZED`, but the direct Node/PostgreSQL `serve()` path did not. New early gate returns HTTP 503 unless explicitly authorised. Added isolated unit test without needing a configured database. Protected Vercel previews remain allowed only through `VERCEL_ENV=preview`; normal production is default-denied.

## Executed local checks

- Node `npm run check`: PASS.
- Node `npm test`: **22 PASS, 0 FAIL, 1 SKIP** (the skipped test is the entire managed PostgreSQL HTTP workflow).
- Desktop browser with live HTTP-backed local SQLite sandbox: authenticated login, command centre, 8 modules, governance record creation PASS.
- Mobile browser with same sandbox: authenticated login, command centre and responsive navigation PASS.
- Public application and enquiry forms: verified CLOSED status with intake disabled.
- Browser page errors: none; isolated temporary sandbox database removed.
- npm registry: `EAI_AGAIN` network DNS failure; `npm install --package-lock-only --offline` returned `ENOTCACHED`; no lockfile created.

## Connected provider operations and observed results

- Vercel project `prj_YEZ2GPwY56V6N4zQFt6tLTieVG9r` is protected by Vercel Authentication for all deployments; environment variable `SUDERN_PRODUCTION_AUTHORIZED=false`, `INTAKE_ENABLED=false`.
- Protected synthetic Preview canary deployment `dpl_7BS42KgEMmdN122K6BFv48ea5h75`: READY; authenticated provider fetch returned HTTP 200 for test content. This is NOT the SUDERN application.
- Protected static holding-page deployment `dpl_EmTg3ay21Mp3Ryq7AnnzfpDCP8SF`: READY, marked target production by Vercel on first deployment; protected by project-wide auth; contains no operational code or records. This is NOT production authorisation.
- Managed Neon organisation: `Vercel: chrispine-1210's projects` (`org-polished-math-67877180`). Dedicated SUDERN create-project operation rejected by provider: `action restricted; organization is managed by Vercel`. No SUDERN project found in database list.
- GitHub: account `Chrispine-1210` accessible but SUDERN repository creation action is absent from the connected tool surface; no SUDERN repository found. No remote workflow run available.

## Release gates still missing

1. Dedicate a managed PostgreSQL project with isolated privileges/credentials and an empty test branch.
2. Run current migrations 001 + 002 against it, record schema and connection evidence. Never run over an unrelated database.
3. Produce a real npm package-lock.json through official npm resolution, commit it, run `npm ci` cleanly.
4. Create a private GitHub repository, push the *complete* v0.3.3 source, run quality and isolated PostgreSQL CI including MFA replay and two-person financial authority.
5. Deploy exact tested Git commit into a protected Vercel Preview with configured, restricted secrets and **synthetic-only** staff accounts. Test same commit and actual app, not canary.
6. Prove authenticated HTTP journeys, one-use TOTP, concurrency 409, evidence review, governance, logout revocation, and denial of unauthorised users.
7. Restore an encrypted PostgreSQL backup to a clean target, compare record counts, SHA/audit tip and readbacks.
8. Review legal governance, privacy, safeguarding, support, logging, recovery drill, operational signatories, and actual institutional authority before authorising a production launch.

**Do not set `SUDERN_PRODUCTION_AUTHORIZED=true`, publish real participant enrolment, or accept financial operations until these gates have evidence.**
