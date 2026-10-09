-- Existing Task 9 databases created before the organization-request workflow
-- need the additional intermediary status without losing any provenance.
ALTER TABLE disaster_candidates
  DROP CONSTRAINT IF EXISTS disaster_candidates_status_check;
ALTER TABLE disaster_candidates
  ADD CONSTRAINT disaster_candidates_status_check
  CHECK (status IN ('detected','requested','approved','rejected','draft_prepared','draft_created','submitted','activated'));
