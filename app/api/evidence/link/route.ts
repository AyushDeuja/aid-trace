import { NextRequest, NextResponse } from "next/server";
import { linkEvidence } from "../../../lib/evidence";
export const runtime="nodejs";
export async function POST(request: NextRequest) { try { await linkEvidence(await request.json()); return NextResponse.json({ok:true}); } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Could not link evidence"},{status:400}); } }
