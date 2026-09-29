-- Task 7: advisory-only fraud scoring. These records never control Solana.
CREATE TABLE fraud_model_versions (
  version text PRIMARY KEY,
  configuration_json text NOT NULL,
  configuration_digest char(64) NOT NULL CHECK (configuration_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fraud_feature_snapshots (
  id uuid PRIMARY KEY,
  cluster text NOT NULL,
  program_id text NOT NULL,
  subject_address text NOT NULL,
  model_version text NOT NULL REFERENCES fraud_model_versions(version),
  checkpoint_signature text,
  checkpoint_slot bigint NOT NULL,
  features_json text NOT NULL,
  features_digest char(64) NOT NULL CHECK (features_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cluster, program_id, subject_address, model_version, checkpoint_slot, features_digest)
);
CREATE INDEX fraud_feature_snapshots_subject_idx ON fraud_feature_snapshots(cluster, program_id, subject_address, created_at DESC);

CREATE TABLE fraud_evaluations (
  id uuid PRIMARY KEY,
  snapshot_id uuid NOT NULL UNIQUE REFERENCES fraud_feature_snapshots(id),
  cluster text NOT NULL,
  program_id text NOT NULL,
  subject_address text NOT NULL,
  model_version text NOT NULL REFERENCES fraud_model_versions(version),
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_band text NOT NULL CHECK (risk_band IN ('low','medium','high')),
  reasons_json text NOT NULL,
  checkpoint_signature text,
  checkpoint_slot bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fraud_evaluations_subject_idx ON fraud_evaluations(cluster, program_id, subject_address, created_at DESC);

CREATE TABLE fraud_findings (
  id uuid PRIMARY KEY,
  evaluation_id uuid NOT NULL UNIQUE REFERENCES fraud_evaluations(id),
  cluster text NOT NULL,
  program_id text NOT NULL,
  subject_address text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('medium','high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fraud_findings_queue_idx ON fraud_findings(cluster, program_id, status, severity, created_at DESC);

CREATE TABLE fraud_reviews (
  id uuid PRIMARY KEY,
  finding_id uuid NOT NULL REFERENCES fraud_findings(id),
  reviewer text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('needs_investigation','confirmed_fraud','false_positive')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fraud_reviews_finding_idx ON fraud_reviews(finding_id, created_at);
