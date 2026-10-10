"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { address, type Instruction } from "@solana/kit";
import {
  Activity,
  AlertTriangle,
  Building2,
  ExternalLink,
  Flag,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import {
  fetchAdmin,
  rpcCall,
  setStatusIx,
  setVerifiedIx,
  type OrganizationAccount,
} from "../../lib/organizations/chain";
import { setCampaignStatusIx, type Campaign } from "../../lib/campaigns/chain";
import { displaySol } from "../../lib/campaigns/amount";
import { resolveFraudFlagIx } from "../../lib/trust-chain";
import { toast } from "sonner";

type MetadataReview = {
  state: "verified" | "digest_mismatch" | "unavailable" | "unlinked";
};
type FraudFlagReview = {
  address: string;
  resolution: "open" | "resolved" | "dismissed";
  score: number;
};
type OrganizationReview = Partial<OrganizationAccount> & {
  address: string;
  unavailable?: boolean;
  error?: string;
  metadata?: MetadataReview;
  sourceSignature?: string | null;
};
type CampaignReview = Partial<Campaign> & {
  address: string;
  unavailable?: boolean;
  error?: string;
  metadata?: MetadataReview;
  sourceSignature?: string | null;
  fraudFlag?: FraudFlagReview | null;
};
type DisasterReview = {
  id: string;
  title: string;
  disaster_type: string;
  location: string;
};
type Decision = {
  id: string;
  kind: "disaster" | "fraud";
  action: string;
  actor: string | null;
  note: string | null;
  title: string;
  createdAt: string;
};
type Health = {
  database: "available" | "unavailable";
  canonical: "available" | "degraded" | "unavailable";
  fraud: "available" | "unavailable";
};
type Review = {
  organizations: OrganizationReview[];
  campaigns: CampaignReview[];
  disasters: DisasterReview[];
  decisions: Decision[];
  health: Health;
};

const emptyReview = (): Review => ({
  organizations: [],
  campaigns: [],
  disasters: [],
  decisions: [],
  health: {
    database: "unavailable",
    canonical: "unavailable",
    fraud: "unavailable",
  },
});
const label = (value: string) => value.replaceAll("_", " ");
const metadataBadge = (state?: MetadataReview["state"]) => {
  if (state === "verified")
    return <Badge variant="verified">Metadata verified</Badge>;
  if (state === "digest_mismatch")
    return <Badge variant="warning">Digest mismatch</Badge>;
  if (state === "unlinked")
    return <Badge variant="outline">Metadata unlinked</Badge>;
  return <Badge variant="warning">Metadata unavailable</Badge>;
};
const shortError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  if (/InvalidStatusTransition|status transition/i.test(message))
    return "This record cannot move to that status.";
  if (/OrganizationNotActive|organization is not active/i.test(message))
    return "Activate the organization before creating a campaign.";
  if (/Invalid wallet signature|signature/i.test(message))
    return "Wallet signature was rejected or expired.";
  if (/timed out/i.test(message))
    return "Confirmation timed out. Refresh before retrying.";
  if (/message signing/i.test(message))
    return "Use an admin wallet that supports message signing.";
  return fallback;
};

export default function AdminReviewPage() {
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Review>(emptyReview);
  const walletAddress = wallet?.account.address;

  const load = useCallback(async () => {
    if (!allowed || !wallet?.signMessage || !walletAddress) {
      setData(emptyReview());
      throw new Error(
        "A connected admin wallet with message signing is required"
      );
    }
    setLoading(true);
    try {
      const challengeResponse = await fetch("/api/admin/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          action: "read_review_queue",
        }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok)
        throw new Error(challenge.error || "Could not authorize review queue");
      const signed = await wallet.signMessage(
        new TextEncoder().encode(challenge.message)
      );
      if (new TextDecoder().decode(signed.message) !== challenge.message)
        throw new Error("Wallet returned a different signed message");
      const response = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          action: "read_review_queue",
          nonce: challenge.nonce,
          message: challenge.message,
          signature: btoa(String.fromCharCode(...signed.signature)),
          cluster,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setData(emptyReview());
        throw new Error(body.error || "Review data unavailable");
      }
      setData(body as Review);
    } finally {
      setLoading(false);
    }
  }, [allowed, cluster, wallet, walletAddress]);

  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      setData(emptyReview());
    });
    if (!walletAddress) {
      queueMicrotask(() => live && setAllowed(false));
      return () => {
        live = false;
      };
    }
    void fetchAdmin(cluster)
      .then((admin) => live && setAllowed(admin === walletAddress))
      .catch(() => live && setAllowed(false));
    return () => {
      live = false;
    };
  }, [cluster, walletAddress]);

  useEffect(() => {
    if (!allowed) return;
    const timer = window.setTimeout(() => {
      void load().catch((error) =>
        toast.error(
          shortError(error, "Review queue unavailable. Please try again.")
        )
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allowed, load]);

  const transact = async (
    build: () => Promise<Instruction>,
    action: string
  ) => {
    const toastId = toast.loading("Awaiting wallet approval");
    try {
      const signature = await send({ instructions: [await build()] });
      toast.loading("Transaction submitted. Confirming on Solana…", {
        id: toastId,
      });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const status = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [signature],
          { searchTransactionHistory: true },
        ]);
        if (status.value[0]?.err)
          throw new Error("Transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            status.value[0]?.confirmationStatus
          )
        ) {
          toast.success(`${action} confirmed.`, { id: toastId });
          await load();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Confirmation timed out; check explorer before retrying");
    } catch (error) {
      toast.error(
        shortError(
          error,
          "Transaction validation failed. Check the record and try again."
        ),
        { id: toastId }
      );
    }
  };

  const orgQueue = useMemo(
    () =>
      data.organizations.filter(
        (org) =>
          !org.unavailable &&
          (!org.verified ||
            org.status === "Pending" ||
            org.status === "Suspended")
      ),
    [data.organizations]
  );
  const campaignQueue = useMemo(
    () =>
      data.campaigns.filter(
        (campaign) =>
          !campaign.unavailable && campaign.status === "PendingReview"
      ),
    [data.campaigns]
  );
  const openFlags = useMemo(
    () =>
      data.campaigns.filter(
        (campaign) => campaign.fraudFlag?.resolution === "open"
      ),
    [data.campaigns]
  );
  const unavailableRecords = useMemo(
    () =>
      [...data.organizations, ...data.campaigns].filter(
        (record) => record.unavailable
      ),
    [data.campaigns, data.organizations]
  );
  const healthyServices = Object.values(data.health).filter(
    (state) => state === "available"
  ).length;

  if (!allowed)
    return (
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            Admin workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Operations overview
          </h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">
            Connect the canonical GlobalConfig admin wallet to access
            operational queues.
          </p>
        </div>
      </main>
    );

  const metrics = [
    {
      label: "Organizations to review",
      value: orgQueue.length,
      detail: "verification or activation",
      icon: Building2,
    },
    {
      label: "Disaster requests",
      value: data.disasters.length,
      detail: "awaiting review",
      icon: TriangleAlert,
    },
    {
      label: "Campaign activation",
      value: campaignQueue.length,
      detail: "pending lifecycle action",
      icon: ShieldCheck,
    },
    {
      label: "Open fraud flags",
      value: openFlags.length,
      detail: "canonical flags",
      icon: Flag,
    },
    {
      label: "System availability",
      value: `${healthyServices}/3`,
      detail: "services available",
      icon: Activity,
    },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-5 py-8 lg:px-8">
      <header className="border-b border-border pb-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
              <span className="h-px w-5 bg-primary" /> Admin
            </p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
              Operations overview
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Every queue that needs a human decision, reconciled against
              canonical Solana state.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={loading || isSending}
            onClick={() =>
              void load().catch((error) =>
                toast.error(
                  shortError(
                    error,
                    "Review queue unavailable. Please try again."
                  )
                )
              )
            }
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {loading ? "Authorizing refresh" : "Signed refresh"}
          </Button>
        </div>
      </header>
      <section
        aria-label="Operations metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {metrics.map(({ label: metricLabel, value, detail, icon: Icon }) => (
          <article
            key={metricLabel}
            className="min-h-31 border-l-2 border-primary bg-card px-5 py-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
              <span>{metricLabel}</span>
              <Icon className="size-4" />
            </div>
            <p className="mt-2 font-serif text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-serif text-2xl font-semibold">Review queues</h2>
            {loading && (
              <span className="text-xs text-muted-foreground">
                Loading canonical state…
              </span>
            )}
          </div>
          <div className="divide-y divide-border">
            <QueueLink
              href="#organization-review"
              label="Organization verification"
              count={orgQueue.length}
            />
            <QueueLink
              href="/admin/disasters"
              label="Disaster candidates"
              count={data.disasters.length}
            />
            <QueueLink
              href="#campaign-review"
              label="Campaign activation"
              count={campaignQueue.length}
            />
            <QueueLink
              href="#fraud-review"
              label="Fraud review"
              count={openFlags.length}
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-serif text-2xl font-semibold">
              Recent human decisions
            </h2>
          </div>
          <div className="divide-y divide-border">
            {data.decisions.length ? (
              data.decisions.slice(0, 5).map((decision) => (
                <article key={decision.id} className="px-5 py-3">
                  <p className="text-sm">
                    <span className="font-semibold capitalize">
                      {label(decision.action)}
                    </span>{" "}
                    — {decision.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {decision.actor || "Recorded reviewer"} ·{" "}
                    {new Date(decision.createdAt).toLocaleString()}
                  </p>
                  {decision.note && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {decision.note}
                    </p>
                  )}
                </article>
              ))
            ) : (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No persisted disaster or fraud-review decisions yet.
              </p>
            )}
          </div>
        </div>
      </section>
      <section id="organization-review" className="scroll-mt-24 space-y-3">
        <SectionHeading
          title="Organization review"
          detail="Canonical organization state and verified metadata"
        />
        {orgQueue.length ? (
          orgQueue.map((org) => (
            <article
              key={org.address}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={org.verified ? "verified" : "warning"}>
                      {org.verified ? "Verified" : "Unverified"}
                    </Badge>
                    <Badge variant="outline">
                      {org.status || "Unavailable"}
                    </Badge>
                    {metadataBadge(org.metadata?.state)}
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {org.address}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    On-chain digest: {org.metadataDigest || "Unavailable"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ExplorerLink
                    href={getExplorerUrl(`/address/${org.address}`)}
                    label="Explorer"
                  />
                  {org.sourceSignature && (
                    <ExplorerLink
                      href={getExplorerUrl(`/tx/${org.sourceSignature}`)}
                      label="Source transaction"
                    />
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSending}
                  onClick={() =>
                    void transact(
                      () =>
                        setVerifiedIx(
                          org as OrganizationAccount,
                          address(walletAddress!),
                          !org.verified
                        ),
                      org.verified
                        ? "Organization verification revoked"
                        : "Organization verified"
                    )
                  }
                >
                  {org.verified ? "Unverify" : "Verify"}
                </Button>
                {org.status !== "Closed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSending}
                    onClick={() =>
                      void transact(
                        () =>
                          setStatusIx(
                            org as OrganizationAccount,
                            address(walletAddress!),
                            org.status === "Active" ? "Suspended" : "Active"
                          ),
                        org.status === "Active"
                          ? "Organization suspended"
                          : "Organization activated"
                      )
                    }
                  >
                    {org.status === "Active" ? "Suspend" : "Activate"}
                  </Button>
                )}
              </div>
            </article>
          ))
        ) : (
          <EmptyQueue>
            No organizations currently require an admin action.
          </EmptyQueue>
        )}
      </section>
      <section id="campaign-review" className="scroll-mt-24 space-y-3">
        <SectionHeading
          title="Campaign lifecycle"
          detail="Only canonical valid transitions are available"
        />
        {campaignQueue.length ? (
          campaignQueue.map((campaign) => (
            <CampaignCard
              key={campaign.address}
              campaign={campaign}
              walletAddress={walletAddress!}
              isSending={isSending}
              getExplorerUrl={getExplorerUrl}
              transact={transact}
            />
          ))
        ) : (
          <EmptyQueue>
            No submitted campaigns are awaiting lifecycle review.
          </EmptyQueue>
        )}
      </section>
      <section id="fraud-review" className="scroll-mt-24 space-y-3">
        <SectionHeading
          title="Canonical FraudFlags"
          detail="Advisory findings require an explicit admin transaction"
        />
        {openFlags.length ? (
          openFlags.map((campaign) => (
            <article
              key={campaign.address}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Badge variant="warning">
                    Open flag · {campaign.fraudFlag?.score}/100
                  </Badge>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    Campaign: {campaign.address}
                  </p>
                </div>
                <ExplorerLink
                  href={getExplorerUrl(
                    `/address/${campaign.fraudFlag?.address}`
                  )}
                  label="Flag on explorer"
                />
              </div>
              <div className="mt-4 flex gap-2 border-t border-border pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSending}
                  onClick={() =>
                    void transact(
                      () =>
                        resolveFraudFlagIx(
                          address(campaign.fraudFlag!.address),
                          address(walletAddress!),
                          "resolved"
                        ),
                      "FraudFlag resolved"
                    )
                  }
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSending}
                  onClick={() =>
                    void transact(
                      () =>
                        resolveFraudFlagIx(
                          address(campaign.fraudFlag!.address),
                          address(walletAddress!),
                          "dismissed"
                        ),
                      "FraudFlag dismissed"
                    )
                  }
                >
                  Dismiss
                </Button>
              </div>
            </article>
          ))
        ) : (
          <EmptyQueue>No canonical FraudFlags are currently open.</EmptyQueue>
        )}
      </section>
      {unavailableRecords.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            title="Availability notes"
            detail="These indexed records could not be re-read canonically; they are not actionable until the next signed refresh."
          />
          <div className="space-y-2">
            {unavailableRecords.map((record) => (
              <article
                key={record.address}
                className="rounded-xl border border-dashed border-border bg-card px-5 py-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs">
                      {record.address}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {record.error ||
                        "Canonical data is temporarily unavailable."}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function QueueLink({
  href,
  label: text,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  const content = (
    <>
      <span className="font-medium">{text}</span>
      <Badge variant={count ? "warning" : "outline"}>{count} open</Badge>
    </>
  );
  return href.startsWith("#") ? (
    <a
      href={href}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
    >
      {content}
    </a>
  ) : (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
    >
      {content}
    </Link>
  );
}
function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
function EmptyQueue({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border bg-card px-5 py-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
function ExplorerLink({ href, label: text }: { href: string; label: string }) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {text}
      <ExternalLink className="size-3" />
    </a>
  );
}
function CampaignCard({
  campaign,
  walletAddress,
  isSending,
  getExplorerUrl,
  transact,
}: {
  campaign: CampaignReview;
  walletAddress: string;
  isSending: boolean;
  getExplorerUrl: (path: string) => string;
  transact: (
    build: () => Promise<Instruction>,
    action: string
  ) => Promise<void>;
}) {
  const canonical = campaign as Campaign;
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">{campaign.status}</Badge>
            {metadataBadge(campaign.metadata?.state)}
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {campaign.address}
          </p>
          <p className="text-sm text-muted-foreground">
            Goal:{" "}
            {campaign.targetAmount === undefined
              ? "Unavailable"
              : `${displaySol(campaign.targetAmount)} SOL`}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            On-chain digest: {campaign.metadataDigest || "Unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExplorerLink
            href={getExplorerUrl(`/address/${campaign.address}`)}
            label="Explorer"
          />
          {campaign.sourceSignature && (
            <ExplorerLink
              href={getExplorerUrl(`/tx/${campaign.sourceSignature}`)}
              label="Source transaction"
            />
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          disabled={isSending}
          onClick={() =>
            void transact(
              () =>
                setCampaignStatusIx(
                  canonical,
                  address(walletAddress),
                  "Active"
                ),
              "Campaign activated"
            )
          }
        >
          Activate
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isSending}
          onClick={() =>
            void transact(
              () =>
                setCampaignStatusIx(
                  canonical,
                  address(walletAddress),
                  "Closed"
                ),
              "Campaign closed"
            )
          }
        >
          Close
        </Button>
      </div>
    </article>
  );
}
