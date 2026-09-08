PRAGMA defer_foreign_keys = ON;

-- Rename and rebuild the child tables before their parent so the migration is
-- safe even when a D1 migration runner does not preserve deferred-FK state.

DROP TRIGGER IF EXISTS activity_events_principal_is_complete;
DROP TRIGGER IF EXISTS activity_events_append_only_update;
DROP TRIGGER IF EXISTS activity_events_append_only_delete;

ALTER TABLE evidence_links RENAME TO evidence_links_before_standalone;
ALTER TABLE activity_events RENAME TO activity_events_before_standalone;
ALTER TABLE work_requests RENAME TO work_requests_before_standalone;

CREATE TABLE work_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  requester_id TEXT NOT NULL REFERENCES actors(id),
  recipient_id TEXT NOT NULL REFERENCES actors(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  artifact_uri TEXT,
  artifact_summary TEXT,
  accepted_scope_json TEXT CHECK (accepted_scope_json IS NULL OR json_valid(accepted_scope_json)),
  state TEXT NOT NULL CHECK (state IN ('Pending', 'Accepted', 'Fulfilled', 'Returned', 'Declined', 'Withdrawn', 'Expired')) DEFAULT 'Pending',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  accepted_at TEXT,
  fulfilled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((artifact_uri IS NULL) = (artifact_summary IS NULL) AND
         (artifact_uri IS NULL OR
          (length(trim(artifact_uri)) > 0 AND length(trim(artifact_summary)) > 0))),
  CHECK (state NOT IN ('Accepted', 'Fulfilled', 'Returned') OR accepted_scope_json IS NOT NULL)
);

INSERT INTO work_requests (
  id, project_id, requester_id, recipient_id, title, detail,
  accepted_scope_json, state, version, accepted_at, fulfilled_at, created_at, updated_at
)
SELECT id, project_id, requester_id, recipient_id, title, detail,
       CASE WHEN state IN ('Accepted', 'Fulfilled', 'Returned')
            THEN json_object('title', title, 'detail', detail, 'artifact', NULL)
            ELSE NULL END,
       state, version, accepted_at, fulfilled_at, created_at, updated_at
  FROM work_requests_before_standalone;

CREATE TABLE evidence_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT REFERENCES projects(id),
  request_id TEXT REFERENCES work_requests(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  uri TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (project_id IS NOT NULL OR request_id IS NOT NULL)
);

INSERT INTO evidence_links (id, project_id, request_id, actor_id, uri, summary, created_at)
SELECT id, project_id, request_id, actor_id, uri, summary, created_at
  FROM evidence_links_before_standalone;

CREATE TABLE activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT REFERENCES projects(id),
  request_id TEXT REFERENCES work_requests(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  principal_provider TEXT,
  principal_issuer TEXT,
  principal_kind TEXT,
  principal_subject TEXT,
  principal_legacy INTEGER NOT NULL DEFAULT 0 CHECK (principal_legacy IN (0, 1)),
  CHECK (project_id IS NOT NULL OR request_id IS NOT NULL)
);

INSERT INTO activity_events (
  id, project_id, request_id, actor_id, type, payload_json, created_at,
  principal_provider, principal_issuer, principal_kind, principal_subject, principal_legacy
)
SELECT id, project_id,
       CASE WHEN type LIKE 'work_request.%' THEN json_extract(payload_json, '$.request_id') ELSE NULL END,
       actor_id, type, payload_json, created_at,
       principal_provider, principal_issuer, principal_kind, principal_subject, principal_legacy
  FROM activity_events_before_standalone;

DROP TABLE evidence_links_before_standalone;
DROP TABLE activity_events_before_standalone;
DROP TABLE work_requests_before_standalone;

CREATE INDEX idx_activity_events_project_id ON activity_events (project_id);
CREATE INDEX idx_activity_events_request_id ON activity_events (request_id);
CREATE INDEX idx_evidence_links_project_id ON evidence_links (project_id);
CREATE INDEX idx_evidence_links_request_id ON evidence_links (request_id);
CREATE INDEX idx_work_requests_project_id ON work_requests (project_id);
CREATE INDEX idx_work_requests_recipient_id ON work_requests (recipient_id);
CREATE INDEX idx_work_requests_requester_id ON work_requests (requester_id);

CREATE TRIGGER evidence_links_scope_matches_request
BEFORE INSERT ON evidence_links
WHEN NEW.request_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM work_requests
   WHERE id = NEW.request_id AND project_id IS NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'request evidence project association must match its request');
END;

CREATE TRIGGER evidence_links_scope_matches_request_update
BEFORE UPDATE OF project_id, request_id ON evidence_links
WHEN NEW.request_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM work_requests
   WHERE id = NEW.request_id AND project_id IS NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'request evidence project association must match its request');
END;

CREATE TRIGGER activity_events_principal_is_complete
BEFORE INSERT ON activity_events
WHEN CASE
  WHEN NEW.principal_legacy = 1 AND
       NEW.principal_provider IS NULL AND
       NEW.principal_issuer IS NULL AND
       NEW.principal_kind IS NULL AND
       NEW.principal_subject IS NULL THEN 0
  WHEN NEW.principal_legacy = 0 AND
       NEW.principal_provider = 'cloudflare_access' AND
       NEW.principal_issuer IS NOT NULL AND length(NEW.principal_issuer) > 0 AND
       NEW.principal_kind IN ('human', 'service') AND
       NEW.principal_subject IS NOT NULL AND length(NEW.principal_subject) > 0 THEN 0
  ELSE 1
END = 1
BEGIN
  SELECT RAISE(ABORT, 'activity principal provenance must be complete or legacy-null');
END;

CREATE TRIGGER activity_events_append_only_update
BEFORE UPDATE ON activity_events
BEGIN
  SELECT RAISE(ABORT, 'activity events are append only');
END;

CREATE TRIGGER activity_events_append_only_delete
BEFORE DELETE ON activity_events
BEGIN
  SELECT RAISE(ABORT, 'activity events are append only');
END;
