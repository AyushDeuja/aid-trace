import { NextRequest, NextResponse } from "next/server";
import { isFraudCluster } from "../../../../lib/fraud-types";
import { proxyFraud } from "../../../../lib/fraud-service";
export const runtime = "nodejs";
type Context = { params: Promise<{ address: string }> };
export async function GET(request: NextRequest, context: Context) {
  const cluster = request.nextUrl.searchParams.get("cluster");
  const address = (await context.params).address;
  if (
    !isFraudCluster(cluster) ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  )
    return NextResponse.json(
      { error: "Invalid cluster or subject address" },
      { status: 400 }
    );
  return proxyFraud(
    `/v1/subjects/${encodeURIComponent(address)}?cluster=${cluster}`
  );
}
