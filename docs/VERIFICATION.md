# SUDERN — Local verification register

**Run date:** 2026-11-15 (Africa/Blantyre)
**Build:** SUDERN institutional operations v0.2.0
**Environment:** Node 22.16.0; built-in SQLite; local loopback HTTP; separate synthetic browser-dataset DB. No connected production database.

## Results

| Gate | Execution evidence | Result |
| --- | --- | --- |
| JavaScript syntax / static parse | `npm run check` | PASS |
| API integration suite | `npm test`: 9 subtests in isolated temporary database | PASS |
| Authentication / permissions | Logged-in and anonymous API requests; forbidden roles & incorrect CSRF | PASS |
| Public intake and admissions | Consent validation, application review, capacity-bound enrolment, assessment validation; institutional contact enquiry intake & triage | PASS |
| Protected finance workflows | Restriction mismatch → 409, missing approvals → 409, duplicate role → 409, no self-approval → 409, over-budget second approval → 409, paid proof after approvals | PASS |
| Evidence / governance | Self-review → 409, director independent review, executive resolution | PASS |
| Monitoring & community | Indicator creation, dated observations, active-only community listing, unauthorized activation denial | PASS |
| Audit integrity | Linked SHA-256 event verification; SQL update & delete triggers reject modification | PASS |
| Consistent backup and restore | `node:sqlite.backup` into clean file; SQLite integrity, foreign keys, audit-chain and participant state rechecked | PASS |
| Staff browser UI | Real HTML/CSS/JS in headless Chromium, actual local Node HTTP API via Python HTTP transport bridge, authenticated screen and 8 module navigations | PASS (bridged rendering) |
| Mobile browser UI | 390 px layout, authenticated overview and expandable navigation | PASS (bridged rendering) |
| Browser create form | Modal governance form submits to live local API, record visible in register | PASS (bridged rendering) |
| Public intake/contact toggles | Closed states loaded from real local API; public application hidden and contact submit disabled by default | PASS (bridged rendering) |
| JavaScript runtime exceptions in browser UI | Browser pageerror collection | 0 observed |
| External domain / TLS / deployed Node runtime | Not performed | NOT VERIFIED |
| Managed database / backups / disaster recovery | Not performed (local backup only) | NOT VERIFIED |
| Regulatory/data compliance | Not assessed by legal counsel | NOT VERIFIED |
| MFA, account recovery, external security assessment | Not implemented | BLOCKED |
| Real payment integration, bank reconciliation or confirmed grants | Out of scope for local implementation | BLOCKED |

### Browser tooling limitation

In this environment managed Chromium refuses direct navigation to `http://127.0.0.1:3108/` with `ERR_BLOCKED_BY_ADMINISTRATOR`. The browser checks instead load the source HTML/CSS/JS directly and forward JavaScript `fetch()` requests through Python's `requests.Session` to the actual running local Node server. That validates visual rendering, JavaScript control flow, backend responses, the CSRF/session protocol and a form-to-database journey, but **does not certify a real browser's DNS, TLS, cookie transport, CORS, navigation or production network behavior**.

### Synthetic demo screenshots

These images use **fictional participants, financing amounts and reports**. They do not describe SUDERN's achievements.

- `01-portal-login.png` — branded institutional login
- `02-executive-overview.png` — executive dashboard with synthetic warning
- `03-programmes.png` — programme lifecycle/cohorts
- `04-intake.png` — admissions pipeline
- `05-financing.png` — restricted funding + approvals
- `06-monitoring.png` — indicators & observations
- `07-governance.png` — institutional decision register
- `08-evidence.png` — evidence review
- `08b-community.png` — collaboration opportunities and enquiry triage
- `09-audit.png` — immutable append-only event register
- `10-mobile-login.png` — mobile login
- `11-mobile-overview.png` — mobile executive portal
- `13-public-application.png` — public intake closed-state

## Decision

**Local development gate: PASS.** Continue to P0 hardening and accountable programme/governance legal approval. **Production authorisation: HOLD.**
