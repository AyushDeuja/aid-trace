"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PropsWithChildren } from "react";
import { ClusterProvider } from "./cluster-context";
import { WalletProvider } from "../lib/wallet/context";
import { SolanaClientProvider } from "../lib/solana-client-context";
import { WalletRoleRedirect } from "./wallet-role-redirect";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <ClusterProvider>
        <SolanaClientProvider>
          <WalletProvider>
            <WalletRoleRedirect />
            {children}
          </WalletProvider>
        </SolanaClientProvider>
        <Toaster position="bottom-right" richColors />
      </ClusterProvider>
    </ThemeProvider>
  );
}
