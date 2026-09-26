"use client";

import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { toast } from "sonner";
import { ClusterSelect } from "./cluster-select";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";
import { useCluster } from "./cluster-context";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function SiteHeader() {
  const { cluster } = useCluster();
  return <header className="sticky top-0 z-30 border-b border-[#d8d0c2] bg-[#f7f4ed]/90 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 md:px-7">
    <Link href="/" className="flex items-center gap-2.5" aria-label="AidTrace home"><span className="relative grid size-9 place-items-center overflow-hidden bg-[#1c1915]"><i className="absolute h-px w-12 rotate-45 bg-[#f7f4ed]" /><i className="absolute h-px w-12 -rotate-45 bg-[#f7f4ed]" /></span><span className="font-serif text-xl font-semibold">AidTrace</span></Link>
    <nav className="hidden items-center gap-6 text-sm font-bold md:flex"><Link href="/campaigns" className="hover:text-red-700">Campaigns</Link><Link href="/#how-it-works" className="hover:text-red-700">How it works</Link><Link href="/org" className="hover:text-red-700">Organizations</Link></nav>
    <div className="flex items-center gap-2"><Badge variant="success" className="hidden lg:inline-flex">{cluster} · live</Badge><Button variant="ghost" size="icon" onClick={() => toast.info("Search campaigns, transactions and addresses")} aria-label="Search"><Search className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => toast.info("3 updates in your audit feed")} aria-label="Notifications"><Bell className="size-4" /></Button><ThemeToggle /><ClusterSelect /><WalletButton /></div>
  </div></header>;
}
