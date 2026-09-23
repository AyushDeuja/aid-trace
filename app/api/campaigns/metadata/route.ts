import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignMetadata } from "../../../lib/campaigns/metadata";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const uri = request.nextUrl.searchParams.get("uri") || "";
    return NextResponse.json(await fetchCampaignMetadata(uri));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Metadata unavailable",
      },
      { status: 400 }
    );
  }
}
