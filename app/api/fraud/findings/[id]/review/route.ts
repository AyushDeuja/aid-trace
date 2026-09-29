import { NextRequest, NextResponse } from "next/server";
import { proxyFraud } from "../../../../../lib/fraud-service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const dispositions = new Set(["needs_investigation", "confirmed_fraud", "false_positive"]);
export async function POST(request: NextRequest, context: Context) {
  const body = await request.json().catch(() => null);
  const id = (await context.params).id;
  const value = body as { reviewer?: unknown; disposition?: unknown; note?: unknown } | null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !value || typeof value.reviewer !== "string" || !value.reviewer.trim() || !dispositions.has(String(value.disposition)) || (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 4000)))
    return NextResponse.json({ error: "Invalid advisory review" }, { status: 400 });
  return proxyFraud(`/v1/findings/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ reviewer: value.reviewer.trim(), disposition: value.disposition, note: value.note || "" }) });
}
