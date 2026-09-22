import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";
import {
  database,
  ensureOrganizationSchema,
} from "../../lib/organizations/db";
import { fetchOrganization } from "../../lib/organizations/chain";
import { fetchVerifiedMetadata } from "../../lib/organizations/metadata";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const cluster =
      request.nextUrl.searchParams.get("cluster") === "localnet"
        ? "localnet"
        : "devnet";
    await ensureOrganizationSchema();
    const rows = await database().query(
      "SELECT address, metadata_uri FROM organization_projection ORDER BY updated_at DESC LIMIT 100"
    );
    const organizations = await Promise.all(
      rows.rows.map(async (row) => {
        const canonical = await fetchOrganization(
          cluster,
          address(row.address)
        );
        if (!canonical) return null;
        let metadata = null;
        if (row.metadata_uri) {
          try {
            metadata = await fetchVerifiedMetadata(
              row.metadata_uri,
              canonical.metadataDigest
            );
          } catch {
            /* stale metadata is omitted */
          }
        }
        return {
          ...canonical,
          verifiedDeliveryCount: canonical.verifiedDeliveryCount.toString(),
          nextCampaignId: canonical.nextCampaignId.toString(),
          metadata,
        };
      })
    );
    return NextResponse.json(organizations.filter(Boolean));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 503 }
    );
  }
}
