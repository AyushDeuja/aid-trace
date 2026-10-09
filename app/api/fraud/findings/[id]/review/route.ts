import { NextRequest, NextResponse } from "next/server";
import { proxyFraud } from "../../../../../lib/fraud-service";
import { requireAdminChallenge } from "../../../../../lib/admin-auth";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const dispositions = new Set(["needs_investigation", "confirmed_fraud", "false_positive"]);
export async function POST(request: NextRequest, context: Context) {
  const body = await request.json().catch(() => null);
  const id = (await context.params).id;
  const value = body as { reviewer?: unknown; disposition?: unknown; note?: unknown; wallet?: unknown; nonce?: unknown; message?: unknown; signature?: unknown; cluster?: unknown } | null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !value || !dispositions.has(String(value.disposition)) || (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 4000)))
    return NextResponse.json({ error: "Invalid advisory review" }, { status: 400 });
  try {
    await requireAdminChallenge({ wallet: String(value.wallet), action: "review_finding", resourceId: id, nonce: String(value.nonce), message: String(value.message), signature: String(value.signature), cluster: value.cluster === "localnet" ? "localnet" : "devnet" });
    return proxyFraud(`/v1/findings/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ reviewer: value.wallet, disposition: value.disposition, note: value.note || "" }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 403 }); }
}
