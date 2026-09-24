import { NextRequest, NextResponse } from "next/server";
import { financeHistory } from "../../../lib/finance/projections";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await financeHistory(request.nextUrl.searchParams.get("campaign") || "")
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Finance history unavailable",
      },
      { status: 500 }
    );
  }
}
