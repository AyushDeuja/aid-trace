import { NextRequest, NextResponse } from "next/server";
import { address as solanaAddress } from "@solana/kit";
import { fetchFraud } from "../../../../../lib/fraud-service";
import { isFraudCluster } from "../../../../../lib/fraud-types";
import {
  fetchCanonicalFraudFlag,
  fetchCanonicalTrustScore,
} from "../../../../../lib/trust-chain";

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
  const [evaluation, write, canonical] = await Promise.all([
    fetchFraud(`/v1/subjects/${address}?cluster=${cluster}`),
    fetchFraud(`/v1/subjects/${address}/trust?cluster=${cluster}`),
    Promise.all([
      fetchCanonicalTrustScore(cluster, solanaAddress(address)).catch(
        (error) => ({
          error:
            error instanceof Error
              ? error.message
              : "canonical trust read failed",
        })
      ),
      fetchCanonicalFraudFlag(cluster, solanaAddress(address)).catch(
        (error) => ({
          error:
            error instanceof Error
              ? error.message
              : "canonical fraud flag read failed",
        })
      ),
    ]),
  ]);
  if (!evaluation.ok && evaluation.status !== 404)
    return NextResponse.json(evaluation.body, { status: evaluation.status });
  const [trustScore, fraudFlag] = canonical;
  const canonicalUnavailable =
    (trustScore !== null && "error" in trustScore) ||
    (fraudFlag !== null && "error" in fraudFlag);
  const state = canonicalUnavailable
    ? "unavailable"
    : trustScore && !("error" in trustScore)
      ? "canonical"
      : !evaluation.ok
        ? "not_initialized"
        : write.body &&
            typeof write.body === "object" &&
            "status" in write.body &&
            ((write.body as { status: unknown }).status === "failed" ||
              (write.body as { status: unknown }).status === "action_pending")
          ? "stale"
          : "realtime_pending";
  return NextResponse.json({
    state,
    evaluation: evaluation.ok ? evaluation.body : null,
    write: write.ok ? write.body : null,
    canonical: canonicalUnavailable
      ? null
      : { trust_score: trustScore, fraud_flag: fraudFlag },
  });
}
