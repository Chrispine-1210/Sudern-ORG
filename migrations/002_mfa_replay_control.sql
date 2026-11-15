-- SUDERN v0.3.2: one-use TOTP time step per privileged account.
-- Additive migration; does not delete or replace existing user records.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT;
