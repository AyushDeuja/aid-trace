import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";
import { database, ensureOrganizationSchema } from "../../lib/organizations/db";
import { fetchOrganization, PROGRAM_ID } from "../../lib/organizations/chain";
import { fetchVerifiedMetadata } from "../../lib/organizations/metadata";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const cluster =
      request.nextUrl.searchParams.get("cluster") === "localnet"
        ? "localnet"
        : "devnet";
    await ensureOrganizationSchema();
    // The legacy projection table has no cluster/program scope.  In
    // particular, it can contain accounts from a program ID that was rotated
    // during Devnet development.  Only list records indexed for the program
    // and cluster that this request is reading.
    const rows = await database().query(
      `SELECT address, metadata_uri
       FROM chain_organization_projection
       WHERE cluster = $1 AND program_id = $2
       ORDER BY updated_at DESC
       LIMIT 100`,
      [cluster, PROGRAM_ID]
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
