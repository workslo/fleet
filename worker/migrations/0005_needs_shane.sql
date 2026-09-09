-- Preserve the original read-only records without inventing historical actors
-- or decision outcomes. New writes supply a specific resolution condition.
ALTER TABLE decision_requests RENAME TO decision_requests_before_lifecycle;

CREATE TABLE decision_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  work_request_id TEXT REFERENCES work_requests(id),
  requester_id TEXT REFERENCES actors(id),
  kind TEXT NOT NULL DEFAULT 'decision' CHECK (kind IN ('decision', 'action', 'decision_and_action')),
  question TEXT NOT NULL,
  resolution_condition TEXT,
  state TEXT NOT NULL DEFAULT 'Pending',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  decision_json TEXT CHECK (decision_json IS NULL OR json_valid(decision_json)),
  action_json TEXT CHECK (action_json IS NULL OR json_valid(action_json)),
  delegation_json TEXT CHECK (delegation_json IS NULL OR json_valid(delegation_json)),
  delegate_id TEXT REFERENCES actors(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (project_id IS NOT NULL OR work_request_id IS NOT NULL)
);

INSERT INTO decision_requests (id, project_id, question, state, created_at, updated_at)
SELECT id, project_id, question, state, created_at, created_at
FROM decision_requests_before_lifecycle;

DROP TABLE decision_requests_before_lifecycle;

CREATE INDEX idx_decision_requests_state ON decision_requests (state, created_at, id);
CREATE INDEX idx_decision_requests_project ON decision_requests (project_id);
CREATE INDEX idx_decision_requests_work_request ON decision_requests (work_request_id);
CREATE INDEX idx_decision_requests_requester ON decision_requests (requester_id);

CREATE TRIGGER decision_requests_source_matches
BEFORE INSERT ON decision_requests
WHEN NEW.work_request_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM work_requests WHERE id = NEW.work_request_id AND project_id IS NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'Needs Shane project association must match its source request');
END;

CREATE TRIGGER decision_requests_source_is_fixed
BEFORE UPDATE OF project_id, work_request_id, requester_id, kind, question, resolution_condition ON decision_requests
BEGIN
  SELECT RAISE(ABORT, 'Needs Shane source and requested scope are immutable');
END;
