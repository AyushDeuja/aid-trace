-- Task 8 lifecycle observability.  Existing jobs remain readable while a
-- worker can distinguish a durable score commit from an action still awaiting
-- reconciliation.
ALTER TABLE trust_write_jobs
  ALTER COLUMN expected_sequence DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS er_endpoint text,
  ADD COLUMN IF NOT EXISTS session_public_key text,
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS action_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal boolean NOT NULL DEFAULT false;

ALTER TABLE trust_write_jobs DROP CONSTRAINT IF EXISTS trust_write_jobs_status_check;
ALTER TABLE trust_write_jobs
  ADD CONSTRAINT trust_write_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'committed', 'action_pending', 'failed'));

CREATE INDEX IF NOT EXISTS trust_write_jobs_subject_ready_idx
  ON trust_write_jobs(cluster, program_id, subject_address, status, next_attempt_at);

-- Historic evaluations predate the transactional outbox.  This is safe to
-- execute repeatedly because evaluation_id remains unique.
INSERT INTO trust_write_jobs (
  id, evaluation_id, cluster, program_id, subject_address, expected_sequence
)
SELECT gen_random_uuid(), e.id, e.cluster, e.program_id, e.subject_address, NULL
FROM fraud_evaluations e
WHERE NOT EXISTS (
  SELECT 1 FROM trust_write_jobs j WHERE j.evaluation_id = e.id
);
