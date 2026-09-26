"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { WalletButton } from "../components/wallet-button";
import { useCluster } from "../components/cluster-context";
import { useWallet } from "../lib/wallet/context";
import { fetchAdmin, fetchOrganization, setStatusIx, setVerifiedIx, type OrganizationAccount } from "../lib/organizations/chain";
import { listCampaigns, setCampaignStatusIx, type Campaign } from "../lib/campaigns/chain";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";

type IndexedOrganization = OrganizationAccount & { metadata?: { name: string } | null };

export default function AdminDashboard() {
  const { wallet } = useWallet();
  const { cluster } = useCluster();
  const { send, isSending } = useSendTransaction();
  const [admin, setAdmin] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<IndexedOrganization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const walletAddress = wallet?.account.address;
  const supported = cluster === "devnet" || cluster === "localnet";
  const isAdmin = !!walletAddress && admin === walletAddress;
  const load = useCallback(async () => {
    if (!supported) { setLoading(false); return; }
    setLoading(true);
    try {
      const [nextAdmin, indexed, listedCampaigns] = await Promise.all([fetchAdmin(cluster), fetch(`/api/organizations?cluster=${cluster}`).then((r) => r.ok ? r.json() as Promise<IndexedOrganization[]> : []), listCampaigns(cluster)]);
      setAdmin(nextAdmin); setOrganizations(indexed); setCampaigns(listedCampaigns);
    } catch { toast.error("Could not load canonical admin data"); } finally { setLoading(false); }
  }, [cluster, supported]);
  useEffect(() => { void load(); }, [load]);
  const act = async (build: () => Promise<Parameters<typeof send>[0]["instructions"][number]>, message: string) => {
    try { const signature = await send({ instructions: [await build()] }); toast.success(message, { description: `Submitted: ${signature}` }); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : "Admin transaction failed"); }
  };
  const metrics = useMemo(() => ({ pendingOrgs: organizations.filter((item) => !item.verified).length, pendingCampaigns: campaigns.filter((item) => item.status === "PendingReview").length, activeCampaigns: campaigns.filter((item) => item.status === "Active").length }), [organizations, campaigns]);
  return <main className="min-h-screen bg-[#f7f4ed] px-5 py-8 text-[#302a21] md:px-8 md:py-10"><div className="mx-auto max-w-[1480px] space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d8d0c2] pb-7"><div><p className="mb-2 text-xs font-extrabold tracking-[.12em] text-red-700">— ADMIN OPERATIONS</p><h1 className="font-serif text-4xl">Operations overview</h1><p className="mt-2 text-[#776f63]">Canonical organization and campaign decisions that require the configured administrator.</p></div><WalletButton /></header>
    {!supported && <p className="border border-amber-500 bg-amber-50 p-4 text-sm">Select Devnet or localnet to load administrator controls.</p>}
    {supported && !walletAddress && <p className="border border-[#d8d0c2] bg-[#fffdf8] p-4 text-sm">Connect the configured admin wallet to make on-chain review decisions.</p>}
    {supported && walletAddress && !isAdmin && <p className="border border-amber-500 bg-amber-50 p-4 text-sm">This wallet is not the configured program admin. You can inspect queues, but approval controls are unavailable.</p>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Organizations to review", metrics.pendingOrgs, "Unverified canonical records"], ["Campaign activation reviews", metrics.pendingCampaigns, "PendingReview on-chain state"], ["Active campaigns", metrics.activeCampaigns, "Accepting donations"], ["System health", "Unknown", "No health service is implemented"]].map(([label, value, detail]) => <article key={String(label)} className="border-l-2 border-red-700 bg-[#fffdf8] p-5 shadow-[0_8px_30px_-26px_#302a21]"><p className="text-xs font-bold uppercase tracking-wide text-[#776f63]">{String(label)}</p><p className="mt-1 font-serif text-3xl">{String(value)}</p><p className="mt-1 text-xs text-[#776f63]">{String(detail)}</p></article>)}</section>
    <section className="grid gap-6 xl:grid-cols-2"><div className="overflow-hidden border border-[#d8d0c2] bg-[#fffdf8]"><div className="border-b border-[#d8d0c2] p-5"><h2 className="font-serif text-2xl">Organization review</h2><p className="mt-1 text-sm text-[#776f63]">Indexed identities; each action is an actual Solana transaction.</p></div><div className="overflow-x-auto"><table className="min-w-[640px] w-full text-left text-sm"><thead className="bg-[#eee7db] text-xs uppercase text-[#776f63]"><tr><th className="p-4">Organization</th><th className="p-4">Status</th><th className="p-4">Verification</th><th className="p-4">Action</th></tr></thead><tbody>{organizations.map((org) => <tr key={org.address} className="border-t border-[#e6ded1]"><td className="p-4"><strong>{org.metadata?.name || org.address}</strong><p className="max-w-40 truncate font-mono text-xs text-[#776f63]">{org.address}</p></td><td className="p-4">{org.status}</td><td className="p-4">{org.verified ? "Verified" : "Awaiting review"}</td><td className="p-4">{isAdmin && org.status !== "Closed" ? <div className="flex flex-wrap gap-2"><button disabled={isSending} onClick={() => void act(() => setVerifiedIx(org, address(walletAddress), !org.verified), org.verified ? "Verification revoked" : "Organization verified")} className="border border-[#d8d0c2] px-2 py-1 text-xs font-bold disabled:opacity-50">{org.verified ? "Revoke" : "Verify"}</button>{org.verified && org.status !== "Active" && <button disabled={isSending} onClick={() => void act(() => setStatusIx(org, address(walletAddress), "Active"), "Organization activated")} className="bg-red-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">Activate</button>}</div> : <span className="text-xs text-[#776f63]">Read only</span>}</td></tr>)}{!loading && !organizations.length && <tr><td colSpan={4} className="p-8 text-center text-[#776f63]">No indexed organizations found.</td></tr>}</tbody></table></div></div>
    <div className="overflow-hidden border border-[#d8d0c2] bg-[#fffdf8]"><div className="border-b border-[#d8d0c2] p-5"><h2 className="font-serif text-2xl">Campaign activation gate</h2><p className="mt-1 text-sm text-[#776f63]">Only the config admin can make a submitted campaign active.</p></div><div className="divide-y divide-[#e6ded1]">{campaigns.filter((campaign) => campaign.status === "PendingReview" || campaign.status === "Active").map((campaign) => <article key={campaign.address} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><Link href={`/campaigns/${campaign.address}`} className="font-bold underline">Campaign #{campaign.campaignId.toString()}</Link><p className="mt-1 font-mono text-xs text-[#776f63]">{campaign.address}</p><span className={campaign.status === "Active" ? "mt-2 inline-block bg-[#dff1e1] px-2 py-1 text-xs font-bold text-[#29603a]" : "mt-2 inline-block bg-[#f6e6bd] px-2 py-1 text-xs font-bold text-[#815b13]"}>{campaign.status}</span></div>{isAdmin && campaign.status === "PendingReview" && <button disabled={isSending} onClick={() => void act(() => setCampaignStatusIx(campaign, address(walletAddress), "Active"), "Campaign activated")} className="bg-red-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Activate</button>}</article>)}{!loading && !campaigns.length && <p className="p-8 text-center text-[#776f63]">No campaign accounts found.</p>}</div></div></section>
    <section className="border border-[#d8d0c2] bg-[#fffdf8] p-5"><h2 className="font-serif text-2xl">Not yet implemented</h2><p className="mt-2 text-sm text-[#776f63]">Disaster-candidate feeds, fraud scoring, evidence verification, and system-health monitoring require services that are not in this project. They are intentionally not represented as live operational data.</p></section>
  </div></main>;
}
