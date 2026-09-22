import { NextRequest, NextResponse } from "next/server";
import { address as parseAddress } from "@solana/kit";
import {
  database,
  ensureOrganizationSchema,
} from "../../../lib/organizations/db";
import { fetchOrganization } from "../../../lib/organizations/chain";
import { fetchVerifiedMetadata } from "../../../lib/organizations/metadata";

export const runtime = "nodejs";
type Context = { params: Promise<{ address: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const key = parseAddress((await context.params).address);
    const cluster =
      request.nextUrl.searchParams.get("cluster") === "localnet"
        ? "localnet"
        : "devnet";
    const canonical = await fetchOrganization(cluster, key);
    if (!canonical)
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    await ensureOrganizationSchema();
    const row = await database().query(
      "SELECT metadata_uri FROM organization_projection WHERE address = $1",
      [key]
    );
    let metadata = null;
    if (row.rows[0]?.metadata_uri) {
      try {
        metadata = await fetchVerifiedMetadata(
          row.rows[0].metadata_uri,
          canonical.metadataDigest
        );
      } catch {
        /* stale metadata is omitted */
      }
    }
    return NextResponse.json({
      ...canonical,
      verifiedDeliveryCount: canonical.verifiedDeliveryCount.toString(),
      nextCampaignId: canonical.nextCampaignId.toString(),
      metadata,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 503 }
    );
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const key = parseAddress((await context.params).address);
    const { uri, cluster } = await request.json();
    if (cluster !== "localnet" && cluster !== "devnet")
      return NextResponse.json(
        { error: "Unsupported cluster" },
        { status: 400 }
      );
    const canonical = await fetchOrganization(cluster, key);
    if (!canonical)
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    await fetchVerifiedMetadata(uri, canonical.metadataDigest);
    await ensureOrganizationSchema();
    await database().query(
      `INSERT INTO organization_projection
       (address, founder, authority, pending_authority, metadata_digest, metadata_uri, status, verified, verified_delivery_count, next_campaign_id, observed_slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)
       ON CONFLICT (address) DO UPDATE SET metadata_uri=EXCLUDED.metadata_uri,
       metadata_digest=EXCLUDED.metadata_digest`,
      [
        key,
        canonical.founder,
        canonical.authority,
        canonical.pendingAuthority,
        canonical.metadataDigest,
        uri,
        canonical.status,
        canonical.verified,
        canonical.verifiedDeliveryCount.toString(),
        canonical.nextCampaignId.toString(),
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Metadata update failed",
      },
      { status: 400 }
    );
  }
}
