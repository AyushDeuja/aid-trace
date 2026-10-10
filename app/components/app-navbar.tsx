"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewerRole } from "../lib/hooks/use-viewer-role";
import { primaryNavigation } from "../lib/navigation";
import { useWallet } from "../lib/wallet/context";
import { ClusterSelect } from "./cluster-select";
import { WalletButton } from "./wallet-button";

function NavLinks() {
  const { isAdmin, isOrganizationAuthority } = useViewerRole();
  const { wallet } = useWallet();
  const itemClass =
    "text-sm font-medium text-foreground/80 transition-colors hover:text-foreground";

  return (
    <>
      {primaryNavigation({
        isConnected: Boolean(wallet),
        isAdmin,
        isOrganizationAuthority,
      }).map((item) => (
        <Link key={item.href} href={item.href} className={itemClass}>
          {item.label}
        </Link>
      ))}
    </>
  );
}

export function AppNavbar() {
  return (
    <header className="sticky top-0 z-40 overflow-x-auto border-b border-[#ddd7cf] bg-[#faf8f4]/95 backdrop-blur supports-[backdrop-filter]:bg-[#faf8f4]/80 dark:border-border dark:bg-background/95 dark:supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 w-full min-w-max items-center gap-7 px-5 sm:px-7">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="AidTrace home"
        >
          <Image
            src="/aidtrace-logo.png"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-md object-contain"
            priority
          />
          <span className="font-serif text-xl font-semibold tracking-tight">
            AidTrace
          </span>
        </Link>

        <nav
          className="flex items-center gap-7"
          aria-label="Primary navigation"
        >
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ClusterSelect />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
