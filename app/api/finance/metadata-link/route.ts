import { NextRequest, NextResponse } from "next/server";
import { saveFinanceMetadataLink } from "../../../lib/finance/projections";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await saveFinanceMetadataLink(await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save metadata link",
      },
      { status: 400 }
    );
  }
}
