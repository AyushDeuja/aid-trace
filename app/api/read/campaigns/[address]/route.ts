import { NextRequest, NextResponse } from "next/server";
import { campaignDetailReadModel } from "../../../../lib/read-models";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await campaignDetailReadModel(
      request.nextUrl.searchParams.get("cluster"),
      address
    );
    return body
      ? NextResponse.json(body)
      : NextResponse.json(
          { error: "Campaign projection not found" },
          { status: 404 }
        );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Read model unavailable",
      },
      { status: 503 }
    );
  }
}
