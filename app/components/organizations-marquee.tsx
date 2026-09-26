"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCluster } from "./cluster-context";

type Organization = {
  address: string;
  authority: string;
  status: string;
  verified: boolean;
  metadata?: { name: string } | null;
};

const samples: Organization[] = [
  { address: "HRN6…aF21", authority: "7F3x…k2P9", status: "Active", verified: true, metadata: { name: "Himalayan Relief Network" } },
  { address: "OSC9…dE88", authority: "Bq8n…Zt44", status: "Active", verified: true, metadata: { name: "Open Shelter Collective" } },
  { address: "CMA4…pX19", authority: "9aQ2…mL60", status: "Pending", verified: false, metadata: { name: "Coastline Mutual Aid" } },
];

function OrganizationCard({ organization, sample }: { organization: Organization; sample: boolean }) {
  const name = organization.metadata?.name || "Unnamed organization";
  const initials = name.split(" ").map((word) => word[0]).slice(0, 2).join("");
  return <article className="w-[290px] shrink-0 border border-white/25 bg-white/10 p-5 text-white shadow-[0_18px_45px_-32px_black] backdrop-blur-md">
    <div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-full border border-white/30 bg-white/10 text-sm font-bold">{initials}</span><span className={organization.verified ? "border border-emerald-300/30 bg-emerald-300/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100" : "border border-amber-300/30 bg-amber-300/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100"}>{organization.verified ? "Verified" : organization.status}</span></div>
    <h3 className="mt-5 truncate font-serif text-2xl">{name}</h3><p className="mt-1 text-xs text-white/60">Humanitarian organization · {organization.status}</p>
    <div className="mt-5 border-t border-white/15 pt-3"><p className="font-mono text-xs text-white/65">{organization.address}</p><p className="mt-1 text-xs text-white/45">Authority {organization.authority.slice(0, 10)}…</p></div>
    <div className="mt-4 flex items-center justify-between text-xs"><span className="text-cyan-200">● indexed profile</span>{sample ? <span className="text-white/45">sample</span> : <Link href="/org" className="font-bold underline">View profile →</Link>}</div>
  </article>;
}

export function OrganizationsMarquee() {
  const { cluster } = useCluster();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [sample, setSample] = useState(false);
  const load = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") { setOrganizations(samples); setSample(true); return; }
    try {
      const response = await fetch(`/api/organizations?cluster=${cluster}`);
      const data = response.ok ? await response.json() as Organization[] : [];
      setOrganizations(data.length ? data : samples); setSample(!data.length);
    } catch { setOrganizations(samples); setSample(true); }
  }, [cluster]);
  useEffect(() => { void load(); }, [load]);
  const cards = organizations.length ? organizations : samples;
  return <section className="overflow-hidden bg-[#11100e] py-16 text-white" aria-labelledby="top-organizations-title">
    <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-4 px-5 md:px-8"><div><p className="mb-3 text-xs font-extrabold tracking-[.12em] text-cyan-200">— ORGANIZATION REGISTRY</p><h2 id="top-organizations-title" className="font-serif text-4xl">Organizations making aid visible.</h2><p className="mt-2 max-w-xl text-sm text-white/65">Short profiles from the AidTrace organization index, moving as a live-registry preview.</p></div><Link href="/org" className="text-sm font-bold underline">View organizations →</Link></div>
    <div className="organizations-marquee-track mt-10 flex w-max gap-5 px-5 md:px-8">{[...cards, ...cards, ...cards].map((organization, index) => <OrganizationCard key={`${organization.address}-${index}`} organization={organization} sample={sample} />)}</div>
    <p className="mx-auto mt-7 max-w-[1400px] px-5 text-xs text-white/45 md:px-8">{sample ? "Sample profiles are shown because no indexed organization data was available for the selected cluster." : "Names, addresses, verification and status are loaded from the indexed organization registry."}</p>
  </section>;
}
