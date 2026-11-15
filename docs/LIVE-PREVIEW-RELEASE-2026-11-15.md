# SUDERN operational platform — protected Preview release verification

As at 15 November 2026, the **actual SUDERN institutional website and backend** are deployed on a protected Vercel **Preview** (not a static infrastructure canary). No production authorisation has been granted.

## Live immutable deployment

- **Preview URL:** https://sudern-institutional-ops-preview-q6r5t7x93.vercel.app
- **Vercel project:** sudern-institutional-ops-preview (`prj_YEZ2GPwY56V6N4zQFt6tLTieVG9r`)
- **Immutable deployment ID:** `dpl_H1kMbHwyLKiPLbtfER32RxTYY2Fj`
- **Status:** READY (Preview target; no production promotion)
- **SSO deployment protection:** enabled for all deployments, verified via Vercel project configuration
- **Runtime:** Node.js and PostgreSQL, using preview-only encrypted database and MFA secrets

## Managed PostgreSQL isolation

- Vercel-managed Neon project: `long-silence-42249423` (existing shared provider project; **not a new standalone project**).
- Isolated SUDERN branch: `br-rapid-surf-aix5nt49` (`sudern-preview-isolated-20261115`). Parent branch remains untouched.
- Created databases: `sudern_preview`, `sudern_test`. `sudern_preview` is connected only to Vercel Preview via encrypted environment variables.
- `sudern_preview_app` role has scoped read/write access to `sudern_preview.public` only, not a superuser role.
- Migration ledgers 1 and 2 are present. Live schema has 20 application tables.
- Tech Forge, Financial Academy and ChumaLab programmes seeded in a `planned` state; no impact or funding claims implied.

## Verified live HTTP checks

| URL / operation | Result |
| --- | --- |
| `/` | 200, SUDERN actual institutional website |
| `/portal` | 200, branded staff portal |
| `/apply` | 200, application interface |
| `/brand-emblem.webp` | 200, original SUDERN emblem optimized for web |
| `/styles.css`, `/portal.css`, `/portal.js` | 200 |
| `/api/health` | 200, live PostgreSQL, schema version 2 |
| `/api/public/programmes` | 200, 3 planned programmes |
| `/api/public/config` | 200, intake disabled. Known cosmetic defect: its `environment` field says `production` because the Preview process uses `NODE_ENV=production`. The Vercel deployment target is verifiably Preview. |
| `/api/dashboard` without application authentication | 401, blocked |
| password authentication | 202, MFA challenge issued; no session cookie before MFA |
| MFA setup + TOTP | PASS, session and CSRF established |
| authenticated executive dashboard | PASS |
| integrity-verified audit read | PASS |
| logout and post-logout replay | PASS, revoked session refused |

The first E2E test found a test-harness HTTP 415 error on logout because the harness omitted the required `Content-Type: application/json`. The test harness was corrected to send `{}`; full external E2E reran to PASS with a second synthetic administrator. The actual UI's logout sends JSON correctly. Two synthetic test administrators were disabled after verification. No real beneficiary data was entered.

## Recovery snapshot drill

A separate Neon branch `br-lucky-river-ailx2sgw` was created from SUDERN's isolated preview branch. Snapshot readback confirmed both SUDERN databases, the three planned programmes, two synthetic accounts, four audit events, and schema version 2. **This validates branch-clone recoverability only; it does not certify a complete independent encrypted pg_dump/pg_restore disaster-recovery exercise.**

## Release restrictions

- Preview is operational with live managed PostgreSQL and authenticated staff workflows.
- **Production remains HOLD:** public intake and real finance processing remain disabled.
- No SUDERN GitHub repository or remote Actions CI run exists, because the connected GitHub provider exposes no repository creation operation and the sandbox CLI is not signed in. The source/CI workflow are packaged and ready for an authenticated `gh` create/push.
- Production-ready encrypted backup/restore, real executive onboarding, broader runtime workflow certification, hosting region/data-governance review, and release approvals remain pending.
- Do not treat this Preview as evidence that SUDERN is legally registered, funded, or operating its programmes.
- The old canonical hostname points to an older synthetic canary; use the **immutable Preview URL above**. No production alias was reassigned.

## Deployment contents and source integrity

This source package includes source code, Vercel routing, PostgreSQL migrations, local/CI automated tests, GitHub Actions workflow, scripts, an exact dependency lockfile and this verification record. Secrets and database passwords are not included.

## Additional live PostgreSQL operational workflow certificate (same deployed Preview)

A second complete authenticated test was conducted against the **actual protected Vercel deployment**, not a local SQLite server, after deploying the full application. Four fresh synthetic staff accounts (director, finance officer, programme officer, MEL officer) each completed password → TOTP enrolment → TOTP verification → session/CSRF, then performed:

- Tech Forge cohort creation.
- Recording a test-only restricted fund of MWK 500,000; requesting two test-only expenses of MWK 300,000 each.
- Blocking premature payment before dual approval (HTTP 409).
- Separate finance-officer and director approvals; running the director's two second approvals concurrently. **Exactly one HTTP 200 and one HTTP 409**; no double allocation.
- Recording a synthetic payment-evidence reference; verifying exactly MWK 200,000 available in that synthetic fund.
- Creating programme evidence, rejecting self-review (HTTP 409), approving independent review, recording a governance resolution, creating a MEL indicator and observation.
- Verifying append-only audit-chain integrity and logging out all four accounts.

**Result:** `SUDERN_LIVE_PREVIEW_FINANCE_GOVERNANCE_MEL_PASS`, command exit 0. All six synthetic staff accounts created during the two live test runs were subsequently **disabled** in the isolated Preview database. Synthetic ledger/impact transactions remain for traceability and the portal displays a prominent **SYNTHETIC SANDBOX** disclaimer; no real cash, participants, approvals or outcomes are represented.

### Post-finance recovery snapshot comparison

An additional Neon child branch `br-divine-mud-ai7n7add` (`sudern-finance-recovery-drill-20261115`) was created. Readbacks between the active Preview database and the isolated recovery clone matched **exactly** for programme, user, fund, expense, approval, governance, evidence, indicator, observation and audit-event counts, plus the full last audit hash (`41084c0ca2ea…`). Source and recovery snapshot both contained 3 programmes, 6 disabled synthetic accounts, 1 test fund, 2 test expenses, 3 approvals, 1 governance resolution, 1 evidence record, 1 indicator, 1 observation and 26 audit events at the comparison point. **This confirms a matching Neon branch-clone recovery snapshot; it does not replace an independent encrypted pg_dump/pg_restore rehearsal.**

### Source-packaged CI verification

The downloadable GitHub-ready source archive has an exact dependency lockfile, an updated manifest covering 77 files, a live-deployment report, and a publishing script that **requires** an already authenticated GitHub CLI. Its local `npm run check`, `npm run verify:manifest` and `npm test` returned **22 passed / 0 failed / 1 PostgreSQL integration test skipped**. The skip remains explicit even though a separate live Preview HTTP acceptance test has now passed; the isolated scripted PostgreSQL CI test has not yet executed in GitHub Actions.
