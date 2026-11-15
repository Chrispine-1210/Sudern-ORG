# SUDERN — production authorisation controls

**Present decision: NO-GO for external production / real participant data / real-money operations.**

## P0: Required before any public intake or staff production use

1. **Legal and governance identity** — independently verify official name (SUDERN/SDRNMLO), registration, board/responsible officials, governing constitution, authorised representatives, approved programmes, address and public contact channels. No inference from mock brand board.
2. **Participant and data governance** — approve Malawi-specific legal basis and privacy notice, data controller and complaint channels, safeguarding, explicit consent, retention/deletion request workflows, access roles and screening rules for minors/sensitive information.
3. **Managed persistence and reliability** — move SQLite to managed PostgreSQL with tested reversible migrations, transaction isolation checks and immutable audit anchoring. Set encrypted offsite backups and empty-target restore drills for production.
4. **Authentication and account operations** — enforce MFA for privileged roles, account recovery, identity proofing, account disable/role change, session revocation, sustainable rate limiting and alerting; conduct independent security review.
5. **Finance operational controls** — adopt approved grant terms, authorised fund signatories, procurement thresholds, bank reconciliations, dual approval policy, rejection/exception logging and independent evidence review. Test the exact payment-proof workflow; no automatic bank transfers here.
6. **Delivery assurance** — define programme syllabi, application/admissions rules, cohort schedules, staff capacity, verifiable trainer credentials, accreditation rules where relevant, indicators, enumerator protocols and follow-up measurement design.
7. **Production execution** — owned hosting and database, TLS/domain/DNS, secrets management, infrastructure observability, CI test gates, migration/preflight, resilience tests and an accountable deployment rollback plan.
8. **Accessibility and safeguards** — keyboard and screen-reader audit, image licensing, cross-browser and low-bandwidth/mobile acceptance, English/Chichewa content review, abuse reporting, notifications and anti-spam controls.

## Current certification boundary

The repository has successful local syntax tests, integration tests, isolated database backup/restore tests and DOM-rendered desktop/mobile navigation tests with an HTTP bridge to the local server. This is **not** proof of cloud deployment, real email delivery, external identity-provider behavior, real bank transfer settlement, regulatory registration, actual grants, beneficiaries or measurable economic impacts.

**No production merge, deployment, application intake or money-management approval is inferred from local PASS alone.**
