"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { address } from "@solana/kit";
import { MapPin, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCluster } from "../components/cluster-context";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import {
  fetchOrganization,
  organizationPda,
  rpcCall,
} from "../lib/organizations/chain";
import {
  createCampaignIx,
  listCampaigns,
  type CampaignStatus,
} from "../lib/campaigns/chain";
import { displaySol, parseSolAmount } from "../lib/campaigns/amount";
import {
  campaignProgress,
  resolveCampaignPresentation,
  type CampaignPresentation,
} from "../lib/campaigns/view-model";

const statuses: Array<"all" | CampaignStatus> = [
  "all",
  "Draft",
  "PendingReview",
  "Active",
  "Paused",
  "Closed",
];

export default function CampaignsPage() {
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const [items, setItems] = useState<CampaignPresentation[]>([]);
  const [orgs, setOrgs] = useState<
    Awaited<ReturnType<typeof fetchOrganization>>[]
  >([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CampaignStatus>("all");
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    org: "",
    title: "",
    description: "",
    disasterType: "",
    location: "",
    goal: "",
  });
  const refresh = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") {
      setUnavailable(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setUnavailable(false);
    try {
      const campaigns = await listCampaigns(cluster);
      setItems(await Promise.all(campaigns.map(resolveCampaignPresentation)));
      if (walletAddress) {
        const mine = await fetchOrganization(
          cluster,
          await organizationPda(address(walletAddress))
        );
        const next = mine?.authority === walletAddress ? [mine] : [];
        setOrgs(next);
        setForm((current) =>
          current.org || !next[0]
            ? current
            : { ...current, org: next[0].address }
        );
      } else setOrgs([]);
    } catch {
      setUnavailable(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [cluster, walletAddress]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const eligibleOrgs = orgs.filter(
    (org) => org?.verified && org.status === "Active"
  );
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (status === "all" || item.campaign.status === status) &&
          item.title.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [items, query, status]
  );
  const create = async () => {
    try {
      if (!walletAddress) throw new Error("Connect an organization wallet");
      const organization = eligibleOrgs.find(
        (item) => item?.address === form.org
      );
      if (!organization)
        throw new Error("Choose an active, verified organization");
      if (
        !form.title ||
        !form.description ||
        !form.disasterType ||
        !form.location ||
        !form.goal
      )
        throw new Error("Complete every campaign field");
      toast.loading("Saving immutable campaign metadata…", {
        id: "campaign-create",
      });
      const response = await fetch("/api/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "campaign",
          metadata: {
            title: form.title,
            description: form.description,
            disasterType: form.disasterType,
            location: form.location,
          },
        }),
      });
      const metadata = await response.json();
      if (!response.ok)
        throw new Error(metadata.error || "Could not save metadata");
      toast.loading("Awaiting wallet signature…", { id: "campaign-create" });
      const signature = await send({
        instructions: [
          await createCampaignIx(
            organization.address,
            address(walletAddress),
            organization.nextCampaignId,
            parseSolAmount(form.goal),
            null,
            metadata.digest,
            metadata.uri
          ),
        ],
      });
      for (let attempt = 0; attempt < 30; attempt++) {
        const result = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [signature],
          { searchTransactionHistory: true },
        ]);
        if (result.value[0]?.err)
          throw new Error("Campaign transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            result.value[0]?.confirmationStatus || ""
          )
        ) {
          toast.success("Campaign created as a draft.", {
            id: "campaign-create",
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
          setOpen(false);
          setForm({
            org: organization.address,
            title: "",
            description: "",
            disasterType: "",
            location: "",
            goal: "",
          });
          await refresh();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Transaction submitted; check Explorer for confirmation");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create campaign",
        { id: "campaign-create" }
      );
    }
  };
  return (
    <main className="min-h-full bg-background px-6 py-10 md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-border pb-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {items.length} canonical campaigns on {cluster}
              </p>
              <h1 className="mt-2 font-serif text-5xl font-semibold tracking-tight">
                Relief campaigns
              </h1>
              <p className="mt-3 text-muted-foreground">
                Explore urgent work, inspect every fund trail, and donate with
                complete visibility.
              </p>
            </div>
            {eligibleOrgs.length > 0 && (
              <Button onClick={() => setOpen(true)}>
                <Plus /> Create campaign
              </Button>
            )}
          </div>
        </header>
        <section className="mt-6 flex flex-wrap gap-3 rounded-xl border border-border bg-card p-3">
          <label className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campaign name"
              aria-label="Search campaign name"
            />
          </label>
          <select
            className="h-8 rounded-md border border-border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            aria-label="Campaign status"
          >
            {statuses.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "all" ? "All statuses" : entry}
              </option>
            ))}
          </select>
        </section>
        <p className="mt-7 text-sm font-medium">
          {filtered.length} campaign{filtered.length === 1 ? "" : "s"}
        </p>
        {unavailable ? (
          <div className="mt-5 rounded-xl border border-border bg-card p-6 text-sm">
            Canonical campaign records are temporarily unavailable. Try
            refreshing after the selected Solana RPC is ready.
          </div>
        ) : loading ? (
          <div className="mt-5 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading canonical campaigns…
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-5 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No campaigns match this search and status.
          </div>
        ) : (
          <section className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const progress = campaignProgress(item.campaign);
              return (
                <Link
                  key={item.campaign.address}
                  href={`/campaigns/${item.campaign.address}`}
                  className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative aspect-[16/9]">
                    <Badge
                      className="absolute top-3 left-3"
                      variant={
                        item.campaign.status === "Active"
                          ? "verified"
                          : "warning"
                      }
                    >
                      {item.campaign.status}
                    </Badge>
                  </div>
                  <div className="p-5">
                    <h2 className="font-serif text-2xl font-semibold group-hover:text-primary">
                      {item.title}
                    </h2>
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {item.location}
                    </p>
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    {item.metadataState !== "verified" && (
                      <p className="mt-2 text-xs text-amber-800">
                        Metadata{" "}
                        {item.metadataState === "digest_mismatch"
                          ? "digest mismatch"
                          : "unavailable"}
                        ; canonical amounts remain shown.
                      </p>
                    )}
                    <div className="mt-5 flex items-end justify-between">
                      <div>
                        <p className="font-serif text-xl font-semibold">
                          {displaySol(item.campaign.amountRaised)} SOL
                        </p>
                        <p className="text-xs text-muted-foreground">
                          of {displaySol(item.campaign.targetAmount)} SOL
                        </p>
                      </div>
                      <span className="text-sm font-semibold">{progress}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                      <span>
                        {item.campaign.nextDonationId.toString()} donation
                        {item.campaign.nextDonationId === 1n ? "" : "s"}
                      </span>
                      <span>
                        {item.campaign.organization.slice(0, 5)}…
                        {item.campaign.organization.slice(-4)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create campaign</DialogTitle>
            <DialogDescription>
              Campaign details are stored as immutable, digest-verified metadata
              before your wallet transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 space-y-3">
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={form.org}
              onChange={(event) =>
                setForm({ ...form, org: event.target.value })
              }
            >
              {eligibleOrgs.map((org) => (
                <option key={org!.address} value={org!.address}>
                  {org!.address}
                </option>
              ))}
            </select>
            <Input
              placeholder="Campaign title"
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm"
              placeholder="Description"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
            <Input
              placeholder="Disaster type"
              value={form.disasterType}
              onChange={(event) =>
                setForm({ ...form, disasterType: event.target.value })
              }
            />
            <Input
              placeholder="Location"
              value={form.location}
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
            />
            <Input
              placeholder="Goal in SOL"
              inputMode="decimal"
              value={form.goal}
              onChange={(event) =>
                setForm({ ...form, goal: event.target.value })
              }
            />
            <Button
              className="w-full"
              disabled={isSending}
              onClick={() => void create()}
            >
              Create draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
