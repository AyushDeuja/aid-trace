import { database } from "./organizations/db";
import { readMetadataDocument } from "./metadata-documents";

const programId = "8tcYj5qT3GAwhhHmK8UgHtyCZq7MgD8nCYGhC7rwEW5r";
const network = (value: string | null) =>
  value === "localnet" ? "localnet" : "devnet";

async function campaignMetadata(uri: string | null, digest: string) {
  if (!uri) return { metadata: null, metadataState: "unlinked" as const };
  try {
    const document = await readMetadataDocument(uri, "campaign");
    return document.digest === digest
      ? { metadata: document.metadata, metadataState: "verified" as const }
      : { metadata: null, metadataState: "digest_mismatch" as const };
  } catch {
    return { metadata: null, metadataState: "unavailable" as const };
  }
}

/** Indexed discovery/history for the connected donor. Solana remains canonical. */
export async function donorReadModel(cluster: string | null, wallet: string) {
  const selected = network(cluster);
  const donations = await database().query(
    `SELECT d.address,d.campaign,d.payload,d.observed_slot,d.source_signature,d.updated_at,
            c.payload AS campaign_payload,c.metadata_digest,c.metadata_uri,c.organization
       FROM chain_donation_projection d
       LEFT JOIN chain_campaign_projection c
         ON c.cluster=d.cluster AND c.program_id=d.program_id AND c.address=d.campaign
      WHERE d.cluster=$1 AND d.program_id=$2 AND d.payload->>'donor'=$3
      ORDER BY d.updated_at DESC`,
    [selected, programId, wallet]
  );
  const campaignAddresses = [
    ...new Set(donations.rows.map((row) => row.campaign)),
  ];
  const [checkpoint, allocations, disbursements, verifications] =
    await Promise.all([
      database().query(
        "SELECT last_slot,indexed_at FROM chain_index_checkpoints WHERE cluster=$1 AND program_id=$2",
        [selected, programId]
      ),
      campaignAddresses.length
        ? database().query(
            "SELECT campaign,payload FROM chain_allocation_projection WHERE cluster=$1 AND program_id=$2 AND campaign=ANY($3::text[])",
            [selected, programId, campaignAddresses]
          )
        : Promise.resolve({ rows: [] }),
      campaignAddresses.length
        ? database().query(
            "SELECT address,campaign,payload FROM chain_disbursement_projection WHERE cluster=$1 AND program_id=$2 AND campaign=ANY($3::text[])",
            [selected, programId, campaignAddresses]
          )
        : Promise.resolve({ rows: [] }),
      campaignAddresses.length
        ? database().query(
            `SELECT d.campaign,v.payload FROM chain_delivery_verification_projection v JOIN chain_disbursement_projection d ON d.cluster=v.cluster AND d.program_id=v.program_id AND d.address=v.disbursement WHERE v.cluster=$1 AND v.program_id=$2 AND d.campaign=ANY($3::text[])`,
            [selected, programId, campaignAddresses]
          )
        : Promise.resolve({ rows: [] }),
    ]);
  const campaignMetadataByAddress = new Map<
    string,
    Awaited<ReturnType<typeof campaignMetadata>>
  >();
  for (const row of donations.rows) {
    if (row.campaign_payload && !campaignMetadataByAddress.has(row.campaign)) {
      campaignMetadataByAddress.set(
        row.campaign,
        await campaignMetadata(row.metadata_uri, row.metadata_digest)
      );
    }
  }
  const aggregate = (
    rows: Array<{ campaign: string; payload: Record<string, string> }>,
    field: string
  ) =>
    new Map(
      campaignAddresses.map((campaign) => [
        campaign,
        rows
          .filter((row) => row.campaign === campaign)
          .reduce(
            (total, row) => total + BigInt(row.payload[field] || "0"),
            0n
          ),
      ])
    );
  const allocated = aggregate(allocations.rows, "amount");
  const disbursed = aggregate(disbursements.rows, "amount");
  const verified = new Map(campaignAddresses.map((campaign) => [campaign, 0n]));
  const verificationCount = new Map(
    campaignAddresses.map((campaign) => [campaign, 0])
  );
  for (const row of verifications.rows) {
    verificationCount.set(
      row.campaign,
      (verificationCount.get(row.campaign) || 0) + 1
    );
  }
  for (const row of disbursements.rows) {
    if (row.payload.status === "Verified")
      verified.set(
        row.campaign,
        (verified.get(row.campaign) || 0n) + BigInt(row.payload.amount || "0")
      );
  }
  return {
    indexed: true,
    canonical: false,
    cluster: selected,
    checkpoint: checkpoint.rows[0] || null,
    donations: donations.rows.map((row) => {
      const metadata = campaignMetadataByAddress.get(row.campaign) || {
        metadata: null,
        metadataState: "unavailable" as const,
      };
      return {
        address: row.address,
        campaign: row.campaign,
        ...row.payload,
        campaignState: row.campaign_payload?.status || "Unavailable",
        campaignRaised: row.campaign_payload?.amountRaised || "0",
        campaignTarget: row.campaign_payload?.targetAmount || "0",
        organization: row.organization,
        ...metadata,
        campaignProgress: {
          allocated: (allocated.get(row.campaign) || 0n).toString(),
          disbursed: (disbursed.get(row.campaign) || 0n).toString(),
          verified: (verified.get(row.campaign) || 0n).toString(),
          verificationCount: verificationCount.get(row.campaign) || 0,
        },
        sourceSlot: row.observed_slot,
        sourceSignature: row.source_signature,
        indexedAt: row.updated_at,
      };
    }),
  };
}
