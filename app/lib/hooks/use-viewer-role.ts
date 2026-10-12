"use client";

import { useEffect, useState } from "react";
import { address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../wallet/context";
import {
  fetchAdmin,
  fetchOrganization,
  organizationPda,
} from "../organizations/chain";

export type ViewerRole = {
  isAdmin: boolean;
  isOrganizationAuthority: boolean;
  loading: boolean;
};

export type Workspace = "public" | "donor" | "organization" | "admin";

const publicRole: ViewerRole = {
  isAdmin: false,
  isOrganizationAuthority: false,
  loading: false,
};

type ResolvedViewerRole = Omit<ViewerRole, "loading">;
const roleReadCache = new Map<
  string,
  { promise: Promise<ResolvedViewerRole>; expiresAt: number }
>();

function readViewerRole(cluster: string, walletAddress: string) {
  const key = `${cluster}:${walletAddress}`;
  const cached = roleReadCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = Promise.all([
    fetchAdmin(cluster as Parameters<typeof fetchAdmin>[0]),
    organizationPda(address(walletAddress)).then((key) =>
      fetchOrganization(cluster as Parameters<typeof fetchOrganization>[0], key)
    ),
  ])
    .then(([admin, organization]) => ({
      isAdmin: admin === walletAddress,
      isOrganizationAuthority: organization?.authority === walletAddress,
    }))
    .catch((error) => {
      roleReadCache.delete(key);
      throw error;
    });
  roleReadCache.set(key, { promise, expiresAt: Date.now() + 15_000 });
  return promise;
}

/** Derives navigation roles from canonical Solana accounts, never browser claims. */
export function useViewerRole(): ViewerRole {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const walletAddress = wallet?.account.address;
  const [role, setRole] = useState<ViewerRole & { walletAddress?: string }>(
    publicRole
  );

  useEffect(() => {
    let active = true;
    const update = (next: ViewerRole) => {
      queueMicrotask(() => {
        if (active) setRole({ ...next, walletAddress });
      });
    };
    if (!walletAddress) {
      update(publicRole);
      return () => {
        active = false;
      };
    }

    update({ ...publicRole, loading: true });
    void readViewerRole(cluster, walletAddress)
      .then((resolved) => {
        if (!active) return;
        update({
          ...resolved,
          loading: false,
        });
      })
      .catch(() => {
        update(publicRole);
      });

    return () => {
      active = false;
    };
  }, [cluster, walletAddress]);

  // A role result belongs only to the wallet that produced it. This avoids a
  // brief donor/public render while a newly connected wallet is being checked.
  if (walletAddress && role.walletAddress !== walletAddress) {
    return { ...publicRole, loading: true };
  }

  return role;
}

/** Admin takes precedence when one canonical wallet holds both roles. */
export function resolveWorkspace({
  isConnected,
  isAdmin,
  isOrganizationAuthority,
}: {
  isConnected: boolean;
  isAdmin: boolean;
  isOrganizationAuthority: boolean;
}): Workspace {
  if (!isConnected) return "public";
  if (isAdmin) return "admin";
  if (isOrganizationAuthority) return "organization";
  return "donor";
}
