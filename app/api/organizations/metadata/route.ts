import { NextRequest, NextResponse } from "next/server";
import { fetchMetadataWithDigest } from "../../../lib/organizations/metadata";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { uri } = await request.json();
    if (typeof uri !== "string") throw new Error("Metadata URI is required");
    return NextResponse.json(await fetchMetadataWithDigest(uri));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid metadata" },
      { status: 400 }
    );
  }
}
