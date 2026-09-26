import { NextRequest, NextResponse } from "next/server";
import { saveEvidence } from "../../lib/evidence";
export const runtime="nodejs";
export async function POST(request: NextRequest) { try { const form=await request.formData(); const file=form.get("file"), uploader=form.get("uploader"); if(!(file instanceof File)||typeof uploader!=="string"||!uploader) throw new Error("File and uploader are required"); return NextResponse.json(await saveEvidence(file,uploader)); } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Upload failed"},{status:400}); } }
