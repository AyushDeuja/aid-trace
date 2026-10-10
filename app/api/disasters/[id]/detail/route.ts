import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../../lib/organizations/db";
import {
  requireAdmin,
  requireOrganizationAuthority,
} from "../../../../lib/disaster-auth";
import { readMetadataDocument } from "../../../../lib/metadata-documents";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await params).id;
    const body = await request.json();
    const db = database();
    let role: "admin" | "organization";
    if (body?.role === "admin") {
      await requireAdmin({
        ...body,
        action: "view_admin_detail",
        candidateId: id,
      });
      role = "admin";
    } else if (
      body?.role === "organization" &&
      typeof body?.organization === "string"
    ) {
      await requireOrganizationAuthority({
        ...body,
        action: "view_organization_detail",
        candidateId: id,
      });
      role = "organization";
    } else {
      throw new Error("Invalid detail request");
    }

    const candidate = (
      await db.query(
        `SELECT c.*,l.organization_address,l.proposal,l.metadata_uri,l.metadata_digest,l.campaign_address,l.create_signature,l.submit_signature,l.activation_signature
       FROM disaster_candidates c LEFT JOIN disaster_campaign_links l ON l.candidate_id=c.id
       WHERE c.id=$1`,
        [id]
      )
    ).rows[0];
    if (!candidate) throw new Error("Disaster candidate not found");
    if (
      role === "organization" &&
      candidate.status !== "detected" &&
      candidate.organization_address !== body.organization
    )
      throw new Error(
        "This disaster request is not available to the organization"
      );

    const [observations, history] = await Promise.all([
      db.query(
        `SELECT o.provider,o.external_id,o.source_url,o.retrieved_at,o.occurred_at,o.payload_digest
         FROM disaster_candidate_observations l JOIN disaster_source_observations o ON o.id=l.observation_id
         WHERE l.candidate_id=$1 ORDER BY o.retrieved_at DESC`,
        [id]
      ),
      db.query(
        "SELECT action,actor,note,proposal,created_at FROM disaster_candidate_history WHERE candidate_id=$1 ORDER BY created_at DESC",
        [id]
      ),
    ]);
    let metadataState:
      "unlinked" | "verified" | "digest_mismatch" | "unavailable" = "unlinked";
    if (candidate.metadata_uri) {
      try {
        const document = await readMetadataDocument(
          candidate.metadata_uri,
          "campaign"
        );
        metadataState =
          document.digest === candidate.metadata_digest
            ? "verified"
            : "digest_mismatch";
      } catch {
        metadataState = "unavailable";
      }
    }
    return NextResponse.json({
      ...candidate,
      observations: observations.rows,
      history: history.rows,
      metadataState,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load disaster detail",
      },
      { status: 403 }
    );
  }
}
