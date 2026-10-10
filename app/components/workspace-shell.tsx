"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { type PropsWithChildren, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { resolveWorkspace, useViewerRole, type Workspace } from "../lib/hooks/use-viewer-role";
import { workspaceNavigation, type NavigationItem } from "../lib/navigation";
import { useWallet } from "../lib/wallet/context";

const labels: Record<Exclude<Workspace, "public">, string> = {
  donor: "DONOR WORKSPACE",
  organization: "ORGANIZATION WORKSPACE",
  admin: "ADMIN WORKSPACE",
};

function workspaceForPath(pathname: string, workspace: Workspace) {
  if (pathname.startsWith("/admin")) return workspace === "admin" ? workspace : null;
  if (pathname.startsWith("/org"))
    return workspace === "admin" || workspace === "organization" ? workspace : null;
  if (pathname.startsWith("/dashboard")) return workspace === "donor" ? workspace : null;
  return null;
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/org" && pathname.startsWith(`${href}/`));
}

function WorkspaceLinks({ items, pathname, close }: { items: NavigationItem[]; pathname: string; close?: boolean }) {
  return (
    <nav className="space-y-1" aria-label="Workspace navigation">
      {items.map((item) => {
        const link = (
          <Link
            href={item.href}
            className={cn(
              "block rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(pathname, item.href)
                ? "bg-[#17130e] text-[#fffaf0]"
                : "text-foreground hover:bg-[#eee9e1]"
            )}
          >
            {item.label}
          </Link>
        );
        return close ? <SheetClose asChild key={item.href}>{link}</SheetClose> : <div key={item.href}>{link}</div>;
      })}
    </nav>
  );
}

export function WorkspaceShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { wallet } = useWallet();
  const role = useViewerRole();
  const workspace = useMemo(
    () => resolveWorkspace({ isConnected: Boolean(wallet), ...role }),
    [wallet, role]
  );
  const activeWorkspace = role.loading ? null : workspaceForPath(pathname, workspace);

  if (!activeWorkspace) return <>{children}</>;

  const items = workspaceNavigation[activeWorkspace];
  const label = labels[activeWorkspace];
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#faf8f4] text-foreground dark:bg-background">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-[#ddd7cf] bg-[#fdfcf9] px-4 py-5 lg:block dark:bg-card">
          <p className="mb-4 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">{label}</p>
          <WorkspaceLinks items={items} pathname={pathname} />
        </aside>
        <div className="min-w-0 flex-1">
          <div className="border-b border-[#ddd7cf] px-4 py-3 lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" aria-label="Open workspace navigation">
                  <Menu /> {label}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-[#fdfcf9] p-4 dark:bg-card">
                <SheetTitle className="mb-5 text-xs tracking-wide text-muted-foreground">{label}</SheetTitle>
                <WorkspaceLinks items={items} pathname={pathname} close />
              </SheetContent>
            </Sheet>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
