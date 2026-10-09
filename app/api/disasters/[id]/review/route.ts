import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { database } from "../../../../lib/organizations/db";
import { requireAdmin } from "../../../../lib/disaster-auth";
import { validateCampaignMetadata } from "../../../../lib/campaigns/schema";
import { createMetadataDocument } from "../../../../lib/metadata-documents";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await params).id,
      b = await request.json();
    const action = b?.action;
    if (action !== "approve" && action !== "reject")
      throw new Error("Invalid review action");
    await requireAdmin({ ...b, action, candidateId: id });
    const db = database();
    if (action === "reject") {
      if (typeof b.note !== "string" || !b.note.trim() || b.note.length > 1000)
        throw new Error("A rejection note is required");
      await db.query(
        "UPDATE disaster_candidates SET status='rejected',updated_at=now() WHERE id=$1 AND status='requested'",
        [id]
      );
      await db.query(
        "INSERT INTO disaster_candidate_history(id,candidate_id,action,actor,note) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), id, "rejected", b.wallet, b.note.trim()]
      );
      return NextResponse.json({ status: "rejected" });
    }
    const link = (
      await db.query(
        "SELECT proposal,organization_address FROM disaster_campaign_links WHERE candidate_id=$1",
        [id]
      )
    ).rows[0];
    if (!link)
      throw new Error(
        "No organization campaign request exists for this candidate"
      );
    const metadata = validateCampaignMetadata(link.proposal);
    const approved = await db.query(
      "UPDATE disaster_candidates SET status='approved',updated_at=now() WHERE id=$1 AND status='requested' RETURNING id",
      [id]
    );
    if (!approved.rows[0])
      throw new Error("Only a pending organization request can be approved");
    const document = await createMetadataDocument("campaign", metadata);
    await db.query(
      "UPDATE disaster_campaign_links SET metadata_uri=$2,metadata_digest=$3,updated_at=now() WHERE candidate_id=$1",
      [id, document.uri, document.digest]
    );
    await db.query(
      "INSERT INTO disaster_candidate_history(id,candidate_id,action,actor,proposal) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        id,
        "approved",
        b.wallet,
        { ...link.proposal, organization: link.organization_address },
      ]
    );
    return NextResponse.json({
      status: "approved",
      organization: link.organization_address,
      goalLamports: link.proposal.goalLamports,
      endsAt: link.proposal.endsAt || null,
      ...document,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Review failed" },
      { status: 400 }
    );
  }
}
