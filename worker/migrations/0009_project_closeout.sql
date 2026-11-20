ALTER TABLE projects ADD COLUMN outcome_submission_json TEXT
  CHECK (outcome_submission_json IS NULL OR json_valid(outcome_submission_json));
ALTER TABLE projects ADD COLUMN closure_json TEXT
  CHECK (closure_json IS NULL OR json_valid(closure_json));
