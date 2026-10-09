"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCluster } from "./cluster-context";
import { useWallet } from "../lib/wallet/context";
import { fetchAdmin } from "../lib/organizations/chain";
export function AdminReviewLink() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let live = true;
    if (!wallet) return;
    void fetchAdmin(cluster)
      .then((a) => live && setAdmin(a === wallet.account.address))
      .catch(() => live && setAdmin(false));
    return () => {
      live = false;
    };
  }, [cluster, wallet]);
  return admin ? (
    <Link href="/admin/review" className="text-sm underline">
      Admin review
    </Link>
  ) : null;
}
