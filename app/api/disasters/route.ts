import { NextRequest, NextResponse } from "next/server";
import { database } from "../../lib/organizations/db";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const rows = await database().query(
    `SELECT c.*, COALESCE(json_agg(json_build_object('provider',o.provider,'external_id',o.external_id,'source_url',o.source_url,'retrieved_at',o.retrieved_at,'payload_digest',o.payload_digest)) FILTER (WHERE o.id IS NOT NULL),'[]') observations FROM disaster_candidates c LEFT JOIN disaster_candidate_observations l ON l.candidate_id=c.id LEFT JOIN disaster_source_observations o ON o.id=l.observation_id WHERE ($1::text IS NULL OR c.status=$1) GROUP BY c.id ORDER BY c.occurred_at DESC NULLS LAST`,
    [status]
  );
  return NextResponse.json(rows.rows);
}
