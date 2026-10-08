import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../../lib/organizations/db";
import { createMetadataDocument } from "../../../../lib/metadata-documents";
import { requireOrganizationAuthority } from "../../../../lib/disaster-auth";
import { validateCampaignMetadata } from "../../../../lib/campaigns/schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await params).id;
    const body = await request.json();
    const link = (
      await database().query(
        "SELECT * FROM disaster_campaign_links WHERE candidate_id=$1",
        [id]
      )
    ).rows[0];
    if (!link || link.organization_address !== body.organization)
      throw new Error("Candidate is not assigned to this organization");
    await requireOrganizationAuthority({
      ...body,
      action: "prepare_draft",
      candidateId: id,
    });
    const metadata = validateCampaignMetadata(body.proposal);
    const document = await createMetadataDocument("campaign", metadata);
    await database().query(
      "UPDATE disaster_campaign_links SET proposal=$2,metadata_uri=$3,metadata_digest=$4,updated_at=now() WHERE candidate_id=$1",
      [
        id,
        {
          ...metadata,
          goalLamports: link.proposal.goalLamports,
          endsAt: link.proposal.endsAt || null,
        },
        document.uri,
        document.digest,
      ]
    );
    await database().query(
      "UPDATE disaster_candidates SET status='draft_prepared',updated_at=now() WHERE id=$1",
      [id]
    );
    return NextResponse.json({
      ...document,
      goalLamports: link.proposal.goalLamports,
      endsAt: link.proposal.endsAt || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not prepare draft",
      },
      { status: 400 }
    );
  }
}
