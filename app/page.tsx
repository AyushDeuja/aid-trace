"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCluster } from "./components/cluster-context";
import {
  CampaignCard,
  type LandingCampaign,
} from "./components/landing/campaign-card";
import { EmptyCampaigns } from "./components/landing/empty-campaigns";
import { Eyebrow, LiveFundPath, Metric } from "./components/landing/primitives";
import { listCampaigns } from "./lib/campaigns/chain";

type CampaignLoadState = "loading" | "ready" | "unavailable";

export default function Home() {
  const { cluster } = useCluster();
  const [campaigns, setCampaigns] = useState<LandingCampaign[]>([]);
  const [loadState, setLoadState] = useState<CampaignLoadState>("loading");

  const loadCampaigns = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") {
      setCampaigns([]);
      setLoadState("unavailable");
      return;
    }

    setLoadState("loading");
    try {
      const chainCampaigns = await listCampaigns(cluster);
      const resolved = await Promise.all(
        chainCampaigns
          .filter((item) => item.status === "Active")
          .map(async (item): Promise<LandingCampaign> => {
            let metadata: {
              title?: string;
              description?: string;
              location?: string;
              organization?: string;
            } = {};

            try {
              const response = await fetch(
                `/api/campaigns/metadata?uri=${encodeURIComponent(item.metadataUri)}`
              );
              if (response.ok) {
                const body = await response.json();
                metadata = body.metadata ?? body;
              }
            } catch {
              // The canonical campaign remains usable if optional metadata is unavailable.
            }

            return {
              id: item.campaignId.toString(),
              address: item.address,
              title: metadata.title || `Campaign #${item.campaignId}`,
              location: metadata.location || "Location unavailable",
              organization:
                metadata.organization || "Organization details unavailable",
              summary:
                metadata.description ||
                "Canonical campaign data is available on the selected Solana cluster.",
              live: Number(item.amountRaised) / 1_000_000_000,
              canonical: Number(item.amountRaised) / 1_000_000_000,
              goal: Number(item.targetAmount) / 1_000_000_000,
              verified: Number(item.nextDonationId),
            };
          })
      );
      setCampaigns(resolved);
      setLoadState("ready");
    } catch {
      setCampaigns([]);
      setLoadState("unavailable");
    }
  }, [cluster]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCampaigns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaigns]);

  const featured = useMemo(() => campaigns.slice(0, 3), [campaigns]);
  const primary = featured[0];
  const donationCount = campaigns.reduce(
    (total, campaign) => total + campaign.verified,
    0
  );
  const totalRaised = campaigns.reduce(
    (total, campaign) => total + campaign.canonical,
    0
  );
  const emptyState =
    loadState === "loading"
      ? {
          title: "Loading canonical campaigns",
          description:
            "Reading active campaign data from the selected Solana cluster.",
        }
      : cluster !== "devnet" && cluster !== "localnet"
        ? {
            title: "Select Devnet or localnet",
            description:
              "Campaign records are currently available on the Devnet and localnet clusters.",
          }
        : {
            title: "No active campaigns yet",
            description:
              "There are no active campaign records on the selected cluster, or the records are temporarily unavailable.",
          };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main>
        <section className="relative isolate min-h-[640px] overflow-hidden text-white">
          <Image
            src="/relief-documentary.png"
            alt="Flood relief workers carrying supplies"
            fill
            priority
            className="-z-30 object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 -z-20 bg-[#17130e]/65" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#17130e] via-[#17130e]/40 to-[#17130e]/30" />
          <div className="mx-auto grid min-h-[640px] max-w-[1400px] items-end gap-10 px-5 py-16 md:grid-cols-[1.02fr_.98fr] md:px-8">
            <div className="max-w-3xl">
              <Eyebrow light>TRANSPARENT DISASTER RELIEF</Eyebrow>
              <h1 className="mt-5 font-serif text-5xl leading-[.95] md:text-7xl">
                Relief money,
                <br />
                <em className="text-red-400">accounted for.</em>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
                Follow every donation from a protected campaign vault to
                evidence-backed delivery without taking anyone&apos;s word for
                it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link href="/campaigns">
                    Explore campaigns <ArrowRight />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-white/50 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                >
                  <Link href="/how-it-works">See how it works</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/75">
                <span className="inline-flex items-center gap-2">
                  <Database className="size-4 text-cyan-200" />
                  Canonical records on Solana
                </span>
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="size-4 text-cyan-200" />
                  Human-reviewed intelligence
                </span>
              </div>
            </div>
            {primary ? (
              <LiveFundPath
                live={primary.canonical.toFixed(1)}
                canonical={primary.canonical.toFixed(1)}
              />
            ) : (
              <div className="rounded-lg border border-white/20 bg-[#17130e]/85 p-6 text-white shadow-2xl backdrop-blur-md">
                <p className="text-sm font-semibold">
                  Campaign data unavailable
                </p>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  Select a supported cluster to view a canonical campaign total.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="border-b bg-card">
          <div className="mx-auto grid max-w-[1400px] divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
            <Metric
              label="Recorded donations"
              value={
                loadState === "ready" ? donationCount.toLocaleString() : "--"
              }
              detail="Across active campaigns"
            />
            <Metric
              label="Active campaigns"
              value={loadState === "ready" ? String(campaigns.length) : "--"}
              detail="Loaded from selected cluster"
            />
            <Metric
              label="Campaign funds raised"
              value={
                loadState === "ready" ? `${totalRaised.toFixed(1)} SOL` : "--"
              }
              detail="Canonical Solana totals"
            />
            <Metric
              label="Selected network"
              value={cluster}
              detail="Change it in the navigation"
            />
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-8">
          <div className="mb-8 flex items-end justify-between gap-5">
            <div>
              <Eyebrow>URGENT WORK, VISIBLE PROGRESS</Eyebrow>
              <h2 className="mt-3 font-serif text-4xl">
                Relief you can follow.
              </h2>
            </div>
            <Button variant="link" asChild className="hidden md:inline-flex">
              <Link href="/campaigns">
                View all campaigns <ArrowRight />
              </Link>
            </Button>
          </div>
          {featured.length ? (
            <>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {featured.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Showing active campaign data from the selected Solana cluster.
              </p>
            </>
          ) : (
            <EmptyCampaigns {...emptyState} />
          )}
        </section>

        <section
          id="how-it-works"
          className="bg-primary text-primary-foreground"
        >
          <div className="mx-auto grid max-w-[1400px] divide-y divide-white/25 md:grid-cols-3 md:divide-x md:divide-y-0">
            <article className="p-8">
              <h2 className="font-serif text-2xl">Durable truth</h2>
              <p className="mt-3 text-white/80">
                Donations, allocations and delivery records settle on Solana.
              </p>
            </article>
            <article className="p-8">
              <h2 className="font-serif text-2xl">Realtime response</h2>
              <p className="mt-3 text-white/80">
                MagicBlock updates live counters without obscuring canonical
                totals.
              </p>
            </article>
            <article className="p-8">
              <h2 className="font-serif text-2xl">Accountable intelligence</h2>
              <p className="mt-3 text-white/80">
                AI explains risk signals. Humans approve consequential actions.
              </p>
            </article>
          </div>
        </section>
      </main>
      <footer className="bg-[#17130e] text-[#fffaf0]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap justify-between gap-6 px-5 py-10 md:px-8">
          <div>
            <p className="font-serif text-xl">AidTrace</p>
            <p className="mt-2 text-sm text-white/60">
              Transparent disaster-relief funding on Solana.
            </p>
          </div>
          <div className="flex gap-5 text-sm">
            <Link href="/campaigns">Campaigns</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/org">Organization view</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
