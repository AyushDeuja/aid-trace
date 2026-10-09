import { NextRequest, NextResponse } from "next/server";
import { isFraudCluster } from "../../../../lib/fraud-types";
import { proxyFraud } from "../../../../lib/fraud-service";
import { requireAdminChallenge } from "../../../../lib/admin-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !isFraudCluster((body as { cluster?: string }).cluster))
    return NextResponse.json({ error: "cluster must be devnet or localnet" }, { status: 400 });
  try {
    const value = body as Record<string, unknown>;
    await requireAdminChallenge({ wallet: String(value.wallet), action: "run_scoring", nonce: String(value.nonce), message: String(value.message), signature: String(value.signature), cluster: value.cluster === "localnet" ? "localnet" : "devnet" });
    return proxyFraud("/v1/evaluations/run", { method: "POST", body: JSON.stringify({ cluster: value.cluster }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 403 }); }
}
