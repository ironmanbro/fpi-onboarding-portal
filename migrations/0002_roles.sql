-- Applied to fpi-onboarding-db on 2026-10-26
ALTER TABLE apps ADD COLUMN owner TEXT;
ALTER TABLE apps ADD COLUMN reg_no TEXT;
CREATE INDEX IF NOT EXISTS apps_owner ON apps(owner);
CREATE INDEX IF NOT EXISTS apps_status ON apps(status);
