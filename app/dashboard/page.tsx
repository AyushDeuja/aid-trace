"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { address } from "@solana/kit";
import { WalletButton } from "../components/wallet-button";
import { useCluster } from "../components/cluster-context";
import { useWallet } from "../lib/wallet/context";
import { displaySol } from "../lib/campaigns/amount";
import { fetchDonation, listCampaigns, type Campaign } from "../lib/campaigns/chain";

type DonationRow = { campaign: Campaign; amount: bigint; id: bigint; signature: Campaign["address"] };

export default function DonorDashboard() {
  const { wallet } = useWallet();
  const { cluster } = useCluster();
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const walletAddress = wallet?.account.address;
  const load = useCallback(async () => {
    if (!walletAddress || (cluster !== "devnet" && cluster !== "localnet")) { setDonations([]); return; }
    setLoading(true);
    try {
      const campaigns = await listCampaigns(cluster);
      const records = await Promise.all(campaigns.flatMap((campaign) => Array.from({ length: Number(campaign.nextDonationId) }, async (_, index) => {
        const item = await fetchDonation(cluster, campaign.address, BigInt(index));
        return item?.donor === walletAddress ? { campaign, amount: item.amount, id: item.donationId, signature: item.address } : null;
      })));
      setDonations(records.filter((item): item is DonationRow => item !== null));
    } catch { setDonations([]); } finally { setLoading(false); }
  }, [cluster, walletAddress]);
  useEffect(() => { void load(); }, [load]);
  const total = useMemo(() => donations.reduce((sum, item) => sum + item.amount, 0n), [donations]);
  const campaigns = new Set(donations.map((item) => item.campaign.address)).size;

  return <main className="min-h-screen bg-[#f7f4ed] px-5 py-8 text-[#302a21] md:px-8 md:py-10"><div className="mx-auto max-w-[1480px] space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d8d0c2] pb-7"><div><p className="mb-2 text-xs font-extrabold tracking-[.12em] text-red-700">— DONOR WORKSPACE</p><h1 className="font-serif text-4xl">Your giving, traced end to end</h1><p className="mt-2 text-[#776f63]">Every donation you make stays visible—from wallet signature to verified delivery.</p></div><div className="flex gap-3"><WalletButton /><Link href="/campaigns" className="bg-red-700 px-4 py-2 text-sm font-bold text-white">Donate again →</Link></div></header>
    {!walletAddress ? <section className="border border-dashed border-[#bdb3a3] bg-[#fffdf8] p-10 text-center"><h2 className="font-serif text-2xl">Connect your donor wallet</h2><p className="mt-2 text-sm text-[#776f63]">Your dashboard only shows donations whose donor PDA matches the connected wallet.</p></section> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Total donated", `${displaySol(total)} SOL`, `${donations.length} confirmed donations`], ["Campaigns supported", String(campaigns), "Canonical campaign accounts"], ["Donation records", String(donations.length), "Found on selected cluster"], ["Round-Up Relief", "Unavailable", "Experimental workflow not implemented"]].map(([label, value, detail]) => <article key={label} className="border-l-2 border-red-700 bg-[#fffdf8] p-5 shadow-[0_8px_30px_-26px_#302a21]"><p className="text-xs font-bold uppercase tracking-wide text-[#776f63]">{label}</p><p className="mt-1 font-serif text-3xl">{value}</p><p className="mt-1 text-xs text-[#776f63]">{detail}</p></article>)}</section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="overflow-hidden border border-[#d8d0c2] bg-[#fffdf8]"><div className="flex justify-between border-b border-[#d8d0c2] p-5"><div><h2 className="font-serif text-2xl">Recent donations</h2><p className="mt-1 text-sm text-[#776f63]">Canonical donation records from Solana.</p></div><Link href="/campaigns" className="text-sm font-bold underline">Find a campaign</Link></div><div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-sm"><thead className="bg-[#eee7db] text-xs uppercase text-[#776f63]"><tr><th className="p-4">Campaign</th><th className="p-4">Amount</th><th className="p-4">Source</th><th className="p-4">Status</th><th className="p-4">Record</th></tr></thead><tbody>{donations.map((item) => <tr key={item.signature} className="border-t border-[#e6ded1]"><td className="p-4"><Link className="font-bold underline" href={`/campaigns/${item.campaign.address}`}>Campaign #{item.campaign.campaignId.toString()}</Link></td><td className="p-4 font-mono">{displaySol(item.amount)} SOL</td><td className="p-4"><span className="border border-[#d8d0c2] px-2 py-1 text-xs">Standard</span></td><td className="p-4"><span className="bg-[#dff1e1] px-2 py-1 text-xs font-bold text-[#29603a]">Confirmed</span></td><td className="p-4 font-mono text-xs break-all">{item.signature}</td></tr>)}{!loading && !donations.length && <tr><td colSpan={5} className="p-8 text-center text-[#776f63]">No donations yet. When you donate, each transaction appears here.</td></tr>}{loading && <tr><td colSpan={5} className="p-8 text-center text-[#776f63]">Reading donation PDAs…</td></tr>}</tbody></table></div></div>
      <aside className="border border-[#d8d0c2] bg-[#fffdf8] p-5"><h2 className="font-serif text-2xl">Your data provenance</h2><dl className="mt-5 space-y-4 text-sm"><div><dt className="font-bold">Canonical</dt><dd className="text-[#776f63]">Donation amount, donor wallet, campaign and record address are read from Solana.</dd></div><div><dt className="font-bold">Not yet available</dt><dd className="text-[#776f63]">Delivery progress, receipt exports and Round-Up Relief need services not present in this application.</dd></div></dl></aside></section>
    </>}</div></main>;
}
