"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  Database,
  Menu,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCluster } from "./components/cluster-context";
import { listCampaigns } from "./lib/campaigns/chain";
import {
  CampaignCard,
  type LandingCampaign,
} from "./components/landing/campaign-card";
import { Eyebrow, LiveFundPath, Metric } from "./components/landing/primitives";

const fallbackCampaigns: LandingCampaign[] = [
  {
    id: "nepal-flood-2026",
    title: "Monsoon lifelines for Karnali",
    location: "Karnali Province, Nepal",
    organization: "Himalayan Relief Network",
    summary:
      "Emergency food, clean water and temporary shelter for 3,200 families cut off by monsoon flooding.",
    live: 842.7,
    canonical: 841.9,
    goal: 1200,
    verified: 14,
  },
  {
    id: "turkiye-rebuild",
    title: "Safe homes, stronger neighborhoods",
    location: "Hatay, Türkiye",
    organization: "Open Shelter Collective",
    summary:
      "Structural inspections, repair materials and essential supplies for families returning home.",
    live: 612.4,
    canonical: 612.4,
    goal: 900,
    verified: 9,
  },
  {
    id: "samar-water",
    title: "Clean water after Typhoon Pilar",
    location: "Eastern Samar, Philippines",
    organization: "Coastline Mutual Aid",
    summary:
      "Water purification, storage and emergency shelter for coastal communities.",
    live: 428.1,
    canonical: 427.6,
    goal: 650,
    verified: 21,
  },
];

export default function Home() {
  const { cluster } = useCluster();
  const [campaigns, setCampaigns] =
    useState<LandingCampaign[]>(fallbackCampaigns);
  const [isFallback, setIsFallback] = useState(true);
  const loadCampaigns = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") return;
    try {
      const chainCampaigns = await listCampaigns(cluster);
      if (!chainCampaigns.length) return;
      const resolved = await Promise.all(
        chainCampaigns
          .filter((item) => item.status === "Active")
          .slice(0, 3)
          .map(async (item, index): Promise<LandingCampaign> => {
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
              /* use public fallback labels */
            }
            const backup = fallbackCampaigns[index % fallbackCampaigns.length];
            return {
              id: item.campaignId.toString(),
              address: item.address,
              title: metadata.title || `Campaign #${item.campaignId}`,
              location: metadata.location || backup.location,
              organization:
                metadata.organization || "Verified AidTrace organization",
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
      if (resolved.length) {
        setCampaigns(resolved);
        setIsFallback(false);
      }
    } catch {
      setCampaigns(fallbackCampaigns);
      setIsFallback(true);
    }
  }, [cluster]);
  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);
  const featured = useMemo(() => campaigns.slice(0, 3), [campaigns]);
  const primary = featured[0] || fallbackCampaigns[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 md:px-7">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/aidtrace-logo.png"
              alt="AidTrace"
              width={38}
              height={38}
              className="size-9 object-contain"
              priority
            />
            <span className="font-serif text-xl font-semibold">AidTrace</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-bold md:flex">
            <Link href="/campaigns">Campaigns</Link>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="flex items-center gap-1.5">
            <Badge variant="live" className="hidden lg:inline-flex">
              {cluster} · live
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search"
              onClick={() =>
                toast.info("Search campaigns, transactions and addresses")
              }
            >
              <Search />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              onClick={() => toast.info("3 updates in your audit feed")}
            >
              <Bell />
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="hidden sm:inline-flex"
            >
              <Link href="/org">Organization view</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
            >
              <Menu />
            </Button>
          </div>
        </div>
      </header>
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
                evidence-backed delivery—without taking anyone’s word for it.
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
                  <a href="#how-it-works">See how it works</a>
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
            <LiveFundPath
              live={primary.live.toFixed(1)}
              canonical={primary.canonical.toFixed(1)}
            />
          </div>
        </section>
        <section className="border-b bg-card">
          <div className="mx-auto grid max-w-[1400px] divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
            <Metric
              label="Confirmed donations"
              value="2,148"
              detail="Publicly auditable"
            />
            <Metric
              label="Active campaigns"
              value={isFallback ? "12" : String(campaigns.length)}
              detail={
                isFallback ? "Across 8 regions" : "Loaded from selected cluster"
              }
            />
            <Metric
              label="Verified deliveries"
              value="184"
              detail="Evidence attached"
            />
            <Metric
              label="Funds traced"
              value="94.7%"
              detail="Donation to delivery"
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
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            {isFallback
              ? "Showing verified public fallback records while canonical campaign data is unavailable."
              : "Campaign totals above are loaded from the selected Solana cluster."}
          </p>
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
              A frontend demonstration using sample Devnet activity.
            </p>
          </div>
          <div className="flex gap-5 text-sm">
            <Link href="/campaigns">Campaigns</Link>
            <a href="#how-it-works">How it works</a>
            <Link href="/org">Organization view</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
