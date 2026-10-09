import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";
import { fetchCampaign } from "../../../../lib/campaigns/chain";
import { requireOrganizationAuthority } from "../../../../lib/disaster-auth";
import { requireAdmin } from "../../../../lib/disaster-auth";
import { database } from "../../../../lib/organizations/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await params).id;
    const body = await request.json();
    if (!body?.phase || !["draft_created", "submitted", "active_created"].includes(body.phase))
      throw new Error("Invalid campaign lifecycle phase");
    if (typeof body?.campaignAddress !== "string" || typeof body?.campaignSignature !== "string")
      throw new Error("Campaign address and signature are required");
    if (body.phase === "active_created") {
      await requireAdmin({ ...body, action: "record_active_campaign", candidateId: id });
    } else {
      await requireOrganizationAuthority({
        ...body,
        action: body.phase === "draft_created" ? "record_draft" : "record_submission",
        candidateId: id,
      });
    }
    const campaign = await fetchCampaign(body.cluster, address(body.campaignAddress));
    if (!campaign || campaign.organization !== body.organization)
      throw new Error("The supplied campaign is not a canonical campaign for this organization");
    if (body.phase === "draft_created" && campaign.status !== "Draft")
      throw new Error("Campaign is not in Draft status");
    if (body.phase === "submitted" && campaign.status !== "PendingReview")
      throw new Error("Campaign is not pending admin review");
    if (body.phase === "active_created" && campaign.status !== "Active")
      throw new Error("Campaign is not active");
    const column = body.phase === "submitted" ? "submit_signature" : "create_signature";
    const result = await database().query(
      `UPDATE disaster_campaign_links SET campaign_address=$2, ${column}=$3, updated_at=now() WHERE candidate_id=$1 AND organization_address=$4 RETURNING candidate_id`,
      [id, body.campaignAddress, body.campaignSignature, body.organization]
    );
    if (!result.rows[0]) throw new Error("Campaign request does not belong to this organization");
    await database().query(
      "UPDATE disaster_candidates SET status=$2,updated_at=now() WHERE id=$1",
      [id, body.phase === "active_created" ? "activated" : body.phase]
    );
    return NextResponse.json({ status: body.phase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record campaign state" },
      { status: 400 }
    );
  }
}
