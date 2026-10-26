-- Applied to fpi-onboarding-db on 2026-10-26
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'In progress',
  progress INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  app_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (app_id, doc_id)
);
CREATE INDEX IF NOT EXISTS apps_updated ON apps(updated_at);
