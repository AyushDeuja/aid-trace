"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Eye,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { fetchAdmin, fetchTrustAuthority } from "../../lib/organizations/chain";
import {
  parseFindings,
  parseSubject,
  parseTrustWriteStatus,
  type FraudDisposition,
  type FraudFinding,
  type FraudSubject,
  type TrustWriteStatus,
} from "../../lib/fraud-types";

function shortAddress(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 5)}…${value.slice(-4)}`;
}

function relativeTime(value: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  );
  if (seconds < 60) return "updated just now";
  if (seconds < 3600) return `updated ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `updated ${Math.floor(seconds / 3600)}h ago`;
  return `updated ${Math.floor(seconds / 86400)}d ago`;
}

function riskVariant(risk: FraudFinding["risk_band"]) {
  return risk === "high"
    ? "warning"
    : risk === "medium"
      ? "warning"
      : "outline";
}

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
        ? body.error
        : "Fraud service request failed"
    );
  }
  return body;
}

export default function FraudDashboard() {
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const walletAddress = wallet?.account.address;
  const supported = cluster === "devnet" || cluster === "localnet";
  const [roles, setRoles] = useState({ admin: false, trustAuthority: false });
  const [roleState, setRoleState] = useState<"loading" | "allowed" | "denied">(
    "loading"
  );
  const [health, setHealth] = useState<"loading" | "ready" | "unavailable">(
    "loading"
  );
  const [findings, setFindings] = useState<FraudFinding[]>([]);
  const [severity, setSeverity] = useState<"" | "medium" | "high">("");
  const [subject, setSubject] = useState<FraudSubject | null>(null);
  const [loading, setLoading] = useState(false);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [operationAddress, setOperationAddress] = useState("");
  const [operation, setOperation] = useState<TrustWriteStatus | null>(null);

  const adminAuthorization = async (
    action: "review_finding" | "run_scoring",
    resourceId?: string
  ) => {
    if (!wallet?.signMessage || !walletAddress) {
      throw new Error("Connect an admin wallet that supports message signing");
    }
    const response = await fetch("/api/admin/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: walletAddress,
        action,
        ...(resourceId ? { resourceId } : {}),
      }),
    });
    const challenge = (await responseJson(response)) as {
      message: string;
      nonce: string;
    };
    const signed = await wallet.signMessage(
      new TextEncoder().encode(challenge.message)
    );
    if (new TextDecoder().decode(signed.message) !== challenge.message) {
      throw new Error("Wallet returned a different signed message");
    }
    return {
      wallet: walletAddress,
      action,
      resourceId,
      nonce: challenge.nonce,
      message: challenge.message,
      signature: btoa(String.fromCharCode(...signed.signature)),
      cluster,
    };
  };

  const loadFindings = useCallback(async () => {
    if (!supported || !roles.admin || roleState !== "allowed") return;
    setLoading(true);
    try {
      const query = new URLSearchParams({ cluster });
      if (severity) query.set("severity", severity);
      const result = parseFindings(
        await responseJson(await fetch(`/api/fraud/findings?${query}`))
      );
      setFindings(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load advisory findings"
      );
    } finally {
      setLoading(false);
    }
  }, [cluster, roleState, roles.admin, severity, supported]);

  useEffect(() => {
    let active = true;
    const reset = window.setTimeout(() => {
      if (!active) return;
      setFindings([]);
      setRoles({ admin: false, trustAuthority: false });
    }, 0);
    if (!walletAddress || !supported) {
      const deny = window.setTimeout(() => active && setRoleState("denied"), 0);
      return () => {
        active = false;
        window.clearTimeout(reset);
        window.clearTimeout(deny);
      };
    }
    const loading = window.setTimeout(
      () => active && setRoleState("loading"),
      0
    );
    void Promise.all([fetchAdmin(cluster), fetchTrustAuthority(cluster)])
      .then(([admin, trustAuthority]) => {
        if (!active) return;
        const next = {
          admin: admin === walletAddress,
          trustAuthority: trustAuthority === walletAddress,
        };
        setRoles(next);
        setRoleState(next.admin || next.trustAuthority ? "allowed" : "denied");
      })
      .catch(() => active && setRoleState("denied"));
    return () => {
      active = false;
      window.clearTimeout(reset);
      window.clearTimeout(loading);
    };
  }, [cluster, supported, walletAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFindings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadFindings]);

  useEffect(() => {
    if (roleState !== "allowed" || !roles.admin) return;
    void fetch("/api/fraud/health")
      .then((response) => setHealth(response.ok ? "ready" : "unavailable"))
      .catch(() => setHealth("unavailable"));
  }, [roleState, roles.admin]);

  const runScoring = async () => {
    setLoading(true);
    try {
      const result = (await responseJson(
        await fetch("/api/fraud/evaluations/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(await adminAuthorization("run_scoring")),
        })
      )) as { evaluations_created?: number; evaluations_reused?: number };
      toast.success(
        `Scoring complete: ${result.evaluations_created ?? 0} new, ${result.evaluations_reused ?? 0} reused.`
      );
      await loadFindings();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Advisory scoring could not run"
      );
    } finally {
      setLoading(false);
    }
  };

  const review = async (
    finding: FraudFinding,
    disposition: FraudDisposition
  ) => {
    setLoading(true);
    try {
      await responseJson(
        await fetch(`/api/fraud/findings/${finding.id}/review`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(await adminAuthorization("review_finding", finding.id)),
            disposition,
            note: reviewNotes[finding.id] || "",
          }),
        })
      );
      toast.success(
        "Advisory review saved. No Solana funds or lifecycle state changed."
      );
      await loadFindings();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save advisory review"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadSubject = async (address: string) => {
    setSubjectLoading(true);
    try {
      setSubject(
        parseSubject(
          await responseJson(
            await fetch(`/api/fraud/subjects/${address}?cluster=${cluster}`)
          )
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load immutable subject snapshot"
      );
    } finally {
      setSubjectLoading(false);
    }
  };

  const loadOperation = async () => {
    if (!operationAddress) return;
    try {
      setOperation(
        parseTrustWriteStatus(
          await responseJson(
            await fetch(
              `/api/fraud/subjects/${operationAddress}/trust?cluster=${cluster}`
            )
          )
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load trust operation"
      );
    }
  };

  const availability =
    health === "ready"
      ? "Scoring service available"
      : health === "unavailable"
        ? "Scoring service unavailable"
        : "Checking scoring service";

  return (
    <main className="min-h-full bg-[var(--background)] px-6 py-10 md:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="border-b border-[var(--border)] pb-7">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
            <span className="h-px w-5 bg-[var(--primary)]" /> Admin
          </div>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="font-serif text-5xl font-semibold tracking-tight text-[var(--foreground)]">
                Fraud review
              </h1>
              <p className="mt-3 max-w-3xl text-base text-[var(--muted-foreground)]">
                Explainable advisory signals from finalized data. Scores guide
                human review; they never move funds or change campaign lifecycle
                state.
              </p>
            </div>
            {roles.admin && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    health === "ready"
                      ? "verified"
                      : health === "unavailable"
                        ? "warning"
                        : "outline"
                  }
                >
                  {health === "ready" ? (
                    <ShieldCheck className="size-3" />
                  ) : (
                    <AlertTriangle className="size-3" />
                  )}
                  {availability}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => void loadFindings()}
                >
                  <RefreshCw className="size-4" /> Refresh
                </Button>
                <Button
                  size="sm"
                  disabled={loading || health !== "ready"}
                  onClick={() => void runScoring()}
                >
                  <Sparkles className="size-4" /> Run advisory scoring
                </Button>
              </div>
            )}
          </div>
        </header>

        {!supported && (
          <section
            role="alert"
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-sm"
          >
            Fraud review is available only on Devnet and localnet.
          </section>
        )}
        {supported && roleState === "loading" && (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted-foreground)]">
            Checking canonical admin permissions…
          </section>
        )}
        {supported && roleState === "denied" && (
          <section
            role="alert"
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-sm"
          >
            Connect the canonical GlobalConfig admin wallet to review advisory
            findings.
          </section>
        )}

        {roleState === "allowed" && roles.admin && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl font-semibold">
                  Review queue
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Only durable advisory findings are shown.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                Severity{" "}
                <select
                  className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3"
                  value={severity}
                  onChange={(event) =>
                    setSeverity(event.target.value as typeof severity)
                  }
                >
                  <option value="">Medium and high</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </section>
            {health === "unavailable" && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                The advisory scoring service is unavailable. Existing findings
                may be refreshed when the service returns.
              </section>
            )}
            <section className="space-y-4" aria-busy={loading}>
              {loading && findings.length === 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted-foreground)]">
                  Loading advisory findings…
                </div>
              )}
              {!loading && findings.length === 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted-foreground)]">
                  No {severity || "medium or high"} advisory findings exist for
                  the current finalized checkpoint.
                </div>
              )}
              {findings.map((finding) => {
                const strongest = finding.reasons[0];
                const sources = new Set(
                  finding.reasons.flatMap((reason) => reason.source_addresses)
                );
                return (
                  <article
                    key={finding.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-serif text-xl font-semibold">
                            {shortAddress(finding.subject_address)}
                          </h3>
                          <Badge variant={riskVariant(finding.risk_band)}>
                            {finding.risk_band} risk
                          </Badge>
                          <Badge variant="outline">
                            {finding.status === "open"
                              ? "Open review"
                              : "Reviewed"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                          {strongest?.message ||
                            "No explainable reason was recorded."}{" "}
                          · {relativeTime(finding.created_at)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline">
                            <Sparkles className="size-3" /> Score{" "}
                            {finding.score}/100
                          </Badge>
                          <Badge variant="outline">
                            Model {finding.model_version}
                          </Badge>
                          <Badge variant="outline">
                            {finding.reasons.length} reason
                            {finding.reasons.length === 1 ? "" : "s"} ·{" "}
                            {sources.size} source address
                            {sources.size === 1 ? "" : "es"}
                          </Badge>
                          <Badge variant="outline">Advisory only</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={subjectLoading}
                          onClick={() =>
                            void loadSubject(finding.subject_address)
                          }
                        >
                          <Eye className="size-4" /> Inspect
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loading}
                          onClick={() => void review(finding, "false_positive")}
                        >
                          Dismiss
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loading}
                          onClick={() =>
                            void review(finding, "needs_investigation")
                          }
                        >
                          Monitor
                        </Button>
                        <Button
                          size="sm"
                          disabled={loading}
                          onClick={() =>
                            void review(finding, "confirmed_fraud")
                          }
                        >
                          Escalate
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-[var(--border)] pt-3">
                      <button
                        className="flex items-center gap-1 text-sm font-medium text-[var(--muted-foreground)]"
                        onClick={() =>
                          setNoteOpen((current) => ({
                            ...current,
                            [finding.id]: !current[finding.id],
                          }))
                        }
                      >
                        Reviewer note{" "}
                        <ChevronDown
                          className={`size-4 transition-transform ${noteOpen[finding.id] ? "rotate-180" : ""}`}
                        />
                      </button>
                      {noteOpen[finding.id] && (
                        <textarea
                          className="mt-3 min-h-20 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                          placeholder="Optional note saved with this advisory review"
                          value={reviewNotes[finding.id] || ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [finding.id]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}

        {roleState === "allowed" && roles.trustAuthority && (
          <details className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <summary className="cursor-pointer font-serif text-xl font-semibold">
              Trust operations diagnostics
            </summary>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Restricted diagnostics for the configured trust authority. No
              credentials or worker secrets are displayed.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Input
                className="min-w-64 flex-1"
                placeholder="Campaign address"
                value={operationAddress}
                onChange={(event) =>
                  setOperationAddress(event.target.value.trim())
                }
              />
              <Button
                variant="outline"
                disabled={!operationAddress}
                onClick={() => void loadOperation()}
              >
                Load operation
              </Button>
            </div>
            {operation && (
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>Status: {operation.status}</div>
                <div>Attempts: {operation.attempts}/8</div>
                <div>
                  Expected sequence:{" "}
                  {operation.expected_sequence ?? "not assigned"}
                </div>
                <div>Outcome: {operation.action_outcome || "not checked"}</div>
                <div>ER signature: {operation.er_signature || "pending"}</div>
                <div>
                  Base signature: {operation.base_commit_signature || "pending"}
                </div>
              </dl>
            )}
          </details>
        )}
      </div>

      {subject && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subject-title"
        >
          <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                  Immutable subject snapshot
                </p>
                <h2
                  id="subject-title"
                  className="mt-1 break-all font-serif text-2xl font-semibold"
                >
                  {subject.subject_address}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close subject details"
                onClick={() => setSubject(null)}
              >
                ×
              </Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <p>
                Score <strong>{subject.score}/100</strong>
              </p>
              <p>
                Risk band{" "}
                <strong className="capitalize">{subject.risk_band}</strong>
              </p>
              <p>
                Model <strong>{subject.model_version}</strong>
              </p>
              <p>
                Finalized slot <strong>{subject.checkpoint_slot}</strong>
              </p>
            </div>
            {subject.checkpoint_signature && (
              <a
                className="mt-3 inline-flex items-center gap-1 text-sm underline"
                href={getExplorerUrl(`/tx/${subject.checkpoint_signature}`)}
                target="_blank"
                rel="noreferrer"
              >
                View finalized checkpoint <ExternalLink className="size-3" />
              </a>
            )}
            <section className="mt-6">
              <h3 className="font-serif text-xl font-semibold">
                Explainable reasons
              </h3>
              <ul className="mt-3 space-y-3">
                {subject.reasons.map((reason) => (
                  <li
                    key={reason.code}
                    className="rounded-lg border border-[var(--border)] p-3"
                  >
                    <p className="font-medium">
                      {reason.message}{" "}
                      <span className="text-[var(--muted-foreground)]">
                        (+{reason.weight})
                      </span>
                    </p>
                    {reason.source_addresses.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {reason.source_addresses.map((source) => (
                          <a
                            key={source}
                            className="inline-flex items-center gap-1 text-xs underline"
                            href={getExplorerUrl(`/address/${source}`)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {shortAddress(source)}{" "}
                            <ExternalLink className="size-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <details className="mt-6 rounded-lg border border-[var(--border)] p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Technical feature snapshot (admin only)
              </summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">
                {JSON.stringify(subject.features, null, 2)}
              </pre>
            </details>
          </section>
        </div>
      )}
    </main>
  );
}
