import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { database } from "../../../../lib/organizations/db";
import { requireAdmin } from "../../../../lib/disaster-auth";
import { validateCampaignMetadata } from "../../../../lib/campaigns/schema";
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
        "UPDATE disaster_candidates SET status='rejected',updated_at=now() WHERE id=$1 AND status='detected'",
        [id]
      );
      await db.query(
        "INSERT INTO disaster_candidate_history(id,candidate_id,action,actor,note) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), id, "rejected", b.wallet, b.note.trim()]
      );
      return NextResponse.json({ status: "rejected" });
    }
    const proposal = b.proposal;
    const metadata = validateCampaignMetadata(proposal);
    if (
      typeof proposal?.organization !== "string" ||
      typeof proposal?.goalLamports !== "string" ||
      !/^\d+$/.test(proposal.goalLamports)
    )
      throw new Error("Invalid campaign proposal");
    await db.query(
      "UPDATE disaster_candidates SET status='approved',updated_at=now() WHERE id=$1 AND status='detected'",
      [id]
    );
    await db.query(
      "INSERT INTO disaster_campaign_links(candidate_id,organization_address,proposal) VALUES($1,$2,$3) ON CONFLICT(candidate_id) DO UPDATE SET organization_address=EXCLUDED.organization_address,proposal=EXCLUDED.proposal,updated_at=now()",
      [
        id,
        proposal.organization,
        {
          ...metadata,
          goalLamports: proposal.goalLamports,
          endsAt: proposal.endsAt || null,
        },
      ]
    );
    await db.query(
      "INSERT INTO disaster_candidate_history(id,candidate_id,action,actor,proposal) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        id,
        "approved",
        b.wallet,
        {
          ...metadata,
          organization: proposal.organization,
          goalLamports: proposal.goalLamports,
          endsAt: proposal.endsAt || null,
        },
      ]
    );
    return NextResponse.json({ status: "approved" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Review failed" },
      { status: 400 }
    );
  }
}
