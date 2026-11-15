-- SUDERN v0.3 PostgreSQL schema: NEW EMPTY INSTANCE ONLY. Never run over other project tables.
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','director','programme_officer','finance_officer','mel_officer','viewer')),
 active INTEGER NOT NULL DEFAULT 1, mfa_secret_enc TEXT, mfa_confirmed INTEGER NOT NULL DEFAULT 0, mfa_recovery_hashes TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL,
 expires_at TEXT NOT NULL, mfa_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mfa_challenges (
 challenge_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 pending_secret_enc TEXT, expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS mfa_challenges_expiry_idx ON mfa_challenges(expires_at);
CREATE TABLE IF NOT EXISTS auth_attempts (
 key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS auth_attempts_expiry_idx ON auth_attempts(reset_at);
CREATE TABLE IF NOT EXISTS programmes (
 id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, focus TEXT NOT NULL,
 description TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','active','completed','paused')),
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cohorts (
 id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id), name TEXT NOT NULL,
 capacity INTEGER NOT NULL CHECK(capacity>0), start_date TEXT, end_date TEXT,
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','cancelled')),
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id),
 applicant_name TEXT NOT NULL, applicant_email TEXT NOT NULL, phone TEXT, motivation TEXT NOT NULL,
 consent INTEGER NOT NULL CHECK(consent=1),
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','approved','rejected','enrolled')),
 source TEXT NOT NULL DEFAULT 'public', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enquiries (
 id TEXT PRIMARY KEY, contact_name TEXT NOT NULL, organisation TEXT NOT NULL DEFAULT '',
 contact_email TEXT NOT NULL, interest TEXT NOT NULL, message TEXT NOT NULL,
 consent INTEGER NOT NULL CHECK(consent=1),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','under_review','closed')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
 programme_id TEXT NOT NULL REFERENCES programmes(id), cohort_id TEXT REFERENCES cohorts(id),
 name TEXT NOT NULL, email TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','withdrawn')),
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assessments (
 id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
 kind TEXT NOT NULL CHECK(kind IN ('baseline','final','followup')), score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 evidence_url TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', assessed_at TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS funds (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, source_ref TEXT NOT NULL,
 restricted_programme_id TEXT REFERENCES programmes(id), received_mwk BIGINT NOT NULL CHECK(received_mwk>0),
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','closed')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expenses (
 id TEXT PRIMARY KEY, fund_id TEXT NOT NULL REFERENCES funds(id), programme_id TEXT NOT NULL REFERENCES programmes(id),
 amount_mwk BIGINT NOT NULL CHECK(amount_mwk>0), purpose TEXT NOT NULL, proof_url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','paid','rejected')),
 requested_by TEXT NOT NULL REFERENCES users(id), requested_at TEXT NOT NULL,
 payment_ref TEXT, paid_at TEXT);
CREATE TABLE IF NOT EXISTS expense_approvals (
 expense_id TEXT NOT NULL REFERENCES expenses(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('director','finance_officer')),
 approved_at TEXT NOT NULL, PRIMARY KEY(expense_id,user_id), UNIQUE(expense_id,role));
CREATE TABLE IF NOT EXISTS indicators (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, programme_id TEXT REFERENCES programmes(id),
 name TEXT NOT NULL, unit TEXT NOT NULL, baseline REAL, target REAL,
 due_date TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations (
 id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL REFERENCES indicators(id),
 value REAL NOT NULL, observed_at TEXT NOT NULL, evidence_url TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS governance (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
 owner_id TEXT NOT NULL REFERENCES users(id), resolution TEXT NOT NULL DEFAULT '',
 evidence_url TEXT, status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','closed')),
 created_at TEXT NOT NULL, decided_at TEXT);
CREATE TABLE IF NOT EXISTS evidence (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 source_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
 details TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id), reviewed_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL, reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS opportunities (
 id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('challenge','mentor','collaboration','volunteer')),
 title TEXT NOT NULL, description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','closed')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
 seq BIGSERIAL PRIMARY KEY, id TEXT NOT NULL UNIQUE,
 actor_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 detail_json TEXT NOT NULL, occurred_at TEXT NOT NULL, previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL);


CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries(status,created_at);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status,created_at);
CREATE INDEX IF NOT EXISTS participants_programme_idx ON participants(programme_id,status);
CREATE INDEX IF NOT EXISTS expenses_fund_status_idx ON expenses(fund_id,status);
CREATE INDEX IF NOT EXISTS observations_indicator_idx ON observations(indicator_id,observed_at);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE OR REPLACE FUNCTION sudern_prohibit_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit records cannot be modified'; END; $$;
CREATE TRIGGER sudern_audit_immutable_update BEFORE UPDATE ON audit FOR EACH ROW EXECUTE FUNCTION sudern_prohibit_audit_change();
CREATE TRIGGER sudern_audit_immutable_delete BEFORE DELETE ON audit FOR EACH ROW EXECUTE FUNCTION sudern_prohibit_audit_change();
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
