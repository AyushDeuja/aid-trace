CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metadata_documents (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('organization','campaign','allocation','disbursement')),
  canonical_json text NOT NULL,
  digest char(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Databases created before allocation/disbursement metadata existed may carry
-- the earlier two-value CHECK constraint.  The migration, not request paths,
-- owns this compatible upgrade.
ALTER TABLE metadata_documents DROP CONSTRAINT IF EXISTS metadata_documents_kind_check;
ALTER TABLE metadata_documents ADD CONSTRAINT metadata_documents_kind_check
  CHECK (kind IN ('organization','campaign','allocation','disbursement'));

CREATE TABLE IF NOT EXISTS evidence_manifests (
  id uuid PRIMARY KEY, digest char(64) NOT NULL, filename text NOT NULL,
  mime_type text NOT NULL, byte_size integer NOT NULL CHECK (byte_size > 0),
  uploader text NOT NULL, storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evidence_links (
  manifest_id uuid NOT NULL REFERENCES evidence_manifests(id), account_address text NOT NULL,
  digest char(64) NOT NULL, signature text NOT NULL,
  PRIMARY KEY(manifest_id, account_address)
);

-- Compatibility projections remain available to the existing dashboard while it migrates to /api/read.
CREATE TABLE IF NOT EXISTS organization_projection (
  address text PRIMARY KEY, founder text NOT NULL, authority text NOT NULL, pending_authority text,
  metadata_digest char(64) NOT NULL, metadata_uri text, status text NOT NULL, verified boolean NOT NULL,
  verified_delivery_count text NOT NULL, next_campaign_id text NOT NULL, observed_slot bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organization_events (
  signature text NOT NULL, log_index integer NOT NULL, event_name text NOT NULL, payload_base64 text NOT NULL,
  slot bigint NOT NULL, PRIMARY KEY(signature,log_index)
);
CREATE TABLE IF NOT EXISTS allocation_projection (
  address text PRIMARY KEY,campaign text NOT NULL,allocation_id text NOT NULL,recipient text NOT NULL,
  amount text NOT NULL,spent text NOT NULL,purpose_digest char(64) NOT NULL,status text NOT NULL,
  created_at_chain bigint NOT NULL,observed_slot bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS disbursement_projection (
  address text PRIMARY KEY,allocation text NOT NULL,campaign text NOT NULL,disbursement_id text NOT NULL,
  recipient text NOT NULL,amount text NOT NULL,description_digest char(64) NOT NULL,authority text NOT NULL,
  status text NOT NULL,created_at_chain bigint NOT NULL,observed_slot bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_events (signature text NOT NULL,log_index integer NOT NULL,event_name text NOT NULL,payload_base64 text NOT NULL,slot bigint NOT NULL,PRIMARY KEY(signature,log_index));
CREATE TABLE IF NOT EXISTS finance_metadata_links (account_address text PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('allocation','disbursement')),digest char(64) NOT NULL,uri text NOT NULL,signature text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS verifier_projection (address text PRIMARY KEY,organization text NOT NULL,verifier text NOT NULL,active boolean NOT NULL,observed_slot bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS delivery_verification_projection (address text PRIMARY KEY,disbursement text NOT NULL,verification_id text NOT NULL,verifier text NOT NULL,evidence_digest char(64) NOT NULL,status text NOT NULL,verified_at_chain bigint,observed_slot bigint NOT NULL DEFAULT 0,signature text,updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS chain_index_checkpoints (
  cluster text NOT NULL, program_id text NOT NULL, last_signature text,
  last_slot bigint NOT NULL DEFAULT 0, indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster, program_id)
);
CREATE TABLE IF NOT EXISTS chain_events (
  cluster text NOT NULL, program_id text NOT NULL, signature text NOT NULL,
  event_index integer NOT NULL, event_name text NOT NULL, payload_base64 text NOT NULL,
  slot bigint NOT NULL, block_time bigint, indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster, program_id, signature, event_index)
);
CREATE INDEX IF NOT EXISTS chain_events_signature_idx ON chain_events(cluster, program_id, signature);

CREATE TABLE IF NOT EXISTS chain_metadata_links (
  cluster text NOT NULL, program_id text NOT NULL, account_address text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('organization','campaign','allocation','disbursement')),
  digest char(64) NOT NULL, uri text NOT NULL, signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster, program_id, account_address, kind)
);

CREATE TABLE IF NOT EXISTS chain_organization_projection (
  cluster text NOT NULL, program_id text NOT NULL, address text NOT NULL,
  metadata_digest char(64) NOT NULL, metadata_uri text, payload jsonb NOT NULL,
  observed_slot bigint NOT NULL, source_signature text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster, program_id, address)
);
CREATE TABLE IF NOT EXISTS chain_campaign_projection (
  cluster text NOT NULL, program_id text NOT NULL, address text NOT NULL,
  organization text NOT NULL, metadata_digest char(64) NOT NULL, metadata_uri text,
  payload jsonb NOT NULL, observed_slot bigint NOT NULL, source_signature text,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cluster, program_id, address)
);
CREATE INDEX IF NOT EXISTS chain_campaign_organization_idx ON chain_campaign_projection(cluster, program_id, organization);
CREATE TABLE IF NOT EXISTS chain_donation_projection (
  cluster text NOT NULL, program_id text NOT NULL, address text NOT NULL, campaign text NOT NULL,
  payload jsonb NOT NULL, observed_slot bigint NOT NULL, source_signature text,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cluster, program_id, address)
);
CREATE INDEX IF NOT EXISTS chain_donation_campaign_idx ON chain_donation_projection(cluster, program_id, campaign);
CREATE TABLE IF NOT EXISTS chain_allocation_projection (
  cluster text NOT NULL, program_id text NOT NULL, address text NOT NULL, campaign text NOT NULL,
  purpose_digest char(64) NOT NULL, metadata_uri text, payload jsonb NOT NULL,
  observed_slot bigint NOT NULL, source_signature text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster, program_id, address)
);
CREATE TABLE IF NOT EXISTS chain_disbursement_projection (
  cluster text NOT NULL, program_id text NOT NULL, address text NOT NULL, campaign text NOT NULL,
  description_digest char(64) NOT NULL, metadata_uri text, payload jsonb NOT NULL,
  observed_slot bigint NOT NULL, source_signature text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster, program_id, address)
);
CREATE TABLE IF NOT EXISTS chain_verifier_projection (
  cluster text NOT NULL, program_id text NOT NULL, address text NOT NULL, organization text NOT NULL,
  verifier text NOT NULL, active boolean NOT NULL, payload jsonb NOT NULL,
  observed_slot bigint NOT NULL, source_signature text, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cluster, program_id, address)
);
CREATE TABLE IF NOT EXISTS chain_delivery_verification_projection (
  cluster text NOT NULL, program_id text NOT NULL, address text NOT NULL, disbursement text NOT NULL,
  evidence_digest char(64) NOT NULL, payload jsonb NOT NULL, observed_slot bigint NOT NULL,
  source_signature text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cluster, program_id, address)
);

-- Preserve legacy data as explicitly non-canonical, unscoped records until a chain reindex replaces it.
DO $$ BEGIN
  IF to_regclass('public.organization_projection') IS NOT NULL THEN
    INSERT INTO chain_organization_projection(cluster,program_id,address,metadata_digest,metadata_uri,payload,observed_slot)
    SELECT 'legacy','FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M',address,metadata_digest,metadata_uri,
     jsonb_build_object('founder',founder,'authority',authority,'status',status,'verified',verified),observed_slot
    FROM organization_projection ON CONFLICT DO NOTHING;
  END IF;
END $$;

