ALTER TABLE actor_principals RENAME TO actor_principals_legacy;

CREATE TABLE actor_principals (
  provider TEXT NOT NULL CHECK (provider = 'cloudflare_access'),
  issuer TEXT NOT NULL CHECK (length(issuer) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('human', 'service')),
  subject TEXT NOT NULL CHECK (length(subject) > 0),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (provider, issuer, kind, subject)
);

DROP TABLE actor_principals_legacy;

CREATE INDEX idx_actor_principals_actor_id ON actor_principals (actor_id);

CREATE TRIGGER actor_principals_kind_matches_actor
BEFORE INSERT ON actor_principals
WHEN (NEW.actor_id = 'shane' AND NEW.kind <> 'human') OR
     (NEW.actor_id <> 'shane' AND NEW.kind <> 'service')
BEGIN
  SELECT RAISE(ABORT, 'principal kind does not match the Fleet actor');
END;

CREATE TRIGGER actor_principals_kind_matches_actor_update
BEFORE UPDATE OF actor_id, kind ON actor_principals
WHEN (NEW.actor_id = 'shane' AND NEW.kind <> 'human') OR
     (NEW.actor_id <> 'shane' AND NEW.kind <> 'service')
BEGIN
  SELECT RAISE(ABORT, 'principal kind does not match the Fleet actor');
END;

ALTER TABLE activity_events ADD COLUMN principal_provider TEXT;
ALTER TABLE activity_events ADD COLUMN principal_issuer TEXT;
ALTER TABLE activity_events ADD COLUMN principal_kind TEXT;
ALTER TABLE activity_events ADD COLUMN principal_subject TEXT;

CREATE TRIGGER activity_events_require_principal
BEFORE INSERT ON activity_events
WHEN NEW.principal_provider <> 'cloudflare_access' OR
     NEW.principal_provider IS NULL OR
     NEW.principal_issuer IS NULL OR length(NEW.principal_issuer) = 0 OR
     NEW.principal_kind NOT IN ('human', 'service') OR
     NEW.principal_kind IS NULL OR
     NEW.principal_subject IS NULL OR length(NEW.principal_subject) = 0
BEGIN
  SELECT RAISE(ABORT, 'new activity requires production principal provenance');
END;
