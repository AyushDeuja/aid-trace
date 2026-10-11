import { address } from "@solana/kit";
import { NextRequest, NextResponse } from "next/server";
import { donorReadModel } from "../../../lib/donor-read-model";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") || "";
  try {
    address(wallet);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(
      await donorReadModel(request.nextUrl.searchParams.get("cluster"), wallet)
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Donation history unavailable",
      },
      { status: 503 }
    );
  }
}
