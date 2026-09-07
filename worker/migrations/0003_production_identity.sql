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

CREATE TRIGGER activity_events_principal_is_complete
BEFORE INSERT ON activity_events
WHEN CASE
  WHEN NEW.principal_provider IS NULL AND
       NEW.principal_issuer IS NULL AND
       NEW.principal_kind IS NULL AND
       NEW.principal_subject IS NULL THEN 0
  WHEN NEW.principal_provider = 'cloudflare_access' AND
       NEW.principal_issuer IS NOT NULL AND length(NEW.principal_issuer) > 0 AND
       NEW.principal_kind IN ('human', 'service') AND
       NEW.principal_subject IS NOT NULL AND length(NEW.principal_subject) > 0 THEN 0
  ELSE 1
END = 1
BEGIN
  SELECT RAISE(ABORT, 'activity principal provenance must be complete or legacy-null');
END;
