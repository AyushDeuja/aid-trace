import { database } from "../organizations/db";
import { parseMetadataUri, type MetadataKind } from "../metadata-documents";

const programId = "8tcYj5qT3GAwhhHmK8UgHtyCZq7MgD8nCYGhC7rwEW5r";
const cluster =
  process.env.AIDTRACE_CLUSTER ||
  ((process.env.SOLANA_RPC_URL || "").includes("localhost") ||
  (process.env.SOLANA_RPC_URL || "").includes("127.0.0.1")
    ? "localnet"
    : "devnet");

export async function ensureFinanceSchema() {
  await database().query("SELECT 1 FROM schema_migrations LIMIT 1");
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
  await database().query(
    `INSERT INTO chain_metadata_links(cluster,program_id,account_address,kind,digest,uri,signature)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(cluster,program_id,account_address,kind) DO NOTHING`,
    [
      cluster,
      programId,
      input.address,
      input.kind,
      input.digest,
      input.uri,
      input.signature,
    ]
  );
}

export async function financeHistory(campaign: string) {
  await ensureFinanceSchema();
  const [allocations, disbursements, evidence, verifications, verifiers] =
    await Promise.all([
      database().query(
        `SELECT a.*, l.uri, l.signature FROM allocation_projection a LEFT JOIN finance_metadata_links l ON l.account_address=a.address AND l.digest=a.purpose_digest WHERE a.campaign=$1 ORDER BY a.allocation_id`,
        [campaign]
      ),
      database().query(
        `SELECT d.*, l.uri, l.signature FROM disbursement_projection d LEFT JOIN finance_metadata_links l ON l.account_address=d.address AND l.digest=d.description_digest WHERE d.campaign=$1 ORDER BY d.disbursement_id`,
        [campaign]
      ),
      database().query(
        `SELECT DISTINCT ON (l.account_address) l.account_address, ('aidtrace://evidence/' || m.id::text) AS uri, m.id, m.digest, m.filename, m.mime_type, m.byte_size, l.signature FROM evidence_links l JOIN evidence_manifests m ON m.id=l.manifest_id JOIN disbursement_projection d ON d.address=l.account_address WHERE d.campaign=$1 ORDER BY l.account_address, m.created_at DESC`,
        [campaign]
      ),
      database().query(
        `SELECT v.* FROM delivery_verification_projection v JOIN disbursement_projection d ON d.address=v.disbursement WHERE d.campaign=$1 ORDER BY v.verification_id`,
        [campaign]
      ),
      database().query(
        `SELECT DISTINCT p.* FROM verifier_projection p JOIN allocation_projection a ON a.campaign=$1`,
        [campaign]
      ),
    ]);
  return {
    allocations: allocations.rows,
    disbursements: disbursements.rows,
    evidence: evidence.rows,
    verifications: verifications.rows,
    verifiers: verifiers.rows,
  };
}
