import { NextResponse } from "next/server";
import { evidenceById } from "../../../../lib/evidence";
export const runtime="nodejs";
export async function GET(_: Request,{params}:{params:Promise<{id:string}>}) { try { const {row,bytes}=await evidenceById((await params).id); return new NextResponse(bytes,{headers:{"content-type":row.mime_type,"content-disposition":`attachment; filename="${row.filename}"`}}); } catch { return NextResponse.json({error:"Evidence unavailable"},{status:404}); } }
