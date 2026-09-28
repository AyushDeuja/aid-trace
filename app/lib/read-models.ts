import { database } from "./organizations/db";
import { readMetadataDocument, type MetadataKind } from "./metadata-documents";

const programId = "FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M";
const cluster = (value: string | null) => value === "localnet" ? "localnet" : "devnet";
async function verifiedMetadata(uri: string | null, kind: MetadataKind, digest: string) {
  if (!uri) return { metadata: null, metadataStatus: "unlinked" as const };
  try {
    const document = await readMetadataDocument(uri, kind);
    return document.digest === digest ? { metadata: document.metadata, metadataStatus: "verified" as const } : { metadata: null, metadataStatus: "digest_mismatch" as const };
  } catch { return { metadata: null, metadataStatus: "unavailable" as const }; }
}
async function organizationMetadataUri(address: string, uri: string | null) {
  if (uri) return uri;
  // Organization references intentionally live in the app projection: the
  // on-chain Organization account stores only its digest.
  const result = await database().query(
    "SELECT metadata_uri FROM organization_projection WHERE address=$1",
    [address]
  );
  return result.rows[0]?.metadata_uri || null;
}
async function financeMetadataUri(network: string, address: string, kind: "allocation" | "disbursement", digest: string, uri: string | null) {
  if (uri) return uri;
  const current = await database().query(
    "SELECT uri FROM chain_metadata_links WHERE cluster=$1 AND program_id=$2 AND account_address=$3 AND kind=$4 AND digest=$5",
    [network, programId, address, kind, digest]
  );
  if (current.rows[0]?.uri) return current.rows[0].uri;
  // Compatibility with Task 4/5 records. New writes are namespaced above.
  const legacy = await database().query(
    "SELECT uri FROM finance_metadata_links WHERE account_address=$1 AND kind=$2 AND digest=$3",
    [address, kind, digest]
  );
  return legacy.rows[0]?.uri || null;
}
async function freshness(network: string) {
  const result = await database().query("SELECT last_slot,indexed_at FROM chain_index_checkpoints WHERE cluster=$1 AND program_id=$2", [network, programId]);
  return { indexed: true, canonical: false, checkpoint: result.rows[0] || null };
}
export async function organizationsReadModel(requestedCluster: string | null) {
  const network = cluster(requestedCluster); const rows = await database().query("SELECT * FROM chain_organization_projection WHERE cluster=$1 AND program_id=$2 ORDER BY updated_at DESC", [network, programId]);
  return { ...(await freshness(network)), organizations: await Promise.all(rows.rows.map(async (row) => ({ address: row.address, ...row.payload, metadataDigest: row.metadata_digest, ...(await verifiedMetadata(await organizationMetadataUri(row.address, row.metadata_uri), "organization", row.metadata_digest)), sourceSlot: row.observed_slot, sourceSignature: row.source_signature }))) };
}
export async function campaignsReadModel(requestedCluster: string | null, organization?: string | null) {
  const network=cluster(requestedCluster); const values=[network,programId]; let where="cluster=$1 AND program_id=$2"; if(organization){values.push(organization);where+=" AND organization=$3";}
  const rows=await database().query(`SELECT * FROM chain_campaign_projection WHERE ${where} ORDER BY updated_at DESC`,values);
  return { ...(await freshness(network)), campaigns: await Promise.all(rows.rows.map(async(row)=>({address:row.address,organization:row.organization,...row.payload,metadataDigest:row.metadata_digest,...(await verifiedMetadata(row.metadata_uri,"campaign",row.metadata_digest)),sourceSlot:row.observed_slot,sourceSignature:row.source_signature}))) };
}
export async function campaignDetailReadModel(requestedCluster: string | null, campaign: string) {
  const network=cluster(requestedCluster); const campaignRow=(await database().query("SELECT * FROM chain_campaign_projection WHERE cluster=$1 AND program_id=$2 AND address=$3",[network,programId,campaign])).rows[0]; if(!campaignRow) return null;
  const [donations,allocations,disbursements,audit]=await Promise.all([
    database().query("SELECT * FROM chain_donation_projection WHERE cluster=$1 AND program_id=$2 AND campaign=$3 ORDER BY updated_at",[network,programId,campaign]),
    database().query("SELECT * FROM chain_allocation_projection WHERE cluster=$1 AND program_id=$2 AND campaign=$3 ORDER BY updated_at",[network,programId,campaign]),
    database().query("SELECT * FROM chain_disbursement_projection WHERE cluster=$1 AND program_id=$2 AND campaign=$3 ORDER BY updated_at",[network,programId,campaign]),
    database().query("SELECT * FROM chain_events WHERE cluster=$1 AND program_id=$2 ORDER BY slot DESC LIMIT 200",[network,programId]),
  ]);
  return { ...(await freshness(network)), campaign:{address:campaignRow.address,organization:campaignRow.organization,...campaignRow.payload,metadataDigest:campaignRow.metadata_digest,...(await verifiedMetadata(campaignRow.metadata_uri,"campaign",campaignRow.metadata_digest))}, donations:donations.rows.map((row)=>({address:row.address,...row.payload,sourceSlot:row.observed_slot,sourceSignature:row.source_signature})), allocations:await Promise.all(allocations.rows.map(async(row)=>({address:row.address,campaign:row.campaign,...row.payload,purposeDigest:row.purpose_digest,...(await verifiedMetadata(await financeMetadataUri(network,row.address,"allocation",row.purpose_digest,row.metadata_uri),"allocation",row.purpose_digest)),sourceSlot:row.observed_slot,sourceSignature:row.source_signature}))), disbursements:await Promise.all(disbursements.rows.map(async(row)=>({address:row.address,campaign:row.campaign,...row.payload,descriptionDigest:row.description_digest,...(await verifiedMetadata(await financeMetadataUri(network,row.address,"disbursement",row.description_digest,row.metadata_uri),"disbursement",row.description_digest)),sourceSlot:row.observed_slot,sourceSignature:row.source_signature}))), audit:audit.rows };
}
