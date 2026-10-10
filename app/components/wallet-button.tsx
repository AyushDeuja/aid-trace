"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViewerRole } from "../lib/hooks/use-viewer-role";
import { useBalance } from "../lib/hooks/use-balance";
import { lamportsToSolString } from "../lib/lamports";
import { ellipsify } from "../lib/explorer";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "./cluster-context";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { connectors, connect, disconnect, wallet, status, error } =
    useWallet();
  const { getExplorerUrl } = useCluster();
  const { isAdmin, loading } = useViewerRole();
  const [copied, setCopied] = useState(false);
  const address = wallet?.account.address;
  const balance = useBalance(address);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  if (status !== "connected") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={compact ? "icon" : "sm"} aria-label="Connect wallet">
            <WalletCards />
            {!compact && "Connect wallet"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Connect a wallet</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {connectors.map((connector) => (
            <DropdownMenuItem
              key={connector.id}
              onSelect={() => void connect(connector.id)}
              disabled={status === "connecting"}
            >
              {connector.icon ? (
                <img src={connector.icon} alt="" className="size-5 rounded" />
              ) : (
                <WalletCards />
              )}
              {connector.name}
            </DropdownMenuItem>
          ))}
          {status === "connecting" && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Connecting...
            </p>
          )}
          {error != null && (
            <p className="px-2 py-1.5 text-xs text-destructive">
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          className="gap-2"
          aria-label="Open wallet menu"
        >
          <span
            className="size-2 rounded-full bg-emerald-500"
            aria-hidden="true"
          />
          {!compact && (
            <span className="font-mono">{ellipsify(address!, 4)}</span>
          )}
          {!compact && <ChevronDown />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Wallet</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="font-semibold tabular-nums">
            {balance.lamports == null
              ? "—"
              : lamportsToSolString(balance.lamports)}{" "}
            SOL
          </p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {address}
          </p>
        </div>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void copyAddress()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Address copied" : "Copy address"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={getExplorerUrl(`/address/${address}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink /> Open in explorer
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {isAdmin && !loading && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Admin tools</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/admin/disasters">Disasters</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/fraud">Fraud review</Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void disconnect()}
        >
          <LogOut />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
