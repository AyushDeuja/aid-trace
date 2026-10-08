"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchAdmin } from "../lib/organizations/chain";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "./cluster-context";

export function DisasterReviewLink() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const walletAddress = wallet?.account.address;
  useEffect(() => {
    let current = true;
    if (!walletAddress || (cluster !== "devnet" && cluster !== "localnet")) {
      setIsAdmin(false);
      return () => { current = false; };
    }
    void fetchAdmin(cluster).then((admin) => {
      if (current) setIsAdmin(admin === walletAddress);
    }).catch(() => { if (current) setIsAdmin(false); });
    return () => { current = false; };
  }, [cluster, walletAddress]);
  return isAdmin ? <Link href="/admin/disasters" className="text-sm underline">Disasters</Link> : null;
}
