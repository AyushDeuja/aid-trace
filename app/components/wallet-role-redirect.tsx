"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  resolveWorkspace,
  useViewerRole,
  workspaceHome,
} from "../lib/hooks/use-viewer-role";
import { useWallet } from "../lib/wallet/context";

/**
 * Keeps a connected wallet in its canonical workspace after a connect,
 * address switch, role refresh, or restored wallet session.
 */
export function WalletRoleRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const { wallet } = useWallet();
  const role = useViewerRole();

  useEffect(() => {
    // An address may be an admin or organization authority. Do not briefly
    // route it as a donor while its canonical accounts are still loading.
    if (wallet && role.loading) return;

    const workspace = resolveWorkspace({
      isConnected: Boolean(wallet),
      isAdmin: role.isAdmin,
      isOrganizationAuthority: role.isOrganizationAuthority,
    });
    const destination = workspaceHome(workspace);

    if (pathname !== destination) {
      router.replace(destination);
    }
  }, [
    pathname,
    role.isAdmin,
    role.isOrganizationAuthority,
    role.loading,
    router,
    wallet,
  ]);

  return null;
}
