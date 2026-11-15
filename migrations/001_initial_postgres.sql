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
 description TEXT NOT NULL, state TEXT NOT NULL DEFAULT '¶»§q«^