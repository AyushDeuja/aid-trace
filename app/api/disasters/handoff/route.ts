import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/organizations/db";
import { requireOrganizationAuthority } from "../../../lib/disaster-auth";

export async function GET() {
  return NextResponse.json({ error: "Use a signed POST request" }, { status: 401 });
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.organization !== "string") throw new Error("organization is required");
    await requireOrganizationAuthority({ ...body, action: "list_organization" });
    const rows = await database().query(
      "SELECT c.id,c.title,c.location,c.disaster_type,c.status,l.proposal,l.metadata_uri,l.metadata_digest FROM disaster_candidates c JOIN disaster_campaign_links l ON l.candidate_id=c.id WHERE l.organization_address=$1 AND c.status IN ('approved','draft_prepared','draft_created','submitted') ORDER BY c.updated_at DESC",
      [body.organization]
    );
    return NextResponse.json(rows.rows);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 403 });
  }
}
