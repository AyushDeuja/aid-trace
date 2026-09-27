"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCluster } from "../../components/cluster-context";
import { Badge } from "../../components/ui/badge";

type Organization = { address: string; authority: string; status: string; verified: boolean; metadata?: { name: string; description?: string; website?: string } | null };

export default function OrganizationsPage() {
  const { cluster } = useCluster();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") { setOrganizations([]); setLoading(false); return; }
    setLoading(true); setError("");
    try { const response = await fetch(`/api/organizations?cluster=${cluster}`); if (!response.ok) throw new Error("The organization registry could not be loaded."); setOrganizations(await response.json() as Organization[]); }
    catch (cause) { setOrganizations([]); setError(cause instanceof Error ? cause.message : "The organization registry could not be loaded."); }
    finally { setLoading(false); }
  }, [cluster]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return <main className="min-h-screen bg-[#f7f4ed] px-5 py-8 text-[#302a21] md:px-8 md:py-10"><div className="mx-auto max-w-[1216px] space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d8d0c2] pb-7"><div><p className="mb-2 text-xs font-extrabold tracking-[.12em] text-red-700">— PUBLIC ORGANIZATION REGISTRY</p><h1 className="font-serif text-4xl">Organizations making aid visible.</h1><p className="mt-2 max-w-2xl text-[#776f63]">Explore indexed aid organizations and their canonical verification status on the selected Solana cluster.</p></div><Link href="/organization" className="border border-[#d8d0c2] bg-[#fffdf8] px-4 py-2 text-sm font-bold hover:bg-[#eee7db]">Organization workspace →</Link></header>
    {cluster !== "devnet" && cluster !== "localnet" && <p className="border border-amber-500 bg-amber-50 p-4 text-sm">Select Devnet or localnet to browse indexed organizations.</p>}{error && <p role="alert" className="border border-red-500 bg-red-50 p-4 text-sm">{error}</p>}
    {loading ? <p className="text-[#776f63]">Loading indexed organizations…</p> : organizations.length ? <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{organizations.map((organization) => <article key={organization.address} className="border border-[#d8d0c2] bg-[#fffdf8] p-5 shadow-[0_8px_30px_-26px_#302a21]"><div className="flex items-start justify-between gap-4"><div><h2 className="font-serif text-2xl">{organization.metadata?.name || "Unnamed organization"}</h2><p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#776f63]">{organization.status}</p></div><Badge variant={organization.verified ? "success" : "warning"}>{organization.verified ? "Verified" : "Unverified"}</Badge></div><p className="mt-4 min-h-12 text-sm leading-relaxed text-[#776f63]">{organization.metadata?.description || "This indexed organization has not published a public description."}</p><dl className="mt-5 space-y-2 border-t border-[#e6ded1] pt-4 text-xs"><div><dt className="font-bold uppercase tracking-wide text-[#776f63]">Organization address</dt><dd className="mt-1 break-all font-mono">{organization.address}</dd></div><div><dt className="font-bold uppercase tracking-wide text-[#776f63]">Authority</dt><dd className="mt-1 break-all font-mono">{organization.authority}</dd></div></dl>{organization.metadata?.website && <a className="mt-5 inline-block text-sm font-bold underline" href={organization.metadata.website} target="_blank" rel="noreferrer">Visit website →</a>}</article>)}</section> : <section className="border border-dashed border-[#bdb3a3] bg-[#fffdf8] p-10 text-center"><h2 className="font-serif text-2xl">No indexed organizations found.</h2><p className="mt-2 text-sm text-[#776f63]">Organization profiles will appear here after they are registered and indexed on {cluster}.</p></section>}
  </div></main>;
}
