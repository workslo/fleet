PRAGMA foreign_keys = ON;

CREATE TABLE actors (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE actor_principals (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES actors(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (provider, subject)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  originator_id TEXT NOT NULL REFERENCES actors(id),
  submitter_id TEXT NOT NULL REFERENCES actors(id),
  owner_id TEXT REFERENCES actors(id),
  proposed_owner_id TEXT REFERENCES actors(id),
  state TEXT NOT NULL CHECK (state IN ('Proposed', 'Authorized', 'Active', 'Awaiting Acceptance', 'Closed', 'Paused', 'Canceled')),
  health TEXT NOT NULL CHECK (health IN ('On Track', 'At Risk', 'Blocked', 'Stale')) DEFAULT 'On Track',
  next_action TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_envelope_revisions (
  project_id TEXT NOT NULL REFERENCES projects(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  outcome TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  exclusions_json TEXT NOT NULL,
  delegated_actions_json TEXT NOT NULL,
  gates_json TEXT NOT NULL,
  validation_evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, revision)
);

CREATE TABLE plan_revisions (
  project_id TEXT NOT NULL REFERENCES projects(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, revision)
);

CREATE TABLE evidence_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  request_id TEXT REFERENCES work_requests(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  uri TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE idempotency_records (
  actor_id TEXT NOT NULL REFERENCES actors(id),
  idempotency_key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE TABLE work_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  requester_id TEXT NOT NULL REFERENCES actors(id),
  recipient_id TEXT NOT NULL REFERENCES actors(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('Pending', 'Accepted', 'Fulfilled', 'Declined', 'Withdrawn')) DEFAULT 'Pending',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  accepted_at TEXT,
  fulfilled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pull_candidates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE decision_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  question TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO actors (id, display_name) VALUES
  ('shane', 'Shane Slosar'),
  ('codex', 'Codex'),
  ('claude', 'Claude'),
  ('agentslo', 'AgentSlo'),
  ('juniorslo', 'JuniorSLO');

INSERT INTO actor_principals (provider, subject, actor_id) VALUES
  ('test', 'shane', 'shane'),
  ('test', 'codex', 'codex'),
  ('test', 'claude', 'claude'),
  ('test', 'agentslo', 'agentslo'),
  ('test', 'juniorslo', 'juniorslo');
