-- Applied to fpi-onboarding-db on 2026-10-29
-- Updated BRS workflow: Business Reviewer approves registrations and assigns a Business Checker (RM),
-- who assigns the Application RM (ARM) and can create investors internally.
ALTER TABLE registrations ADD COLUMN origin TEXT NOT NULL DEFAULT 'External';
ALTER TABLE registrations ADD COLUMN created_by TEXT;
ALTER TABLE registrations ADD COLUMN bchecker TEXT;
ALTER TABLE registrations ADD COLUMN arm TEXT;
-- Map earlier statuses onto the new stages
UPDATE apps SET
  status = CASE status WHEN 'Business review' THEN 'Business check' WHEN 'Ready for NSDL' THEN 'NSDL upload' WHEN 'NSDL submitted' THEN 'Final due diligence' ELSE status END,
  data = json_set(data, '$._status', CASE status WHEN 'Business review' THEN 'Business check' WHEN 'Ready for NSDL' THEN 'NSDL upload' WHEN 'NSDL submitted' THEN 'Final due diligence' ELSE status END);
