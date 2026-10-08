import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/organizations/db";
import {
  requireAdmin,
  requireOrganizationAuthority,
} from "../../../lib/disaster-auth";

const candidateQuery = `SELECT c.*, COALESCE(json_agg(json_build_object('provider',o.provider,'external_id',o.external_id,'source_url',o.source_url,'retrieved_at',o.retrieved_at,'payload_digest',o.payload_digest)) FILTER (WHERE o.id IS NOT NULL),'[]') observations FROM disaster_candidates c LEFT JOIN disaster_candidate_observations l ON l.candidate_id=c.id LEFT JOIN disaster_source_observations o ON o.id=l.observation_id WHERE ($1::text IS NULL OR c.status=$1) GROUP BY c.id ORDER BY c.occurred_at DESC NULLS LAST`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.role === "admin") {
      await requireAdmin({ ...body, action: "list_admin" });
      const rows = await database().query(candidateQuery, [body.status || null]);
      return NextResponse.json(rows.rows);
    }
    if (body?.role === "organization" && typeof body.organization === "string") {
      await requireOrganizationAuthority({
        ...body,
        action: "list_organization",
      });
      // Organizations may consider detected candidates and inspect the state of
      // their own requests; no other organization's request data is exposed.
      const rows = await database().query(
        `SELECT c.*, COALESCE(json_agg(json_build_object('provider',o.provider,'external_id',o.external_id,'source_url',o.source_url,'retrieved_at',o.retrieved_at,'payload_digest',o.payload_digest)) FILTER (WHERE o.id IS NOT NULL),'[]') observations
         FROM disaster_candidates c
         LEFT JOIN disaster_candidate_observations l ON l.candidate_id=c.id
         LEFT JOIN disaster_source_observations o ON o.id=l.observation_id
         LEFT JOIN disaster_campaign_links dcl ON dcl.candidate_id=c.id
         WHERE c.status='detected' OR dcl.organization_address=$1
         GROUP BY c.id ORDER BY c.occurred_at DESC NULLS LAST`,
        [body.organization]
      );
      return NextResponse.json(rows.rows);
    }
    throw new Error("Invalid listing request");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list disasters" },
      { status: 403 }
    );
  }
}
