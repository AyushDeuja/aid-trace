import { NextRequest, NextResponse } from "next/server";
import { organizationsReadModel } from "../../../lib/read-models";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await organizationsReadModel(request.nextUrl.searchParams.get("cluster"))
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
