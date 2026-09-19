-- Additive migration: no table rebuild, no rows touched, no existing row invalidated.
--
-- The Worker refuses a self-addressed Work Request at the gate (worker/src/work.ts).
-- This is the floor under that refusal, so an import, a recovery replay or a direct
-- INSERT cannot manufacture a requester_id = recipient_id row while the gate is bypassed.
--
-- A trigger rather than CHECK (requester_id <> recipient_id): adding a table constraint
-- to work_requests in SQLite means a 12-step table rebuild, which would rewrite live
-- production rows and their foreign keys to enforce an invariant that no existing row
-- is known to violate. The trigger is insert-scoped and reversible.
--
-- The update path is already closed: work_request_agreement_is_immutable (migration
-- 0006) aborts any UPDATE that changes requester_id or recipient_id, so an existing row
-- cannot be edited into a self-addressed one. Both halves are asserted in
-- worker/test/self-addressed-request-migration.spec.ts.
CREATE TRIGGER work_request_recipient_is_not_requester
BEFORE INSERT ON work_requests
WHEN NEW.requester_id = NEW.recipient_id
BEGIN
  SELECT RAISE(ABORT, 'a work request must be addressed to another actor');
END;
