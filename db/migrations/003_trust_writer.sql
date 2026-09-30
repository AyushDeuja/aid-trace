-- Task 8: durable, idempotent hand-off from advisory fraud evaluation to the
-- non-custodial MagicBlock trust writer.  A row is created in the same
-- transaction as its evaluation; the writer may retry it but never creates a
-- second job for the same evaluation.
CREATE TABLE trust_write_jobs (
  id uuid PRIMARY KEY,
  evaluation_id uuid NOT NULL UNIQUE REFERENCES fraud_evaluations(id),
  cluster text NOT NULL,
  program_id text NOT NULL,
  subject_address text NOT NULL,
  expected_sequence bigint NOT NULL CHECK (expected_sequence >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','committed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_class text,
  error_message text,
  er_signature text,
  base_commit_signature text,
  action_outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);
CREATE INDEX trust_write_jobs_ready_idx
  ON trust_write_jobs(status, next_attempt_at, created_at);
CREATE INDEX trust_write_jobs_subject_idx
  ON trust_write_jobs(cluster, program_id, subject_address, created_at DESC);
