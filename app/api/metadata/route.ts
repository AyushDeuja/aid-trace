import { NextRequest, NextResponse } from "next/server";
import {
  createMetadataDocument,
  readMetadataDocument,
  type MetadataKind,
} from "../../lib/metadata-documents";

export const runtime = "nodejs";
const kinds = new Set<MetadataKind>(["organization", "campaign", "allocation", "disbursement"]);

export async function POST(request: NextRequest) {
  try {
    const { kind, metadata } = await request.json();
    if (!kinds.has(kind)) throw new Error("Invalid metadata type");
    return NextResponse.json(await createMetadataDocument(kind, metadata));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Metadata creation failed" },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const uri = request.nextUrl.searchParams.get("uri") || "";
    return NextResponse.json(await readMetadataDocument(uri));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Metadata query failed" },
      { status: 404 }
    );
  }
}
