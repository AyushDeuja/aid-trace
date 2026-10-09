import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  // Disaster candidates include private source-provenance data. Listings are
  // available only through the signed admin/organization list endpoint.
  return NextResponse.json(
    { error: "A signed organization or administrator request is required" },
    { status: 401 }
  );
}
