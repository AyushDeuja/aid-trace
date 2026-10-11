"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { address } from "@solana/kit";
import { ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import {
  fetchAdmin,
  fetchOrganization,
  rpcCall,
} from "../../lib/organizations/chain";
import {
  donateIx,
  fetchCampaign,
  setCampaignStatusIx,
  submitCampaignIx,
  updateCampaignIx,
  vaultPda,
} from "../../lib/campaigns/chain";
import { displaySol, parseSolAmount } from "../../lib/campaigns/amount";
import {
  campaignAvailable,
  campaignProgress,
  resolveCampaignPresentation,
  type CampaignPresentation,
} from "../../lib/campaigns/view-model";
import { TrustAssessmentPanel } from "../../components/trust-assessment-panel";

type History = {
  allocations: Array<Record<string, unknown>>;
  disbursements: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  verifications: Array<Record<string, unknown>>;
};
const tabs = [
  "Overview",
  "Allocations",
  "Disbursements",
  "Evidence",
  "Edit",
] as const;

export default function CampaignDetailPage() {
  const params = useParams<{ address: string }>();
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const [view, setView] = useState<CampaignPresentation | null>(null);
  const [vault, setVault] = useState("");
  const [admin, setAdmin] = useState<string | null>(null);
  const [orgAuthority, setOrgAuthority] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [amount, setAmount] = useState("");
  const [goal, setGoal] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    disasterType: "",
    location: "",
  });
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [loading, setLoading] = useState(true);
  const campaign = view?.campaign ?? null;
  const refresh = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") return;
    setLoading(true);
    try {
      const next = await fetchCampaign(cluster, address(params.address));
      if (!next) {
        setView(null);
        return;
      }
      const presentation = await resolveCampaignPresentation(next);
      setView(presentation);
      setVault(await vaultPda(next.address));
      setGoal(displaySol(next.targetAmount));
      setForm({
        title: presentation.metadata?.title || "",
        description: presentation.metadata?.description || "",
        disasterType: presentation.metadata?.disasterType || "",
        location: presentation.metadata?.location || "",
      });
      const [nextAdmin, organization] = await Promise.all([
        fetchAdmin(cluster),
        fetchOrganization(cluster, next.organization),
      ]);
      setAdmin(nextAdmin);
      setOrgAuthority(organization?.authority || null);
      fetch(`/api/finance/history?campaign=${next.address}`)
        .then(async (response) => {
          if (!response.ok) throw new Error();
          setHistory(await response.json());
          setHistoryUnavailable(false);
        })
        .catch(() => {
          setHistory(null);
          setHistoryUnavailable(true);
        });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load campaign"
      );
    } finally {
      setLoading(false);
    }
  }, [cluster, params.address]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const transact = async (
    build: () => Promise<Parameters<typeof send>[0]["instructions"][number]>,
    success: string
  ) => {
    try {
      toast.loading("Awaiting wallet signature…", { id: "campaign-action" });
      const signature = await send({ instructions: [await build()] });
      for (let attempt = 0; attempt < 30; attempt++) {
        const result = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [signature],
          { searchTransactionHistory: true },
        ]);
        if (result.value[0]?.err)
          throw new Error("Transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            result.value[0]?.confirmationStatus || ""
          )
        ) {
          toast.success(success, {
            id: "campaign-action",
            action: {
              label: "Explorer",
              onClick: () =>
                window.open(
                  getExplorerUrl(`/tx/${signature}`),
                  "_blank",
                  "noopener,noreferrer"
                ),
            },
          });
          await refresh();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Transaction submitted; check Explorer for confirmation");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Campaign transaction failed",
        { id: "campaign-action" }
      );
    }
  };
  const update = async () => {
    if (!campaign || !walletAddress) return;
    try {
      const response = await fetch("/api/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "campaign", metadata: form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await transact(
        () =>
          updateCampaignIx(
            campaign,
            address(walletAddress),
            parseSolAmount(goal),
            campaign.endsAt,
            data.digest,
            data.uri
          ),
        "Campaign updated"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update campaign"
      );
    }
  };
  const isAuthority = Boolean(walletAddress && walletAddress === orgAuthority);
  const isAdmin = Boolean(walletAddress && walletAddress === admin);
  const progress = campaign ? campaignProgress(campaign) : 0;
  if (loading)
    return (
      <main className="px-6 py-10">
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading canonical campaign…
        </p>
      </main>
    );
  if (!campaign || !view)
    return (
      <main className="px-6 py-10">
        <p className="rounded-xl border border-border bg-card p-6">
          Campaign not found or unavailable on this cluster.
        </p>
      </main>
    );
  const panel =
    tab === "Overview" ? (
      <>
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-serif text-2xl font-semibold">Funding</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Raised", campaign.amountRaised],
              ["Goal", campaign.targetAmount],
              ["Reserved", campaign.amountReserved],
              ["Available", campaignAvailable(campaign)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="border-l-2 border-primary pl-3"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-serif text-2xl font-semibold">
                  {displaySol(value as bigint)} SOL
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-serif text-2xl font-semibold">
            Public audit trail
          </h2>
          {historyUnavailable ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Indexed finance history is unavailable. Canonical funding amounts
              remain visible.
            </p>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              <p>{history?.allocations.length || 0} recorded allocations</p>
              <p>{history?.disbursements.length || 0} recorded disbursements</p>
              <p>{history?.evidence.length || 0} linked evidence records</p>
              <p>
                {history?.verifications.length || 0} delivery verification
                records
              </p>
            </div>
          )}
        </section>
      </>
    ) : tab === "Edit" ? (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-serif text-2xl font-semibold">Campaign edit</h2>
        {isAuthority ? (
          <div className="mt-4 space-y-3">
            <Input
              value={form.title}
              aria-label="Campaign title"
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm"
              value={form.description}
              aria-label="Campaign description"
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
            <Input
              value={form.disasterType}
              aria-label="Disaster type"
              onChange={(event) =>
                setForm({ ...form, disasterType: event.target.value })
              }
            />
            <Input
              value={form.location}
              aria-label="Location"
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
            />
            <Input
              value={goal}
              aria-label="Goal in SOL"
              onChange={(event) => setGoal(event.target.value)}
            />
            <div className="flex gap-2">
              <Button disabled={isSending} onClick={() => void update()}>
                Save update
              </Button>
              <Button
                variant="outline"
                disabled={isSending || campaign.status !== "Draft"}
                onClick={() =>
                  void transact(
                    () => submitCampaignIx(campaign, address(walletAddress!)),
                    "Submitted for review"
                  )
                }
              >
                Submit for review
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Only the canonical organization authority can edit this campaign.
          </p>
        )}
      </section>
    ) : (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-serif text-2xl font-semibold">{tab}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tab} are managed in the dedicated organization workspace. This
          read-only summary uses currently indexed records.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/org/finance?campaign=${campaign.address}`}>
              Open finance
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/org/verification?campaign=${campaign.address}`}>
              Open verification
            </Link>
          </Button>
        </div>
      </section>
    );
  return (
    <main className="min-h-full bg-background px-6 py-10 md:px-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/campaigns" className="text-sm underline">
          Campaigns
        </Link>
        <section className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="relative overflow-hidden rounded-xl">
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white">
                <Badge
                  variant={
                    campaign.status === "Active" ? "verified" : "warning"
                  }
                >
                  {campaign.status}
                </Badge>
                <h1 className="mt-3 font-serif text-4xl font-semibold">
                  {view.title}
                </h1>
                <p className="mt-2 flex items-center gap-1 text-sm">
                  <MapPin className="size-4" />
                  {view.location} · {view.disasterType}
                </p>
              </div>
            </div>
            <p className="mt-4 text-muted-foreground">{view.description}</p>
            {view.metadataState !== "verified" && (
              <p className="mt-2 text-sm text-amber-800">
                Campaign metadata is{" "}
                {view.metadataState === "digest_mismatch"
                  ? "not digest-verified"
                  : "unavailable"}
                . Canonical state below remains authoritative.
              </p>
            )}
          </div>
          <aside className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Canonical funding</p>
            <p className="mt-1 font-serif text-4xl font-semibold">
              {displaySol(campaign.amountRaised)}{" "}
              <span className="text-lg">SOL</span>
            </p>
            <p className="text-xs text-muted-foreground">
              of {displaySol(campaign.targetAmount)} SOL · {progress}%
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${progress}%` }}
              />
            </div>
            {walletAddress && !isAuthority && !isAdmin && (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                <label className="text-sm font-medium">Donate SOL</label>
                <Input
                  inputMode="decimal"
                  placeholder="Amount in SOL"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={
                    isSending || !amount || campaign.status !== "Active"
                  }
                  onClick={() =>
                    void transact(
                      () =>
                        donateIx(
                          campaign,
                          address(walletAddress),
                          parseSolAmount(amount)
                        ),
                      "Donation confirmed"
                    )
                  }
                >
                  Donate with wallet
                </Button>
              </div>
            )}
            {!walletAddress && (
              <p className="mt-5 text-sm text-muted-foreground">
                Connect a wallet to donate to an Active campaign.
              </p>
            )}
          </aside>
        </section>
        <section className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
          {tabs
            .filter((entry) => entry !== "Edit" || isAuthority)
            .map((entry) => (
              <Button
                key={entry}
                size="sm"
                variant={tab === entry ? "default" : "outline"}
                onClick={() => setTab(entry)}
              >
                {entry}
              </Button>
            ))}
        </section>
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">{panel}</div>
          <aside className="space-y-5">
            <TrustAssessmentPanel campaign={campaign.address} />
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-serif text-xl font-semibold">
                Technical identifiers
              </h2>
              <dl className="mt-3 space-y-3 break-all text-xs">
                <div>
                  <dt className="text-muted-foreground">Campaign</dt>
                  <dd>{campaign.address}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Vault</dt>
                  <dd>{vault}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Metadata digest</dt>
                  <dd>{campaign.metadataDigest}</dd>
                </div>
              </dl>
              <a
                className="mt-4 inline-flex items-center gap-1 text-sm underline"
                target="_blank"
                rel="noreferrer"
                href={getExplorerUrl(`/address/${campaign.address}`)}
              >
                View on explorer <ExternalLink className="size-3" />
              </a>
            </section>
            {isAdmin && (
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-serif text-xl font-semibold">
                  Admin lifecycle
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["Active", "Paused", "Closed"] as const).map((next) => (
                    <Button
                      key={next}
                      variant="outline"
                      size="sm"
                      disabled={isSending || campaign.status === next}
                      onClick={() =>
                        void transact(
                          () =>
                            setCampaignStatusIx(
                              campaign,
                              address(walletAddress!),
                              next
                            ),
                          `Campaign ${next.toLowerCase()}`
                        )
                      }
                    >
                      {next}
                    </Button>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
