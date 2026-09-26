"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { WalletButton } from "./components/wallet-button";
import { ClusterSelect } from "./components/cluster-select";
import { ThemeToggle } from "./components/theme-toggle";
import { useCluster } from "./components/cluster-context";
import { displaySol } from "./lib/campaigns/amount";
import { listCampaigns, type Campaign } from "./lib/campaigns/chain";
import { FieldNotesMarquee } from "./components/field-notes-marquee";
import { OrganizationsMarquee } from "./components/organizations-marquee";
import { Badge } from "./components/ui/badge";
import { buttonVariants } from "./components/ui/button";
import { ArrowRight } from "lucide-react";

type CampaignCard = { campaign: Campaign; title: string; description: string };
const sampleMetrics = [["Confirmed donations", "2,148", "Publicly auditable"], ["Active campaigns", "12", "Across 8 regions"], ["Verified deliveries", "184", "Evidence attached"], ["Funds traced", "94.7%", "Donation to delivery"]];

function BlankImage({ className = "" }: { className?: string }) {
  return <div aria-label="Blank documentary image placeholder" className={`relative overflow-hidden bg-[#d9d1c2] ${className}`}><div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.38),transparent_45%,rgba(48,38,28,.16))]" /><span className="absolute bottom-3 right-3 border border-black/15 bg-white/65 px-2 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-black/55">Image placeholder</span></div>;
}

export default function Home() {
  const { cluster } = useCluster();
  const [campaigns, setCampaigns] = useState<CampaignCard[]>([]);
  const [loading, setLoading] = useState(true);
  const loadCampaigns = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") { setCampaigns([]); setLoading(false); return; }
    setLoading(true);
    try {
      const records = await listCampaigns(cluster);
      setCampaigns(await Promise.all(records.slice(0, 3).map(async (campaign) => {
        try { const response = await fetch(`/api/campaigns/metadata?uri=${encodeURIComponent(campaign.metadataUri)}`); const data = await response.json(); if (response.ok && data.digest === campaign.metadataDigest) return { campaign, title: data.metadata.title, description: data.metadata.description }; } catch { /* render fallback */ }
        return { campaign, title: `Campaign #${campaign.campaignId}`, description: "Campaign metadata is awaiting verification." };
      })));
    } catch { setCampaigns([]); } finally { setLoading(false); }
  }, [cluster]);
  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  const raised = useMemo(() => campaigns.reduce((total, item) => total + item.campaign.amountRaised, 0n), [campaigns]);
  const fundPathTotal = campaigns[0]?.campaign.amountRaised ?? 842700000000n;

  return <div className="min-h-screen bg-[#f7f4ed] text-[#302a21]">
    <header className="hidden"><div>
      <Link href="/" className="flex items-center gap-2.5" aria-label="AidTrace home"><span className="relative grid size-9 place-items-center overflow-hidden bg-[#1c1915]"><i className="absolute h-px w-12 rotate-45 bg-[#f7f4ed]" /><i className="absolute h-px w-12 -rotate-45 bg-[#f7f4ed]" /></span><span className="font-serif text-xl font-semibold">AidTrace</span></Link>
      <nav className="hidden items-center gap-6 text-sm font-bold md:flex"><Link href="/campaigns" className="hover:text-red-700">Campaigns</Link><a href="#how-it-works" className="hover:text-red-700">How it works</a></nav>
      <div className="flex items-center gap-2"><span className="hidden border border-cyan-700/25 bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-950 lg:inline">{cluster} · live</span><button onClick={() => toast.info("Search campaigns, transactions and addresses")} className="grid size-9 place-items-center border border-[#d8d0c2] text-sm" aria-label="Search">⌕</button><button onClick={() => toast.info("3 updates in your audit feed")} className="grid size-9 place-items-center border border-[#d8d0c2] text-sm" aria-label="Notifications">◌</button><ThemeToggle /><ClusterSelect /><WalletButton /></div>
    </div></header>
    <main>
      <section className="relative isolate min-h-[640px] overflow-hidden bg-[#746b5d] text-[#fffdf7]"><BlankImage className="absolute inset-0 opacity-80" /><div className="absolute inset-0 bg-[#17130e]/65" /><div className="absolute inset-0 bg-gradient-to-t from-[#17130e] via-[#17130e]/45 to-[#17130e]/30" /><div className="relative mx-auto grid min-h-[640px] max-w-[1400px] items-end gap-10 px-5 py-16 md:grid-cols-[1.02fr_.98fr] md:px-8">
        <div className="max-w-3xl"><p className="mb-5 flex items-center gap-2 text-xs font-extrabold tracking-[.12em] text-cyan-200"><span className="size-2 animate-pulse rounded-full bg-cyan-300" /> TRANSPARENT DISASTER RELIEF</p><h1 className="font-serif text-5xl leading-[.95] md:text-7xl">Relief money,<br /><em className="text-red-400">accounted for.</em></h1><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">Follow every donation from a protected campaign vault to evidence-backed delivery—without taking anyone’s word for it.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/campaigns" className="bg-red-700 px-5 py-3 text-sm font-extrabold transition hover:-translate-y-0.5 hover:bg-red-800">Explore campaigns →</Link><a href="#how-it-works" className="border border-white/50 px-5 py-3 text-sm font-extrabold transition hover:-translate-y-0.5 hover:bg-white/10">See how it works</a></div><div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75"><span>▣ Canonical records on Solana</span><span>✦ Human-reviewed intelligence</span></div></div>
        <section className="border border-white/20 bg-[#1c1915]/85 p-5 backdrop-blur" aria-label="Live fund path"><div className="flex items-center justify-between"><h2 className="text-xs font-extrabold tracking-[.13em]">LIVE FUND PATH</h2><span className="bg-cyan-200 px-2 py-1 text-xs font-bold text-cyan-950">Reconciled now</span></div><ol className="mt-8 grid grid-cols-5 gap-2 text-center text-[11px] font-bold">{["Donor", "Vault", "Allocate", "Deliver", "Verify"].map((step, index) => <li key={step} className="relative pt-8 before:absolute before:left-1/2 before:top-0 before:size-5 before:-translate-x-1/2 before:rounded-full before:border before:border-cyan-200 before:bg-[#1c1915]"><span className="block text-cyan-200">0{index + 1}</span>{step}</li>)}</ol><div className="mt-8 flex items-end justify-between border-t border-white/15 pt-4"><div><strong className="font-serif text-3xl">{displaySol(fundPathTotal)} SOL</strong><p className="mt-1 text-xs text-white/60">{campaigns.length ? "Canonical campaign total" : "Sample live total"}</p></div><span className="text-2xl text-red-400">↗</span></div></section>
      </div></section>
      <section className="border-b border-[#d8d0c2] bg-[#fffdf8]"><div className="mx-auto grid max-w-[1400px] divide-y divide-[#d8d0c2] md:grid-cols-4 md:divide-x md:divide-y-0">{sampleMetrics.map(([label, value, detail], i) => <div key={label} className="border-l-2 border-red-700 px-6 py-6"><p className="text-xs font-bold uppercase tracking-wide text-[#776f63]">{i === 1 && campaigns.length ? "Active campaigns (live)" : label}</p><p className="mt-1 font-serif text-3xl">{i === 1 && campaigns.length ? campaigns.filter(({ campaign }) => campaign.status === "Active").length : value}</p><p className="text-sm text-[#776f63]">{i === 0 && campaigns.length ? `${displaySol(raised)} SOL across loaded campaigns` : detail}</p></div>)}</div></section>
      <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-8"><div className="mb-8 flex items-end justify-between gap-6"><div><p className="mb-3 text-xs font-extrabold tracking-[.12em] text-red-700">— URGENT WORK, VISIBLE PROGRESS</p><h2 className="font-serif text-4xl">Relief you can follow.</h2></div><Link href="/campaigns" className="hidden text-sm font-bold underline md:block">View all campaigns →</Link></div>
        {loading ? <p className="text-[#776f63]">Loading canonical campaign data…</p> : campaigns.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{campaigns.map(({ campaign, title, description }) => { const progress = campaign.targetAmount ? Number((campaign.amountRaised * 100n) / campaign.targetAmount) : 0; return <Link key={campaign.address} href={`/campaigns/${campaign.address}`} className="group overflow-hidden border border-[#d8d0c2] bg-[#fffdf8] shadow-[0_8px_30px_-26px_#302a21]"><BlankImage className="aspect-[16/10] transition duration-700 group-hover:scale-[1.04]" /><div className="p-5"><Badge variant={campaign.status === "Active" ? "success" : "warning"}>{campaign.status}</Badge><h3 className="mt-4 font-serif text-2xl">{title}</h3><p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#776f63]">{description}</p><div className="mt-5 flex justify-between text-sm"><span>{displaySol(campaign.amountRaised)} / {displaySol(campaign.targetAmount)} SOL</span><strong>{progress}%</strong></div><div className="mt-2 h-2 bg-[#e8e1d6]"><div className="h-full bg-red-700" style={{ width: `${Math.min(progress, 100)}%` }} /></div><div className="mt-4 flex justify-between text-xs text-[#776f63]"><span>On-chain campaign</span><span>{campaign.nextDonationId.toString()} donations</span></div></div></Link>; })}</div> : <div className="border border-dashed border-[#bdb3a3] bg-[#fffdf8] p-10 text-center"><p className="font-serif text-2xl">No canonical campaigns found.</p><p className="mt-2 text-sm text-[#776f63]">Create and activate a campaign on {cluster}, then it will appear here with live totals.</p><Link href="/campaigns" className={buttonVariants({ className: "mt-5" })}>Open campaigns <ArrowRight className="size-4" /></Link></div>}
        <p className="mt-5 text-xs text-[#776f63]">Blank image panels are intentional dummy placeholders. Campaign totals, status, goals, and donation counts above are loaded from the selected Solana cluster when available. The impact metrics are sample data.</p>
      </section>
      <FieldNotesMarquee />
      <OrganizationsMarquee />
      <section id="how-it-works" className="bg-red-700 text-white"><div className="mx-auto grid max-w-[1400px] divide-y divide-white/25 md:grid-cols-3 md:divide-x md:divide-y-0"><article className="p-8"><h2 className="font-serif text-2xl">Durable truth</h2><p className="mt-3 text-white/80">Donations, allocations and delivery records settle on Solana.</p></article><article className="p-8"><h2 className="font-serif text-2xl">Realtime response</h2><p className="mt-3 text-white/80">Live counters can update without obscuring canonical totals.</p></article><article className="p-8"><h2 className="font-serif text-2xl">Accountable intelligence</h2><p className="mt-3 text-white/80">AI explains risk signals. Humans approve consequential actions.</p></article></div></section>
    </main>
    <footer className="bg-[#1c1915] text-[#fffdf8]"><div className="mx-auto flex max-w-[1400px] flex-wrap justify-between gap-6 px-5 py-10 md:px-8"><div><p className="font-serif text-xl">AidTrace</p><p className="mt-2 text-sm text-white/60">A frontend demonstration using sample Devnet activity.</p></div><div className="flex gap-5 text-sm"><Link href="/campaigns">Campaigns</Link><a href="#how-it-works">How it works</a><Link href="/org">Organization view</Link></div></div></footer>
  </div>;
}
