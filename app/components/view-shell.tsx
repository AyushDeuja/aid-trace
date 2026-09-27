"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { toast } from "sonner";
import { ClusterSelect } from "./cluster-select";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";
import { useCluster } from "./cluster-context";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const views = [
  { href: "/", label: "Public", matches: (path: string) => path === "/" || path.startsWith("/campaigns") || path.startsWith("/organizations") },
  { href: "/organization", label: "Organization", matches: (path: string) => path.startsWith("/organization") },
  { href: "/donor", label: "Donor", matches: (path: string) => path.startsWith("/donor") },
  { href: "/admin", label: "Admin", matches: (path: string) => path.startsWith("/admin") },
];

function Brand() {
  return <Link href="/" className="flex items-center gap-2.5" aria-label="AidTrace home"><span className="relative grid size-9 place-items-center overflow-hidden bg-[#1c1915]"><i className="absolute h-px w-12 rotate-45 bg-[#f7f4ed]" /><i className="absolute h-px w-12 -rotate-45 bg-[#f7f4ed]" /></span><span className="font-serif text-xl font-semibold">AidTrace</span></Link>;
}

function Controls() {
  const { cluster } = useCluster();
  return <div className="flex items-center gap-2"><Badge variant="success" className="hidden lg:inline-flex">{cluster} · live</Badge><Button variant="ghost" size="icon" onClick={() => toast.info("Search campaigns, transactions and addresses")} aria-label="Search"><Search className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => toast.info("3 updates in your audit feed")} aria-label="Notifications"><Bell className="size-4" /></Button><ThemeToggle /><ClusterSelect /><WalletButton /></div>;
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return <><header className="sticky top-0 z-30 border-b border-[#d8d0c2] bg-[#f7f4ed]/90 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 md:px-7"><Brand /><nav className="hidden items-center gap-6 text-sm font-bold md:flex"><Link href="/campaigns" className="hover:text-red-700">Campaigns</Link><Link href="/#how-it-works" className="hover:text-red-700">How it works</Link><Link href="/organizations" className="hover:text-red-700">Organizations</Link></nav><Controls /></div></header>{children}</>;
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <><header className="sticky top-0 z-30 border-b border-[#d8d0c2] bg-[#f7f4ed]/90 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-7"><Brand /><nav aria-label="Application views" className="order-3 flex w-full gap-1 overflow-x-auto border-t border-[#d8d0c2] pt-2 text-sm font-bold md:order-none md:w-auto md:border-0 md:pt-0">{views.map((view) => <Link key={view.href} href={view.href} aria-current={view.matches(pathname) ? "page" : undefined} className={`whitespace-nowrap px-3 py-2 ${view.matches(pathname) ? "bg-[#1c1915] text-white" : "hover:bg-[#eee7db]"}`}>{view.label}</Link>)}</nav><Controls /></div></header>{children}</>;
}
