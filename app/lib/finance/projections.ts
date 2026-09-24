import { database } from "../organizations/db";
import { parseMetadataUri, type MetadataKind } from "../metadata-documents";

export async function ensureFinanceSchema() {
  await database().query(`
    CREATE TABLE IF NOT EXISTS allocation_projection (
      address text PRIMARY KEY, campaign text NOT NULL, allocation_id text NOT NULL,
      recipient text NOT NULL, amount text NOT NULL, spent text NOT NULL, purpose_digest char(64) NOT NULL,
      status text NOT NULL, created_at_chain bigint NOT NULL, observed_slot bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS disbursement_projection (
      address text PRIMARY KEY, allocation text NOT NULL, campaign text NOT NULL, disbursement_id text NOT NULL,
      recipient text NOT NULL, amount text NOT NULL, description_digest char(64) NOT NULL, authority text NOT NULL,
      status text NOT NULL, created_at_chain bigint NOT NULL, observed_slot bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS finance_events (
      signature text NOT NULL, log_index integer NOT NULL, event_name text NOT NULL,
      payload_base64 text NOT NULL, slot bigint NOT NULL, PRIMARY KEY(signature, log_index));
    CREATE TABLE IF NOT EXISTS finance_metadata_links (
      account_address text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('allocation','disbursement')),
      digest char(64) NOT NULL, uri text NOT NULL, signature text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  `);
}

export async function saveFinanceMetadataLink(input: {
  address: string;
  kind: MetadataKind;
  digest: string;
  uri: string;
  signature: string;
}) {
  if (input.kind !== "allocation" && input.kind !== "disbursement")
    throw new Error("Invalid finance metadata type");
  parseMetadataUri(input.uri, input.kind);
  if (!/^[a-f0-9]{64}$/i.test(input.digest) || !input.signature)
    throw new Error("Invalid finance metadata link");
  await ensureFinanceSchema();
  await database().query(
    `INSERT INTO finance_metadata_links(account_address,kind,digest,uri,signature)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_address) DO NOTHING`,
    [input.address, input.kind, input.digest, input.uri, input.signature]
  );
}

export async function financeHistory(campaign: string) {
  await ensureFinanceSchema();
  const [allocations, disbursements] = await Promise.all([
    database().query(
      `SELECT a.*, l.uri, l.signature FROM allocation_projection a LEFT JOIN finance_metadata_links l ON l.account_address=a.address AND l.digest=a.purpose_digest WHERE a.campaign=$1 ORDER BY a.allocation_id`,
      [campaign]
    ),
    database().query(
      `SELECT d.*, l.uri, l.signature FROM disbursement_projection d LEFT JOIN finance_metadata_links l ON l.account_address=d.address AND l.digest=d.description_digest WHERE d.campaign=$1 ORDER BY d.disbursement_id`,
      [campaign]
    ),
  ]);
  return { allocations: allocations.rows, disbursements: disbursements.rows };
}
