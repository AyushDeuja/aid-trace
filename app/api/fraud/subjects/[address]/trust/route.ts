import { NextResponse } from "next/server";
import { isFraudCluster } from "../../../../../lib/fraud-types";
import { proxyFraud } from "../../../../../lib/fraud-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const cluster = new URL(request.url).searchParams.get("cluster");
  if (
    !isFraudCluster(cluster) ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  )
    return NextResponse.json(
      { error: "invalid cluster or subject" },
      { status: 400 }
    );
  return proxyFraud(
    `/v1/subjects/${encodeURIComponent(address)}/trust?cluster=${cluster}`
  );
}
