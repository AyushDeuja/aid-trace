"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Heart, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCluster } from "../components/cluster-context";
import { useWallet } from "../lib/wallet/context";
import { displaySol } from "../lib/campaigns/amount";

type Donation = {
  address: string;
  campaign: string;
  donor: string;
  amount: string;
  source: string;
  occurredAt: string;
  sourceSignature: string | null;
  indexedAt: string;
  metadata: { title: string; location: string } | null;
  metadataState: string;
  campaignState: string;
  campaignRaised: string;
  campaignTarget: string;
  campaignProgress: { allocated: string; disbursed: string; verified: string };
};
type Model = {
  donations: Donation[];
  checkpoint: { last_slot: string; indexed_at: string } | null;
};

const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-4)}`;
const asSol = (value: string) => displaySol(BigInt(value || "0"));
const date = (value: string) => new Date(Number(value) * 1000).toLocaleString();

function Progress({
  label,
  value,
  total,
}: {
  label: string;
  value: bigint;
  total: bigint;
}) {
  const percent =
    total > 0n ? Math.min(100, Number((value * 10000n) / total) / 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function DonorWorkspace({
  historyOnly = false,
}: {
  historyOnly?: boolean;
}) {
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const walletAddress = wallet?.account.address;
  const [model, setModel] = useState<Model | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "unavailable">(
    "idle"
  );
  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setModel(null);
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const response = await fetch(
        `/api/read/donations?cluster=${cluster}&wallet=${walletAddress}`
      );
      if (!response.ok) throw new Error();
      setModel(await response.json());
      setState("idle");
    } catch {
      setState("unavailable");
    }
  }, [cluster, walletAddress]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const totals = useMemo(() => {
    const donations = model?.donations || [];
    const campaigns = new Map<string, Donation>();
    donations.forEach((item) => campaigns.set(item.campaign, item));
    return {
      donated: donations.reduce(
        (sum, item) => sum + BigInt(item.amount || "0"),
        0n
      ),
      campaigns: campaigns.size,
      allocated: [...campaigns.values()].reduce(
        (sum, item) => sum + BigInt(item.campaignProgress.allocated),
        0n
      ),
      disbursed: [...campaigns.values()].reduce(
        (sum, item) => sum + BigInt(item.campaignProgress.disbursed),
        0n
      ),
      verified: [...campaigns.values()].reduce(
        (sum, item) => sum + BigInt(item.campaignProgress.verified),
        0n
      ),
    };
  }, [model]);
  if (!walletAddress)
    return (
      <main className="px-6 py-10 md:px-10">
        <section className="mx-auto max-w-6xl rounded-xl border border-border bg-card p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Donor workspace
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">
            Your giving, traced end to end
          </h1>
          <p className="mt-3 text-muted-foreground">
            Connect your wallet to view the donations indexed for that public
            Solana address.
          </p>
          <Button className="mt-5" asChild>
            <Link href="/campaigns">Explore campaigns</Link>
          </Button>
        </section>
      </main>
    );
  const donations = model?.donations || [];
  const table = (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-210 text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-4">Campaign</th>
            <th className="p-4">Amount</th>
            <th className="p-4">Source</th>
            <th className="p-4">Date</th>
            <th className="p-4">Status</th>
            <th className="p-4">Delivery progress</th>
            <th className="p-4">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {donations.map((item) => {
            const raised = BigInt(item.campaignRaised || "0");
            const delivered = BigInt(item.campaignProgress.verified || "0");
            const percent =
              raised > 0n
                ? Math.min(100, Number((delivered * 10000n) / raised) / 100)
                : 0;
            return (
              <tr
                key={item.address}
                className="border-b border-border last:border-0"
              >
                <td className="p-4">
                  <Link
                    className="font-medium hover:underline"
                    href={`/campaigns/${item.campaign}`}
                  >
                    {item.metadata?.title || short(item.campaign)}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.metadata?.location || "Metadata unavailable"}
                  </p>
                </td>
                <td className="p-4 font-mono">{asSol(item.amount)} SOL</td>
                <td className="p-4">
                  <Badge variant="outline">{item.source || "Standard"}</Badge>
                </td>
                <td className="p-4 text-xs text-muted-foreground">
                  {date(item.occurredAt)}
                </td>
                <td className="p-4">
                  <Badge variant="verified">Confirmed</Badge>
                </td>
                <td className="p-4">
                  <span className="font-medium">{percent}%</span>
                  <div className="mt-1 h-2 w-24 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Campaign-level verified delivery
                  </p>
                </td>
                <td className="p-4">
                  {item.sourceSignature ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline"
                      target="_blank"
                      rel="noreferrer"
                      href={getExplorerUrl(`/tx/${item.sourceSignature}`)}
                    >
                      {short(item.sourceSignature)}{" "}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      Indexer pending
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  if (historyOnly)
    return (
      <main className="px-6 py-10 md:px-10">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Donor workspace
              </p>
              <h1 className="mt-2 font-serif text-5xl font-semibold">
                My donations
              </h1>
              <p className="mt-3 text-muted-foreground">
                Complete indexed history with canonical campaign and delivery
                progress.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={state === "loading"}
              onClick={() => void refresh()}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </header>
          <div className="mt-7">
            {state === "unavailable" ? (
              <p className="rounded-xl border border-border bg-card p-5">
                Donation history is temporarily unavailable. Your on-chain
                donations remain unchanged.
              </p>
            ) : donations.length === 0 && state !== "loading" ? (
              <p className="rounded-xl border border-border bg-card p-5 text-muted-foreground">
                No indexed donations were found for this wallet yet.
              </p>
            ) : (
              table
            )}
          </div>
        </div>
      </main>
    );
  return (
    <main className="px-6 py-10 md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Donor workspace
            </p>
            <h1 className="mt-2 font-serif text-5xl font-semibold">
              Your giving, traced end to end
            </h1>
            <p className="mt-3 text-muted-foreground">
              Every donation remains visible—from the wallet signature to
              campaign-level delivery evidence.
            </p>
          </div>
          <Button asChild>
            <Link href="/campaigns">
              Donate again <Heart className="size-4" />
            </Link>
          </Button>
        </header>
        {state === "unavailable" ? (
          <p className="mt-6 rounded-xl border border-border bg-card p-5">
            Donation data is temporarily unavailable. Try again after the
            indexer catches up.
          </p>
        ) : (
          <>
            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Total donated", `${displaySol(totals.donated)} SOL`],
                ["Campaigns supported", String(totals.campaigns)],
                ["Confirmed donations", String(donations.length)],
                [
                  "Indexer checkpoint",
                  model?.checkpoint?.last_slot || "Pending",
                ],
              ].map(([label, value]) => (
                <article
                  key={label}
                  className="border-l-2 border-primary bg-card p-5 pl-5"
                >
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 font-serif text-3xl font-semibold">
                    {value}
                  </p>
                </article>
              ))}
            </section>
            <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-serif text-2xl font-semibold">
                    Recent donations
                  </h2>
                  <Link
                    className="text-sm font-medium text-primary hover:underline"
                    href="/dashboard/donations"
                  >
                    View all
                  </Link>
                </div>
                {donations.length ? (
                  <div className="[&_tbody_tr:nth-child(n+4)]:hidden">
                    {table}
                  </div>
                ) : (
                  <p className="rounded-xl border border-border bg-card p-5 text-muted-foreground">
                    No indexed donations for this wallet yet.
                  </p>
                )}
              </div>
              <aside className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-serif text-2xl font-semibold">
                  Where your SOL went
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Campaign-level progress across campaigns you supported; not an
                  earmark of individual donations.
                </p>
                <div className="mt-5 space-y-4">
                  <Progress
                    label="Allocated to relief"
                    value={totals.allocated}
                    total={totals.donated}
                  />
                  <Progress
                    label="Disbursed to vendors"
                    value={totals.disbursed}
                    total={totals.donated}
                  />
                  <Progress
                    label="Delivery verified"
                    value={totals.verified}
                    total={totals.donated}
                  />
                </div>
                <p className="mt-5 text-xs text-muted-foreground">
                  Solana campaign vaults are canonical. Indexed history can lag
                  behind confirmed transactions.
                </p>
              </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
