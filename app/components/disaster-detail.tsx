"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCluster } from "../components/cluster-context";
import { useWallet } from "../lib/wallet/context";
import { organizationPda } from "../lib/organizations/chain";
import { displaySol } from "../lib/campaigns/amount";

type Detail = {
  id: string;
  title: string;
  status: string;
  provider: string;
  external_id: string;
  location: string;
  disaster_type: string;
  occurred_at: string | null;
  normalized: Record<string, unknown>;
  organization_address?: string;
  proposal?: { goalLamports?: string };
  metadata_uri?: string;
  metadata_digest?: string;
  metadataState: string;
  campaign_address?: string;
  create_signature?: string;
  observations: {
    provider: string;
    external_id: string;
    source_url: string;
    retrieved_at: string;
    occurred_at: string | null;
    payload_digest: string;
  }[];
  history: {
    action: string;
    actor: string | null;
    note: string | null;
    created_at: string;
    proposal?: { goalLamports?: string };
  }[];
};
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));

export function DisasterDetail({ role }: { role: "admin" | "organization" }) {
  const params = useParams<{ id: string }>();
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const [organization, setOrganization] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (role === "organization" && wallet?.account.address)
      void organizationPda(wallet.account.address).then(setOrganization);
  }, [role, wallet?.account.address]);
  const load = useCallback(async () => {
    if (!wallet?.signMessage || (role === "organization" && !organization))
      return;
    setLoading(true);
    setError("");
    try {
      const action =
        role === "admin" ? "view_admin_detail" : "view_organization_detail";
      const challengeResponse = await fetch("/api/disasters/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: wallet.account.address,
          action,
          candidateId: params.id,
        }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok)
        throw new Error(challenge.error || "Could not authorize detail view");
      const signed = await wallet.signMessage(
        new TextEncoder().encode(challenge.message)
      );
      if (new TextDecoder().decode(signed.message) !== challenge.message)
        throw new Error("Wallet returned a different signed message");
      const response = await fetch(`/api/disasters/${params.id}/detail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: wallet.account.address,
          nonce: challenge.nonce,
          message: challenge.message,
          signature: b64(signed.signature),
          cluster,
          role,
          ...(role === "organization" ? { organization } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load disaster detail");
      setDetail(body);
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Could not load disaster detail";
      setError(message);
      toast.error(
        message.includes("signature")
          ? "Wallet signature was rejected or expired."
          : "Disaster detail is unavailable."
      );
    } finally {
      setLoading(false);
    }
    // Signed authorization follows the active wallet, route, organization, and cluster.
  }, [wallet, cluster, params.id, role, organization]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const back = role === "admin" ? "/admin/disasters" : "/org/disasters";
  if (loading)
    return (
      <main className="mx-auto max-w-6xl px-5 py-10 text-sm text-muted-foreground">
        Loading protected disaster detail…
      </main>
    );
  if (error || !detail)
    return (
      <main className="mx-auto max-w-6xl space-y-4 px-5 py-10">
        <Link
          href={back}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" /> Disaster candidates
        </Link>
        <section className="rounded-xl border border-border bg-card p-6">
          <h1 className="font-serif text-3xl font-semibold">
            Detail unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "A signed authorized wallet is required."}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => void load()}
          >
            <RefreshCw /> Retry
          </Button>
        </section>
      </main>
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 lg:px-8">
      <Link
        href={back}
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> Disaster candidates
      </Link>
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  detail.status === "activated"
                    ? "verified"
                    : detail.status === "rejected"
                      ? "outline"
                      : "warning"
                }
              >
                {detail.status.replaceAll("_", " ")}
              </Badge>
              <Badge
                variant={
                  detail.metadataState === "verified" ? "verified" : "warning"
                }
              >
                Metadata {detail.metadataState.replaceAll("_", " ")}
              </Badge>
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold">
              {detail.title}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {detail.disaster_type} · {detail.location} · {detail.provider}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw /> Signed refresh
          </Button>
        </div>
        <dl className="mt-6 grid gap-5 border-y border-border py-5 text-sm sm:grid-cols-2">
          <Field label="External event ID" value={detail.external_id} />
          <Field
            label="Occurred"
            value={
              detail.occurred_at
                ? new Date(detail.occurred_at).toLocaleString()
                : "Unavailable"
            }
          />
          <Field
            label="Organization"
            value={detail.organization_address || "No organization request"}
          />
          <Field
            label="Goal"
            value={
              detail.proposal?.goalLamports
                ? `${displaySol(BigInt(detail.proposal.goalLamports))} SOL`
                : "Not requested"
            }
          />
          <Field
            label="Campaign metadata"
            value={detail.metadata_uri || "Not prepared"}
          />
          <Field
            label="Metadata digest"
            value={detail.metadata_digest || "Not prepared"}
          />
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          {detail.campaign_address && (
            <Button asChild variant="outline">
              <Link href={`/campaigns/${detail.campaign_address}`}>
                Open active campaign <ExternalLink />
              </Link>
            </Button>
          )}
          {detail.campaign_address && (
            <a
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-muted"
              target="_blank"
              rel="noreferrer"
              href={getExplorerUrl(`/address/${detail.campaign_address}`)}
            >
              Explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <h2 className="border-b border-border px-6 py-4 font-serif text-2xl font-semibold">
          Source provenance
        </h2>
        <div className="divide-y divide-border">
          {detail.observations.map((observation) => (
            <div
              key={`${observation.provider}-${observation.payload_digest}`}
              className="px-6 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">
                  {observation.provider} · {observation.external_id}
                </p>
                <a
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  href={observation.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source <ExternalLink className="size-3" />
                </a>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                Payload digest: {observation.payload_digest}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Retrieved {new Date(observation.retrieved_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <h2 className="border-b border-border px-6 py-4 font-serif text-2xl font-semibold">
          Recorded history
        </h2>
        <div className="divide-y divide-border">
          {detail.history.length ? (
            detail.history.map((entry, index) => (
              <div
                key={`${entry.action}-${entry.created_at}-${index}`}
                className="px-6 py-4"
              >
                <p className="font-medium capitalize">
                  {entry.action.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.actor || "System"} ·{" "}
                  {new Date(entry.created_at).toLocaleString()}
                </p>
                {entry.note && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {entry.note}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              No recorded human decisions yet.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 break-all text-sm">{value}</dd>
    </div>
  );
}
