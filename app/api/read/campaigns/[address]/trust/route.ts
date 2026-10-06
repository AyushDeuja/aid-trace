import { NextRequest, NextResponse } from "next/server";
import { fetchFraud } from "../../../../../lib/fraud-service";
import { isFraudCluster } from "../../../../../lib/fraud-types";

export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const cluster = request.nextUrl.searchParams.get("cluster");
  if (
    !isFraudCluster(cluster) ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  )
    return NextResponse.json(
      { error: "invalid cluster or campaign" },
      { status: 400 }
    );
  const [evaluation, write] = await Promise.all([
    fetchFraud(`/v1/subjects/${address}?cluster=${cluster}`),
    fetchFraud(`/v1/subjects/${address}/trust?cluster=${cluster}`),
  ]);
  if (!evaluation.ok && evaluation.status !== 404)
    return NextResponse.json(evaluation.body, { status: evaluation.status });
  const state = !evaluation.ok
    ? "not_initialized"
    : !write.ok
      ? "canonical"
      : write.body &&
          typeof write.body === "object" &&
          "status" in write.body &&
          (write.body as { status: unknown }).status === "committed"
        ? "canonical"
        : "realtime_pending";
  return NextResponse.json({
    state,
    evaluation: evaluation.ok ? evaluation.body : null,
    write: write.ok ? write.body : null,
  });
}
