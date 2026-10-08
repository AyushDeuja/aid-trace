CREATE TABLE disaster_ingestion_runs (
  id uuid PRIMARY KEY, provider text NOT NULL CHECK (provider IN ('gdacs','usgs')),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  items_seen integer NOT NULL DEFAULT 0, items_eligible integer NOT NULL DEFAULT 0,
  error_message text
);
CREATE TABLE disaster_source_observations (
  id uuid PRIMARY KEY, provider text NOT NULL CHECK (provider IN ('gdacs','usgs')),
  external_id text NOT NULL, source_url text NOT NULL, retrieved_at timestamptz NOT NULL DEFAULT now(),
  occurred_at timestamptz, payload jsonb NOT NULL, payload_digest char(64) NOT NULL,
  UNIQUE(provider, external_id, payload_digest)
);
CREATE TABLE disaster_candidates (
  id uuid PRIMARY KEY, provider text NOT NULL CHECK (provider IN ('gdacs','usgs')),
  external_id text NOT NULL, status text NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected','approved','rejected','draft_prepared','draft_created','submitted','activated')),
  disaster_type text NOT NULL, title text NOT NULL, location text NOT NULL,
  occurred_at timestamptz, normalized jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_id)
);
CREATE TABLE disaster_candidate_observations (
  candidate_id uuid NOT NULL REFERENCES disaster_candidates(id), observation_id uuid NOT NULL REFERENCES disaster_source_observations(id),
  PRIMARY KEY(candidate_id, observation_id)
);
CREATE TABLE disaster_candidate_history (
  id uuid PRIMARY KEY, candidate_id uuid NOT NULL REFERENCES disaster_candidates(id), action text NOT NULL,
  actor text, note text, proposal jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE disaster_auth_challenges (
  nonce uuid PRIMARY KEY, wallet_address text NOT NULL, action text NOT NULL,
  candidate_id uuid REFERENCES disaster_candidates(id), expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE disaster_campaign_links (
  candidate_id uuid PRIMARY KEY REFERENCES disaster_candidates(id), organization_address text NOT NULL,
  proposal jsonb NOT NULL, metadata_uri text, metadata_digest char(64), campaign_address text,
  create_signature text, submit_signature text, activation_signature text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX disaster_candidates_status_idx ON disaster_candidates(status, occurred_at DESC);
