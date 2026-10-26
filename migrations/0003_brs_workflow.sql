-- Applied to fpi-onboarding-db on 2026-10-26: registrations (BR-01/02) and BRS workflow statuses
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  user_type TEXT,
  name TEXT,
  country TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'Lead',
  reason TEXT,
  decided_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reg_status ON registrations(status);
-- Map the earlier demo statuses onto the BRS workflow
UPDATE apps SET
  status = CASE status WHEN 'Submitted' THEN 'Business review' WHEN 'Under review' THEN 'Business review' WHEN 'Query raised' THEN 'Returned' WHEN 'Pending DDP approval' THEN 'Checker review' WHEN 'Approved' THEN 'Registered' ELSE status END,
  data = json_set(data, '$._status', CASE status WHEN 'Submitted' THEN 'Business review' WHEN 'Under review' THEN 'Business review' WHEN 'Query raised' THEN 'Returned' WHEN 'Pending DDP approval' THEN 'Checker review' WHEN 'Approved' THEN 'Registered' ELSE status END);
