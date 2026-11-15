# SUDERN — Institutional Operations Platform

SUDERN (Sustainable Development and Resource Network for Merging Leaders Organization) is developing an institutional platform for **Tech Forge**, **Financial Academy**, **ChumaLab**, governance, restricted financing, community opportunities and monitoring & evaluation in Malawi.

## Deployment and certification

- Source in this repository is derived from the operational application deployed to **protected Vercel Preview**, not the earlier synthetic connectivity page.
- **Production authorisation: HOLD.** Do not handle live beneficiaries or release funds until the production gates are independently certified.
- Staff authentication requires privileged-user MFA and `MFA_ENCRYPTION_KEY`; the PostgreSQL backend requires `DATABASE_URL`. Never commit credentials.
- The Preview is intended for synthetic testing only. Public intake is disabled.
- Verify independent restore, approval concurrency, access controls and exact-commit deployment before production promotion.

## Running locally

Requires Node.js 22+ and an isolated PostgreSQL instance.

```bash
npm ci
npm run check
node --test tests/*.test.js
```

The serverless entrypoint is `api/index.js`. PostgreSQL migration files are in `migrations/`. Use the isolated GitHub Actions job for reproducible migration and restore validation.

## Programme architecture

**Tech Forge:** applied technology and workforce skills.
**Financial Academy:** literacy, savings, budgeting and finance readiness.
**ChumaLab:** enterprise incubation and sustainable livelihoods.

Governance, finance requests and M&E have evidence and audit controls; programme outcomes must be supported by real data, never synthetic indicators.

## Repository disclosure

The repository was created by the owner as **public**. No application secrets or live participant data should be uploaded here. Repository privacy and branch protection must be confirmed before full production operations.

This initial GitHub import reflects the **deployed runtime**. Additional administration/backup scripts and full historical test suites are retained in the separately delivered engineering archive until all files can be reconciled with this repository.
