import { NextRequest, NextResponse } from "next/server";
import { isFraudCluster } from "../../../lib/fraud-types";
import { proxyFraud } from "../../../lib/fraud-service";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const cluster = request.nextUrl.searchParams.get("cluster");
  const severity = request.nextUrl.searchParams.get("severity");
  if (!isFraudCluster(cluster)) return NextResponse.json({ error: "cluster must be devnet or localnet" }, { status: 400 });
  if (severity && severity !== "medium" && severity !== "high") return NextResponse.json({ error: "severity must be medium or high" }, { status: 400 });
  const params = new URLSearchParams({ cluster }); if (severity) params.set("severity", severity);
  return proxyFraud(`/v1/findings?${params}`);
}
