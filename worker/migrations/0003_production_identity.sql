ALTER TABLE actor_principals RENAME TO actor_principals_legacy;

CREATE TABLE actor_principals (
  provider TEXT NOT NULL CHECK (provider IN ('test', 'cloudflare_access')),
  issuer TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('test', 'human', 'service')),
  subject TEXT NOT NULL CHECK (length(subject) > 0),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  CHECK (
    (provider = 'test' AND issuer = '' AND kind = 'test') OR
    (provider = 'cloudflare_access' AND issuer <> '' AND kind IN ('human', 'service'))
  ),
  PRIMARY KEY (provider, issuer, kind, subject)
);

INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id, active)
SELECT provider, '', 'test', subject, actor_id, active
  FROM actor_principals_legacy;

DROP TABLE actor_principals_legacy;

-- Test principals are fixtures, never production seed data.
DELETE FROM actor_principals WHERE provider = 'test';

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
