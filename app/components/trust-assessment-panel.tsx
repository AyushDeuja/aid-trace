"use client";
import { useEffect, useState } from "react";
import { useCluster } from "./cluster-context";
import {
  parseSubject,
  parseTrustWriteStatus,
  type FraudSubject,
  type TrustWriteStatus,
} from "../lib/fraud-types";

type TrustModel = {
  state:
    | "canonical"
    | "realtime_pending"
    | "stale"
    | "unavailable"
    | "not_initialized";
  evaluation: FraudSubject | null;
  write: TrustWriteStatus | null;
  canonical: {
    trust_score: {
      address: string;
      score: number;
      riskBand: string;
      modelVersionDigest: string;
      reasonDigest: string;
      evaluatedAt: string;
      sequence: string;
      flagged: boolean;
    } | null;
    fraud_flag: { address: string; resolution: string } | null;
  } | null;
};
type CanonicalTrust = NonNullable<TrustModel["canonical"]>["trust_score"];
type CanonicalFlag = NonNullable<TrustModel["canonical"]>["fraud_flag"];
function parseCanonical(value: unknown): TrustModel["canonical"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const score = row.trust_score;
  const flag = row.fraud_flag;
  if (score !== null && (typeof score !== "object" || Array.isArray(score)))
    throw new Error("Invalid canonical TrustScore");
  if (flag !== null && (typeof flag !== "object" || Array.isArray(flag)))
    throw new Error("Invalid canonical FraudFlag");
  const trust = score as Record<string, unknown> | null;
  const fraud = flag as Record<string, unknown> | null;
  if (
    trust &&
    (typeof trust.address !== "string" ||
      typeof trust.score !== "number" ||
      typeof trust.riskBand !== "string" ||
      typeof trust.modelVersionDigest !== "string" ||
      typeof trust.reasonDigest !== "string" ||
      typeof trust.evaluatedAt !== "string" ||
      typeof trust.sequence !== "string" ||
      typeof trust.flagged !== "boolean")
  )
    throw new Error("Invalid canonical TrustScore");
  if (
    fraud &&
    (typeof fraud.address !== "string" || typeof fraud.resolution !== "string")
  )
    throw new Error("Invalid canonical FraudFlag");
  return {
    trust_score: trust as CanonicalTrust,
    fraud_flag: fraud as CanonicalFlag,
  };
}
export function TrustAssessmentPanel({ campaign }: { campaign: string }) {
  const { cluster, getExplorerUrl } = useCluster();
  const [model, setModel] = useState<TrustModel | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/read/campaigns/${campaign}/trust?cluster=${cluster}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!live) return;
        if (!ok)
          return setModel({
            state: "unavailable",
            evaluation: null,
            write: null,
            canonical: null,
          });
        const state = body.state;
        if (
          state !== "canonical" &&
          state !== "realtime_pending" &&
          state !== "stale" &&
          state !== "unavailable" &&
          state !== "not_initialized"
        )
          throw new Error("Invalid trust state");
        setModel({
          state,
          evaluation: body.evaluation ? parseSubject(body.evaluation) : null,
          write: body.write ? parseTrustWriteStatus(body.write) : null,
          canonical: parseCanonical(body.canonical),
        });
      })
      .catch(
        () =>
          live &&
          setModel({
            state: "unavailable",
            evaluation: null,
            write: null,
            canonical: null,
          })
      );
    return () => {
      live = false;
    };
  }, [campaign, cluster]);
  const state = model?.state ?? "realtime_pending";
  const canonical = model?.canonical?.trust_score;
  const flag = model?.canonical?.fraud_flag;
  return (
    <section className="space-y-2 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Trust assessment</h2>
      {canonical ? (
        <>
          <p className="font-medium">
            {canonical.riskBand.replaceAll("_", " ").toUpperCase()} advisory
            risk · score {canonical.score}/100
          </p>
          <p className="text-sm text-muted">
            Canonical Solana-confirmed assessment · sequence{" "}
            {canonical.sequence}
          </p>
          <p className="break-all text-xs text-muted">
            Model digest: {canonical.modelVersionDigest}
            <br />
            Reason digest: {canonical.reasonDigest}
            <br />
            Evaluated at: {canonical.evaluatedAt}
          </p>
          <p className="text-sm">
            Advisory flag:{" "}
            {flag
              ? flag.resolution
              : canonical.flagged
                ? "action pending"
                : "not triggered"}
          </p>
          <p className="break-all text-xs text-muted">
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={getExplorerUrl(`/address/${canonical.address}`)}
            >
              View TrustScore
            </a>
            {flag && (
              <>
                {" "}
                ·{" "}
                <a
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                  href={getExplorerUrl(`/address/${flag.address}`)}
                >
                  View FraudFlag
                </a>
              </>
            )}
          </p>
        </>
      ) : model?.evaluation ? (
        <>
          <p className="font-medium">
            {model.evaluation.risk_band.toUpperCase()} advisory risk · score{" "}
            {model.evaluation.score}/100
          </p>
          <p className="text-sm text-muted">
            {state === "canonical"
              ? "Canonical Solana-confirmed assessment"
              : "Assessment is pending canonical settlement"}
          </p>
          <ul className="list-disc pl-5 text-sm">
            {model.evaluation.reasons.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">
          {state === "unavailable"
            ? "Assessment unavailable. Donations remain available."
            : "Assessment pending; no canonical trust score exists yet."}
        </p>
      )}
      {model?.write && (
        <p className="break-all text-xs text-muted">
          {model.write.base_commit_signature ? (
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={getExplorerUrl(`/tx/${model.write.base_commit_signature}`)}
            >
              View canonical settlement
            </a>
          ) : (
            `Settlement status: ${model.write.status}`
          )}
        </p>
      )}
    </section>
  );
}
