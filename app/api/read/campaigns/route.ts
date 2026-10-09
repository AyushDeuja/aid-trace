import { NextRequest, NextResponse } from "next/server";
import { campaignsReadModel } from "../../../lib/read-models";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await campaignsReadModel(
        request.nextUrl.searchParams.get("cluster"),
        request.nextUrl.searchParams.get("organization")
      )
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
