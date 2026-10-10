import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/organizations/db";
import { fetchOrganization } from "../../../lib/organizations/chain";
import { fetchCampaign } from "../../../lib/campaigns/chain";
import { fetchCanonicalFraudFlag } from "../../../lib/trust-chain";
import { readMetadataDocument } from "../../../lib/metadata-documents";
import { fetchFraud } from "../../../lib/fraud-service";
import { address } from "@solana/kit";
import { requireAdminChallenge } from "../../../lib/admin-auth";

const programId = "8tcYj5qT3GAwhhHmK8UgHtyCZq7MgD8nCYGhC7rwEW5r";
const json = (value: unknown) =>
  JSON.stringify(value, (_key, current) =>
    typeof current === "bigint" ? current.toString() : current
  );
const metadata = async (
  uri: string | null,
  kind: "organization" | "campaign",
  digest: string
) => {
  if (!uri) return { state: "unlinked" as const, value: null };
  try {
    const doc = await readMetadataDocument(uri, kind);
    return doc.digest === digest
      ? { state: "verified" as const, value: doc.metadata }
      : { state: "digest_mismatch" as const, value: null };
  } catch {
    return { state: "unavailable" as const, value: null };
  }
};
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object")
      return NextResponse.json(
        { error: "Admin authorization is required" },
        { status: 403 }
      );
    const payload = body as Record<string, unknown>;
    const cluster = payload.cluster === "localnet" ? "localnet" : "devnet";
    try {
      await requireAdminChallenge({
        wallet: String(payload.wallet),
        action: "read_review_queue",
        nonce: String(payload.nonce),
        message: String(payload.message),
        signature: String(payload.signature),
        cluster,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unauthorized" },
        { status: 403 }
      );
    }
    const db = database();
    const [organizations, campaigns] = await Promise.all([
      db.query(
        "SELECT address,metadata_uri,source_signature FROM chain_organization_projection WHERE cluster=$1 AND program_id=$2 ORDER BY updated_at DESC LIMIT 100",
        [cluster, programId]
      ),
      db.query(
        "SELECT address,metadata_uri,source_signature FROM chain_campaign_projection WHERE cluster=$1 AND program_id=$2 ORDER BY updated_at DESC LIMIT 100",
        [cluster, programId]
      ),
    ]);
    const orgs = await Promise.all(
      organizations.rows.map(async (row) => {
        try {
          const value = await fetchOrganization(cluster, address(row.address));
          if (!value) return null;
          return {
            ...value,
            metadataDigest: value.metadataDigest,
            metadata: await metadata(
              row.metadata_uri,
              "organization",
              value.metadataDigest
            ),
            sourceSignature: row.source_signature,
          };
        } catch (error) {
          return {
            address: row.address,
            unavailable: true,
            error:
              error instanceof Error ? error.message : "canonical read failed",
          };
        }
      })
    );
    const items = await Promise.all(
      campaigns.rows.map(async (row) => {
        try {
          const value = await fetchCampaign(cluster, address(row.address));
          if (!value) return null;
          const flag = await fetchCanonicalFraudFlag(
            cluster,
            value.address
          ).catch(() => null);
          return {
            ...value,
            metadataDigest: value.metadataDigest,
            metadata: await metadata(
              row.metadata_uri,
              "campaign",
              value.metadataDigest
            ),
            fraudFlag: flag,
            sourceSignature: row.source_signature,
          };
        } catch (error) {
          return {
            address: row.address,
            unavailable: true,
            error:
              error instanceof Error ? error.message : "canonical read failed",
          };
        }
      })
    );
    const [requested, disasterHistory, fraudHistory, fraudHealth] =
      await Promise.all([
        db.query(
          "SELECT id,title,location,disaster_type,status FROM disaster_candidates WHERE status='requested' ORDER BY updated_at DESC LIMIT 100"
        ),
        db
          .query(
            "SELECT h.id,h.action,h.actor,h.note,h.created_at,c.title FROM disaster_candidate_history h JOIN disaster_candidates c ON c.id=h.candidate_id ORDER BY h.created_at DESC LIMIT 20"
          )
          .catch(() => ({ rows: [] })),
        db
          .query(
            "SELECT r.id,r.disposition,r.reviewer,r.note,r.created_at,f.subject_address FROM fraud_reviews r JOIN fraud_findings f ON f.id=r.finding_id WHERE f.cluster=$1 AND f.program_id=$2 ORDER BY r.created_at DESC LIMIT 20",
            [cluster, programId]
          )
          .catch(() => ({ rows: [] })),
        fetchFraud("/health"),
      ]);
    const unavailableReads = [...orgs, ...items].filter(
      (item) => item && "unavailable" in item && item.unavailable
    ).length;
    return new NextResponse(
      json({
        organizations: orgs.filter(Boolean),
        campaigns: items.filter(Boolean),
        disasters: requested.rows,
        decisions: [
          ...disasterHistory.rows.map((row) => ({
            id: `disaster:${row.id}`,
            kind: "disaster",
            action: row.action,
            actor: row.actor,
            note: row.note,
            title: row.title,
            createdAt: row.created_at,
          })),
          ...fraudHistory.rows.map((row) => ({
            id: `fraud:${row.id}`,
            kind: "fraud",
            action: row.disposition,
            actor: row.reviewer,
            note: row.note,
            title: row.subject_address,
            createdAt: row.created_at,
          })),
        ]
          .sort(
            (left, right) =>
              new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime()
          )
          .slice(0, 20),
        health: {
          database: "available",
          canonical: unavailableReads ? "degraded" : "available",
          fraud: fraudHealth.ok ? "available" : "unavailable",
        },
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review unavailable" },
      { status: 503 }
    );
  }
}
