import { NextRequest, NextResponse } from "next/server";
import { issueChallenge } from "../../../lib/disaster-auth";
export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    if (
      typeof b?.wallet !== "string" ||
      typeof b?.action !== "string" ||
      ![
        "approve",
        "reject",
        "prepare_draft",
        "list_admin",
        "list_organization",
        "request_campaign",
        "record_draft",
        "record_submission",
        "record_active_campaign",
      ].includes(b.action) ||
      (b.candidateId !== undefined && typeof b.candidateId !== "string")
    )
      throw new Error("Invalid challenge request");
    return NextResponse.json(
      await issueChallenge(b.wallet, b.action, b.candidateId)
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 }
    );
  }
}
