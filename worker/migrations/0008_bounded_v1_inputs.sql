-- workslo/fleet#9. The floor under the Worker's bounded-input gate (worker/src/limits.ts).
--
-- Additive and insert-scoped: no table rebuild, no rows touched, no existing row
-- invalidated. Triggers rather than CHECK constraints for the same reason migration 0007
-- gave — adding a table constraint in SQLite means a 12-step rebuild that would rewrite
-- live production rows to enforce an invariant no existing row is known to violate.
--
-- Because it is insert-scoped, a row written before this migration is preserved as it
-- stands. This floor exists so an import, a recovery replay or a direct INSERT cannot
-- store a blank or unbounded field while the Worker gate is bypassed; it is not a
-- retroactive cleanup, and it is not the primary check. The HTTP boundary answers a
-- caller with a field-specific 400; this answers with an abort.
--
-- Sizes are UTF-8 bytes, measured with length(CAST(value AS BLOB)) — plain length() in
-- SQLite counts characters — and they are the same numbers as V1_LIMITS in
-- worker/src/limits.ts. worker/test/bounded-inputs.spec.ts asserts the two agree.
--
-- "Blank" means the same thing here as it does at the Worker boundary. SQLite's
-- one-argument trim() strips ASCII space and nothing else — not a tab, a newline, a
-- non-breaking space or an ideographic space — while the Worker's String.trim() strips
-- all of them. A tab-only title would therefore have passed this floor and been refused
-- by the HTTP gate: two layers disagreeing about the same word. Every trim() below names
-- an explicit charset instead, and that charset is exactly ECMAScript's WhiteSpace plus
-- LineTerminator set (U+0009–U+000D, U+0020, U+00A0, U+1680, U+2000–U+200A, U+2028,
-- U+2029, U+202F, U+205F, U+3000, U+FEFF), so the two layers agree on which strings are
-- blank. Verified against D1's own build, not only a local SQLite. Found by @agentslo
-- reviewing PR #52; the controls are in worker/test/bounded-inputs-blankness.spec.ts.

-- projects.slug carries the canonical V1 syntax: lowercase alphanumeric words joined by
-- single hyphens, no leading, trailing or doubled hyphen. The four GLOB/instr clauses
-- below are the SQL spelling of /^[a-z0-9]+(?:-[a-z0-9]+)*$/.
CREATE TRIGGER project_fields_are_bounded
BEFORE INSERT ON projects
WHEN NEW.slug GLOB '*[^a-z0-9-]*'
  OR NEW.slug GLOB '-*' OR NEW.slug GLOB '*-'
  OR instr(NEW.slug, '--') > 0
  OR length(NEW.slug) = 0
  OR length(CAST(NEW.slug AS BLOB)) > 64
  OR length(trim(NEW.title, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.title AS BLOB)) > 200
BEGIN
  SELECT RAISE(ABORT, 'project slug must be canonical and title must be non-blank and bounded');
END;

CREATE TRIGGER work_request_fields_are_bounded
BEFORE INSERT ON work_requests
WHEN length(trim(NEW.title, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.title AS BLOB)) > 200
  OR length(trim(NEW.detail, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.detail AS BLOB)) > 4000
  OR (NEW.artifact_uri IS NOT NULL AND length(CAST(NEW.artifact_uri AS BLOB)) > 2000)
  OR (NEW.artifact_summary IS NOT NULL AND length(CAST(NEW.artifact_summary AS BLOB)) > 500)
BEGIN
  SELECT RAISE(ABORT, 'work request title, detail and artifact link must be non-blank and bounded');
END;

CREATE TRIGGER pull_candidate_fields_are_bounded
BEFORE INSERT ON pull_candidates
WHEN length(trim(NEW.title, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.title AS BLOB)) > 200
  OR length(trim(NEW.detail, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.detail AS BLOB)) > 4000
BEGIN
  SELECT RAISE(ABORT, 'pull candidate title and detail must be non-blank and bounded');
END;

-- resolution_condition is nullable on the table: migration 0005 preserved pre-lifecycle
-- rows that have none. New writes supply one, so the bound applies only when it is present.
CREATE TRIGGER decision_request_fields_are_bounded
BEFORE INSERT ON decision_requests
WHEN length(trim(NEW.question, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.question AS BLOB)) > 4000
  OR (NEW.resolution_condition IS NOT NULL AND
      (length(trim(NEW.resolution_condition, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0 OR length(CAST(NEW.resolution_condition AS BLOB)) > 4000))
BEGIN
  SELECT RAISE(ABORT, 'Needs Shane question and resolution condition must be non-blank and bounded');
END;

CREATE TRIGGER evidence_link_fields_are_bounded
BEFORE INSERT ON evidence_links
WHEN length(trim(NEW.uri, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.uri AS BLOB)) > 2000
  OR length(trim(NEW.summary, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.summary AS BLOB)) > 500
BEGIN
  SELECT RAISE(ABORT, 'evidence uri and summary must be non-blank and bounded');
END;

-- idempotency_key is half of a primary key that any authenticated seat can grow without
-- limit; this is the storage bound the Worker's presence check never had.
CREATE TRIGGER idempotency_key_is_bounded
BEFORE INSERT ON idempotency_records
WHEN length(trim(NEW.idempotency_key, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) = 0
  OR length(CAST(NEW.idempotency_key AS BLOB)) > 255
BEGIN
  SELECT RAISE(ABORT, 'idempotency key must be non-blank and at most 255 bytes');
END;
