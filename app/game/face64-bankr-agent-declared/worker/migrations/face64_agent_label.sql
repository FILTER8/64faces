-- Run ONCE against the existing Cloudflare D1 database before deploying Worker changes.
-- Existing sessions remain ordinary/unlabelled.
ALTER TABLE face64_demo_sessions ADD COLUMN runner TEXT;
ALTER TABLE face64_demo_sessions ADD COLUMN strategy TEXT;
