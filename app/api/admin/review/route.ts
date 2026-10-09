import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/organizations/db";
import { fetchOrganization } from "../../../lib/organizations/chain";
import { fetchCampaign } from "../../../lib/campaigns/chain";
import { fetchCanonicalFraudFlag } from "../../../lib/trust-chain";
import { readMetadataDocument } from "../../../lib/metadata-documents";
import { address } from "@solana/kit";

const programId = "8tcYj5qT3GAwhhHmK8UgHtyCZq7MgD8nCYGhC7rwEW5r";
const json = (value: unknown) =>
  JSON.stringify(value, (_key, current) =>
    typeof current === "bigint" ? current.toString() : current
  );
const metadata = async (uri: string | null, kind: "organization" | "campaign", digest: string) => {
  if (!uri) return { state: "unlinked" as const, value: null };
  try { const doc = await readMetadataDocument(uri, kind); return doc.digest === digest ? { state: "verified" as const, value: doc.metadata } : { state: "digest_mismatch" as const, value: null }; }
  catch { return { state: "unavailable" as const, value: null }; }
};
export async function GET(request: NextRequest) {
  try {
    const cluster = request.nextUrl.searchParams.get("cluster") === "localnet" ? "localnet" : "devnet";
    const db = database();
    const [organizations, campaigns] = await Promise.all([
      db.query("SELECT address,metadata_uri,source_signature FROM chain_organization_projection WHERE cluster=$1 AND program_id=$2 ORDER BY updated_at DESC LIMIT 100", [cluster, programId]),
      db.query("SELECT address,metadata_uri,source_signature FROM chain_campaign_projection WHERE cluster=$1 AND program_id=$2 ORDER BY updated_at DESC LIMIT 100", [cluster, programId]),
    ]);
    const orgs = await Promise.all(organizations.rows.map(async row => { try { const value = await fetchOrganization(cluster, address(row.address)); if (!value) return null; return { ...value, metadataDigest: value.metadataDigest, metadata: await metadata(row.metadata_uri, "organization", value.metadataDigest), sourceSignature: row.source_signature }; } catch (error) { return { address: row.address, unavailable: true, error: error instanceof Error ? error.message : "canonical read failed" }; } }));
    const items = await Promise.all(campaigns.rows.map(async row => { try { const value = await fetchCampaign(cluster, address(row.address)); if (!value) return null; const flag = await fetchCanonicalFraudFlag(cluster, value.address).catch(() => null); return { ...value, metadataDigest: value.metadataDigest, metadata: await metadata(row.metadata_uri, "campaign", value.metadataDigest), fraudFlag: flag, sourceSignature: row.source_signature }; } catch (error) { return { address: row.address, unavailable: true, error: error instanceof Error ? error.message : "canonical read failed" }; } }));
    const requested = await db.query("SELECT id,title,location,disaster_type,status FROM disaster_candidates WHERE status='requested' ORDER BY updated_at DESC LIMIT 100");
    return new NextResponse(
      json({ organizations: orgs.filter(Boolean), campaigns: items.filter(Boolean), disasters: requested.rows }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Review unavailable" }, { status: 503 }); }
}
