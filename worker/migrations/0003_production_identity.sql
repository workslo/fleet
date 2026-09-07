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

CREATE TRIGGER actor_principals_shane_requires_human
BEFORE INSERT ON actor_principals
WHEN NEW.actor_id = 'shane' AND NEW.provider = 'cloudflare_access' AND NEW.kind <> 'human'
BEGIN
  SELECT RAISE(ABORT, 'Shane production principals must be human');
END;

CREATE TRIGGER actor_principals_shane_requires_human_update
BEFORE UPDATE OF actor_id, kind ON actor_principals
WHEN NEW.actor_id = 'shane' AND NEW.provider = 'cloudflare_access' AND NEW.kind <> 'human'
BEGIN
  SELECT RAISE(ABORT, 'Shane production principals must be human');
END;

ALTER TABLE activity_events ADD COLUMN principal_provider TEXT;
ALTER TABLE activity_events ADD COLUMN principal_issuer TEXT;
ALTER TABLE activity_events ADD COLUMN principal_kind TEXT;
ALTER TABLE activity_events ADD COLUMN principal_subject TEXT;
