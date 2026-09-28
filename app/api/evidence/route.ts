import { NextRequest, NextResponse } from "next/server";
import { saveEvidence } from "../../lib/evidence";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file"),
      uploader = form.get("uploader");
    if (!(file instanceof File) || typeof uploader !== "string" || !uploader)
      throw new Error("File and uploader are required");
    return NextResponse.json(await saveEvidence(file, uploader));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
export async function GET(request: NextRequest) {
  try {
    const { evidenceById, parseEvidenceUri } =
      await import("../../lib/evidence");
    const uri = request.nextUrl.searchParams.get("uri") || "";
    const { row } = await evidenceById(parseEvidenceUri(uri));
    return NextResponse.json({
      uri,
      digest: row.digest,
      metadata: {
        filename: row.filename,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
        uploader: row.uploader,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Evidence unavailable",
      },
      { status: 400 }
    );
  }
}
