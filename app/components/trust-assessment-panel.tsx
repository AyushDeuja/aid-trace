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
};
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
          });
        setModel({
          state: body.state,
          evaluation: body.evaluation ? parseSubject(body.evaluation) : null,
          write: body.write ? parseTrustWriteStatus(body.write) : null,
        });
      })
      .catch(
        () =>
          live &&
          setModel({ state: "unavailable", evaluation: null, write: null })
      );
    return () => {
      live = false;
    };
  }, [campaign, cluster]);
  const state = model?.state ?? "realtime_pending";
  return (
    <section className="space-y-2 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Trust assessment</h2>
      {model?.evaluation ? (
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
