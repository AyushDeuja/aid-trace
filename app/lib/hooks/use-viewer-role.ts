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

const publicRole: ViewerRole = {
  isAdmin: false,
  isOrganizationAuthority: false,
  loading: false,
};

/** Derives navigation roles from canonical Solana accounts, never browser claims. */
export function useViewerRole(): ViewerRole {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const walletAddress = wallet?.account.address;
  const [role, setRole] = useState<ViewerRole>(publicRole);

  useEffect(() => {
    let active = true;
    const update = (next: ViewerRole) => {
      queueMicrotask(() => {
        if (active) setRole(next);
      });
    };
    if (!walletAddress) {
      update(publicRole);
      return () => {
        active = false;
      };
    }

    update({ ...publicRole, loading: true });
    void Promise.all([
      fetchAdmin(cluster),
      organizationPda(address(walletAddress)).then((key) =>
        fetchOrganization(cluster, key)
      ),
    ])
      .then(([admin, organization]) => {
        if (!active) return;
        update({
          isAdmin: admin === walletAddress,
          isOrganizationAuthority: organization?.authority === walletAddress,
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

  return role;
}
