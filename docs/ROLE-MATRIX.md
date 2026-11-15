# SUDERN operations access matrix

Legend: R=read, C=create, A=approval/decision, U=update. All POST/PATCH calls must carry a session-bound CSRF token.

| Function | Administrator | Director | Programme officer | Finance officer | M&E officer | Viewer |
|---|---|---|---|---|---|---|
| Public site, public programme overview | public | public | public | public | public | public |
| Internal dashboard | R | R | R | R | R | R |
| Programmes / lifecycle | R,U | R,U | R | R | R | R |
| Cohort setup | C | C | C | R | R | R |
| Applications: personal records | R,U | R,U | R,U | no access | R | R |
| Contact enquiries: view/triage | R,U | R,U | R,U | no access | no access | R |
| Enrol approved applicants | C | C | C | no access | R | R |
| Participant assessments | C | R | C | no access | C | R |
| Fund receipts | R | R | R | R,C | no access | R |
| Expense requests | no access | C | C | C | no access | R |
| Expense approval | no access | A | no access | A | no access | no access |
| Payment evidence | no access | R | no access | C | no access | R |
| Define M&E indicators | R | C | R | R | C | R |
| Record outcome observations | R | R | R | no access | C | R |
| Governance decision creation | C | C | R | R | R | R |
| Governance decision approval | no access | A | no access | no access | no access | no access |
| Register new evidence | C | C | C | C | C | R |
| Verify evidence | no access | A | no access | no access | A (not own submission) | no access |
| Community opportunity creation | C | C | C | R | R | R |
| Community opportunity publication | no access | A | no access | no access | no access | no access |
| Create account | C | no access | no access | no access | no access | no access |
| Audit/event-chain review | R | R | no access | no access | no access | no access |

## Finance hard controls

Two DIFFERENT USERS with TWO DISTINCT ROLES must approve: `finance_officer` + `director`; the requester is excluded from approval. The second approval is conditional on available non-allocated funding inside an immediate database transaction. Restricted fund expenditure must match the programme restriction. Paying requires both approvals and an HTTPS reference to supporting payment evidence. This is a **record-control workflow**, not a bank transaction processor.

## Accountability limitations

The account roles do not independently establish the organisation's legal signatories, official directors, board authority or statutory obligations. Production launch requires signed policies, independent access approval, recurring permission reviews and monitored privileged activity.
