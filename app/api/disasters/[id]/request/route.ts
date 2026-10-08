import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateCampaignMetadata } from "../../../../lib/campaigns/schema";
import { requireOrganizationAuthority } from "../../../../lib/disaster-auth";
import { database } from "../../../../lib/organizations/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await params).id;
    const body = await request.json();
    if (typeof body?.organization !== "string")
      throw new Error("Organization is required");
    await requireOrganizationAuthority({
      ...body,
      action: "request_campaign",
      candidateId: id,
    });
    if (!/^\d+$/.test(body?.proposal?.goalLamports || ""))
      throw new Error("Goal must be expressed as lamports");
    const metadata = validateCampaignMetadata(body.proposal);
    const db = database();
    const updated = await db.query(
      "UPDATE disaster_candidates SET status='requested',updated_at=now() WHERE id=$1 AND status='detected' RETURNING id",
      [id]
    );
    if (!updated.rows[0]) throw new Error("Candidate is no longer available for a request");
    const proposal = {
      ...metadata,
      goalLamports: body.proposal.goalLamports,
      endsAt: body.proposal.endsAt || null,
    };
    await db.query(
      "INSERT INTO disaster_campaign_links(candidate_id,organization_address,proposal) VALUES($1,$2,$3)",
      [id, body.organization, proposal]
    );
    await db.query(
      "INSERT INTO disaster_candidate_history(id,candidate_id,action,actor,proposal) VALUES($1,$2,'requested',$3,$4)",
      [randomUUID(), id, body.wallet, { ...proposal, organization: body.organization }]
    );
    return NextResponse.json({ status: "requested" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not request campaign" },
      { status: 400 }
    );
  }
}
