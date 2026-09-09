-- Additive migration: legacy state, frozen scope, evidence and provenance stay intact.
ALTER TABLE work_requests ADD COLUMN expires_at TEXT;
ALTER TABLE work_requests ADD COLUMN resolution_json TEXT CHECK (resolution_json IS NULL OR json_valid(resolution_json));
ALTER TABLE work_requests ADD COLUMN blocker_json TEXT CHECK (blocker_json IS NULL OR json_valid(blocker_json));
ALTER TABLE work_requests ADD COLUMN ended_at TEXT;

CREATE TRIGGER work_request_agreement_is_immutable
BEFORE UPDATE OF project_id, requester_id, recipient_id, expires_at, accepted_scope_json ON work_requests
WHEN NEW.project_id IS NOT OLD.project_id OR NEW.requester_id IS NOT OLD.requester_id
  OR NEW.recipient_id IS NOT OLD.recipient_id
  OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.accepted_scope_json IS NOT NULL AND NEW.accepted_scope_json IS NOT OLD.accepted_scope_json)
BEGIN
  SELECT RAISE(ABORT, 'request agreement and disclosed expiry are immutable');
END;
