"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { address } from "@solana/kit";
import { useCluster } from "../components/cluster-context";
import { WalletButton } from "../components/wallet-button";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import {
  fetchOrganization,
  organizationPda,
  rpcCall,
} from "../lib/organizations/chain";
import {
  createCampaignIx,
  listCampaigns,
  type Campaign,
} from "../lib/campaigns/chain";
import { parseSolAmount, displaySol } from "../lib/campaigns/amount";

type Item = { campaign: Campaign; title: string };
export default function CampaignsPage() {
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const [items, setItems] = useState<Item[]>([]);
  const [orgs, setOrgs] = useState<
    Awaited<ReturnType<typeof fetchOrganization>>[]
  >([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [disasterType, setDisasterType] = useState("");
  const [location, setLocation] = useState("");
  const [goal, setGoal] = useState("");
  const [org, setOrg] = useState("");
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const [stage, setStage] = useState("");
  const refresh = useCallback(async () => {
    if (cluster !== "devnet" && cluster !== "localnet") return;
    try {
      const campaigns = await listCampaigns(cluster);
      const listed = await Promise.all(
        campaigns.map(async (campaign) => {
          try {
            const res = await fetch(
              `/api/campaigns/metadata?uri=${encodeURIComponent(campaign.metadataUri)}`
            );
            const data = await res.json();
            return {
              campaign,
              title:
                data.digest === campaign.metadataDigest
                  ? (data.metadata.title as string)
                  : "Unverified campaign",
            };
          } catch {
            return { campaign, title: "Metadata unavailable" };
          }
        })
      );
      setItems(listed);
      if (walletAddress) {
        const mine = await fetchOrganization(
          cluster,
          await organizationPda(address(walletAddress))
        );
        const all = mine ? [mine] : [];
        const remote = await fetch(`/api/organizations?cluster=${cluster}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);
        for (const row of remote)
          if (
            row.authority === walletAddress &&
            !all.some((x) => x?.address === row.address)
          ) {
            const found = await fetchOrganization(
              cluster,
              address(row.address)
            );
            if (found) all.push(found);
          }
        setOrgs(all);
        if (all.length && !org) setOrg(all[0]!.address);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cluster, walletAddress, org]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  const create = async () => {
    setError("");
    setSignature("");
    try {
      if (!walletAddress) throw new Error("Connect a wallet");
      const selected = orgs.find((x) => x?.address === org);
      if (!selected || !selected.verified || selected.status !== "Active")
        throw new Error("Choose an active, verified organization");
      setStage("Saving metadata");
      const response = await fetch("/api/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "campaign",
          metadata: { title, description, disasterType, location },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const amount = parseSolAmount(goal);
      setStage("Awaiting wallet signature");
      const ix = await createCampaignIx(
        selected.address,
        address(walletAddress),
        selected.nextCampaignId,
        amount,
        null,
        body.digest,
        body.uri
      );
      const tx = await send({ instructions: [ix] });
      setSignature(tx);
      setStage("Confirming");
      for (let i = 0; i < 30; i++) {
        const result = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [tx],
          { searchTransactionHistory: true },
        ]);
        if (result.value[0]?.err)
          throw new Error("Transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            result.value[0]?.confirmationStatus || ""
          )
        ) {
          setStage("Campaign created");
          await refresh();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error(
        "Transaction submitted; confirmation timed out. Check the explorer before retrying."
      );
    } catch (e) {
      setStage("Failed");
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
      <header className="flex justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Campaigns</h1>
          <p className="text-muted">
            Canonical Devnet campaigns and SOL totals
          </p>
        </div>
        <WalletButton />
      </header>
      {cluster !== "devnet" && cluster !== "localnet" && (
        <p role="alert">Select Devnet or localnet to use campaigns.</p>
      )}
      {error && (
        <p role="alert" className="rounded border border-red-500 p-3">
          {error}
        </p>
      )}
      {stage && (
        <p role="status">
          {stage}{" "}
          {signature && (
            <a
              className="underline"
              href={getExplorerUrl(`/tx/${signature}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View transaction
            </a>
          )}
        </p>
      )}
      {orgs.some((x) => x?.verified && x.status === "Active") && (
        <section className="space-y-3 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Create campaign</h2>
          <p>
            Enter campaign details. They are saved and hash-verified by AidTrace.
          </p>
          <select
            className="w-full rounded border p-2"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
          >
            {orgs
              .filter((x) => x?.verified && x.status === "Active")
              .map((x) => (
                <option key={x!.address} value={x!.address}>
                  {x!.address}
                </option>
              ))}
          </select>
          <input className="w-full rounded border p-2" placeholder="Campaign title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="w-full rounded border p-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className="w-full rounded border p-2" placeholder="Disaster type" value={disasterType} onChange={(e) => setDisasterType(e.target.value)} />
          <input className="w-full rounded border p-2" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <input
            className="w-full rounded border p-2"
            placeholder="Goal in SOL"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <button
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
            disabled={isSending || !title || !description || !disasterType || !location || !goal}
            onClick={() => void create()}
          >
            Create draft
          </button>
        </section>
      )}
      <section className="grid gap-4 sm:grid-cols-2">
        {items.map(({ campaign, title }) => (
          <Link
            key={campaign.address}
            href={`/campaigns/${campaign.address}`}
            className="rounded-xl border p-5 hover:border-foreground"
          >
            <h2 className="text-xl font-semibold">{title}</h2>
            <p>
              {campaign.status} · {displaySol(campaign.amountRaised)} /{" "}
              {displaySol(campaign.targetAmount)} SOL
            </p>
            <p className="break-all text-xs text-muted">{campaign.address}</p>
          </Link>
        ))}
      </section>
      {!items.length && <p>No campaigns found on {cluster}.</p>}
    </main>
  );
}
