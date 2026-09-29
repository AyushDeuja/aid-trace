import { NextRequest, NextResponse } from "next/server";
import { isFraudCluster } from "../../../../lib/fraud-types";
import { proxyFraud } from "../../../../lib/fraud-service";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !isFraudCluster((body as { cluster?: string }).cluster))
    return NextResponse.json({ error: "cluster must be devnet or localnet" }, { status: 400 });
  return proxyFraud("/v1/evaluations/run", { method: "POST", body: JSON.stringify(body) });
}
