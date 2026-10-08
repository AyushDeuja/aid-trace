import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/organizations/db";
export async function GET(request: NextRequest) {
  const organization = request.nextUrl.searchParams.get("organization");
  if (!organization)
    return NextResponse.json(
      { error: "organization is required" },
      { status: 400 }
    );
  const rows = await database().query(
    "SELECT c.id,c.title,c.location,c.disaster_type,c.status,l.proposal,l.metadata_uri,l.metadata_digest FROM disaster_candidates c JOIN disaster_campaign_links l ON l.candidate_id=c.id WHERE l.organization_address=$1 AND c.status IN ('approved','draft_prepared','draft_created','submitted') ORDER BY c.updated_at DESC",
    [organization]
  );
  return NextResponse.json(rows.rows);
}
