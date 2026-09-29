"use client";

import { useCallback, useEffect, useState } from "react";
import { useCluster } from "../../components/cluster-context";
import { WalletButton } from "../../components/wallet-button";
import { useWallet } from "../../lib/wallet/context";
import { fetchAdmin } from "../../lib/organizations/chain";
import {
  parseFindings,
  parseSubject,
  type FraudDisposition,
  type FraudFinding,
  type FraudSubject,
} from "../../lib/fraud-types";

const dispositions: Array<[FraudDisposition, string]> = [
  ["needs_investigation", "Needs investigation"],
  ["confirmed_fraud", "Confirmed fraud"],
  ["false_positive", "False positive"],
];

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : "Fraud service request failed";
    throw new Error(message);
  }
  return body;
}

export default function FraudDashboard() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const walletAddress = wallet?.account.address;
  const supported = cluster === "devnet" || cluster === "localnet";
  const [adminState, setAdminState] = useState<"loading" | "allowed" | "denied">("loading");
  const [health, setHealth] = useState<"loading" | "ready" | "unavailable">("loading");
  const [findings, setFindings] = useState<FraudFinding[]>([]);
  const [severity, setSeverity] = useState<"" | "medium" | "high">("");
  const [subject, setSubject] = useState<FraudSubject | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewChoices, setReviewChoices] = useState<Record<string, FraudDisposition>>({});

  const loadFindings = useCallback(async () => {
    if (!supported || adminState !== "allowed") return;
    setLoading(true);
    try {
      const query = new URLSearchParams({ cluster });
      if (severity) query.set("severity", severity);
      setFindings(parseFindings(await responseJson(await fetch(`/api/fraud/findings?${query}`))));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load advisory findings");
    } finally { setLoading(false); }
  }, [adminState, cluster, severity, supported]);

  useEffect(() => {
    let active = true;
    if (!walletAddress || !supported) {
      const timer = window.setTimeout(() => { if (active) setAdminState("denied"); }, 0);
      return () => { active = false; window.clearTimeout(timer); };
    }
    void fetchAdmin(cluster).then((admin) => {
      if (active) setAdminState(admin === walletAddress ? "allowed" : "denied");
    }).catch(() => { if (active) setAdminState("denied"); });
    return () => { active = false; };
  }, [cluster, supported, walletAddress]);

  useEffect(() => { void loadFindings(); }, [loadFindings]);
  useEffect(() => {
    if (adminState !== "allowed") return;
    void fetch("/api/fraud/health").then((response) => response.ok ? setHealth("ready") : setHealth("unavailable")).catch(() => setHealth("unavailable"));
  }, [adminState]);

  const runScoring = async () => {
    setLoading(true); setMessage("");
    try {
      const result = await responseJson(await fetch("/api/fraud/evaluations/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cluster }) })) as { evaluations_created?: number; evaluations_reused?: number };
      setMessage(`Advisory scoring completed: ${result.evaluations_created || 0} new, ${result.evaluations_reused || 0} reused. No Solana transaction was created.`);
      await loadFindings();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Scoring failed"); }
    finally { setLoading(false); }
  };
  const loadSubject = async (address: string) => {
    setLoading(true); setMessage("");
    try { setSubject(parseSubject(await responseJson(await fetch(`/api/fraud/subjects/${address}?cluster=${cluster}`)))); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load subject"); }
    finally { setLoading(false); }
  };
  const review = async (finding: FraudFinding) => {
    setLoading(true); setMessage("");
    try {
      await responseJson(await fetch(`/api/fraud/findings/${finding.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewer: walletAddress, disposition: reviewChoices[finding.id] || "needs_investigation", note: reviewNotes[finding.id] || "" }) }));
      setMessage("Advisory review saved in PostgreSQL. No Solana state changed.");
      await loadFindings();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save review"); }
    finally { setLoading(false); }
  };

  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Fraud review</h1><p className="text-sm text-muted">Explainable, advisory risk indicators from finalized indexed data.</p></div><WalletButton /></header>
    {!supported && <p role="alert" className="rounded border p-4">Fraud review is available only on Devnet and localnet.</p>}
    {supported && adminState === "loading" && <p className="rounded border p-4">Checking the GlobalConfig admin wallet…</p>}
    {supported && adminState === "denied" && <p role="alert" className="rounded border p-4">Only the connected GlobalConfig admin wallet can view advisory fraud findings in this demo.</p>}
    {adminState === "allowed" && <>
      <section className="rounded-xl border p-4"><p className="font-medium">Service: {health === "ready" ? "Ready" : health === "unavailable" ? "Unavailable" : "Checking"}</p><p className="mt-1 text-sm text-muted">Cluster: {cluster}. This dashboard cannot sign, send, or change Solana transactions.</p></section>
      <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4"><label className="text-sm">Severity<select className="ml-2 rounded border p-2" value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="">Medium and high</option><option value="medium">Medium</option><option value="high">High</option></select></label><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={loading || health !== "ready"} onClick={runScoring}>Run advisory scoring</button><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={loading} onClick={() => void loadFindings()}>Refresh findings</button></section>
      {message && <p role="status" className="rounded border p-3">{message}</p>}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Findings</h2>{loading && <p>Loading…</p>}{!loading && findings.length === 0 && <p className="rounded border p-4 text-sm text-muted">No medium or high advisory findings exist for this finalized checkpoint.</p>}{findings.map((finding) => <article className="space-y-3 rounded-xl border p-4" key={finding.id}><div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{finding.risk_band.toUpperCase()} risk · score {finding.score}/100</p><p className="break-all text-sm text-muted">Subject: {finding.subject_address}</p></div><span className="text-sm">{finding.status}</span></div><ul className="list-disc space-y-1 pl-5 text-sm">{finding.reasons.map((reason) => <li key={reason.code}>{reason.message} (+{reason.weight}) {reason.source_addresses.length > 0 && <span className="break-all text-muted">— {reason.source_addresses.join(", ")}</span>}</li>)}</ul><div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-2" onClick={() => void loadSubject(finding.subject_address)}>View immutable snapshot</button><select className="rounded border p-2" value={reviewChoices[finding.id] || "needs_investigation"} onChange={(event) => setReviewChoices((current) => ({ ...current, [finding.id]: event.target.value as FraudDisposition }))}>{dispositions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={loading} onClick={() => void review(finding)}>Save review</button></div><textarea className="w-full rounded border p-2 text-sm" placeholder="Optional reviewer note" value={reviewNotes[finding.id] || ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [finding.id]: event.target.value }))} /></article>)}</section>
      {subject && <section className="space-y-3 rounded-xl border p-4"><h2 className="text-xl font-semibold">Subject snapshot</h2><p className="break-all text-sm">{subject.subject_address} · {subject.risk_band} · {subject.score}/100 · {subject.model_version}</p><p className="break-all text-sm text-muted">Finalized checkpoint: {subject.checkpoint_slot}{subject.checkpoint_signature ? ` · ${subject.checkpoint_signature}` : ""}</p><pre className="max-h-96 overflow-auto rounded border p-3 text-xs">{JSON.stringify(subject.features, null, 2)}</pre></section>}
    </>}
  </main>;
}
