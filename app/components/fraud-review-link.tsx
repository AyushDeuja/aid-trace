"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCluster } from "./cluster-context";
import { useWallet } from "../lib/wallet/context";
import { fetchAdmin } from "../lib/organizations/chain";

export function FraudReviewLink() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const walletAddress = wallet?.account.address;

  useEffect(() => {
    let current = true;
    if (!walletAddress || (cluster !== "devnet" && cluster !== "localnet")) {
      const timer = window.setTimeout(() => { if (current) setIsAdmin(false); }, 0);
      return () => { current = false; window.clearTimeout(timer); };
    }
    void fetchAdmin(cluster)
      .then((admin) => { if (current) setIsAdmin(admin === walletAddress); })
      .catch(() => { if (current) setIsAdmin(false); });
    return () => { current = false; };
  }, [cluster, walletAddress]);

  return isAdmin ? <Link href="/admin/fraud" className="text-sm underline">Fraud review</Link> : null;
}
