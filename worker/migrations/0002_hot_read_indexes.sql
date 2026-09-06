-- Indexes for the columns every hot read filters or joins on.
-- Filed from Claude's PR #2 review (workslo/fleet#5): card() reads
-- activity_events and evidence_links by project_id once per project per
-- portfolio read; myWork reads work_requests by recipient_id and requester_id.
CREATE INDEX idx_activity_events_project_id ON activity_events (project_id);
CREATE INDEX idx_evidence_links_project_id ON evidence_links (project_id);
CREATE INDEX idx_work_requests_recipient_id ON work_requests (recipient_id);
CREATE INDEX idx_work_requests_requester_id ON work_requests (requester_id);
