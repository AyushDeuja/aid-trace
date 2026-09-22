"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { address } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { WalletButton } from "../../components/wallet-button";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import {
  fetchAdmin,
  fetchOrganization,
  rpcCall,
} from "../../lib/organizations/chain";
import {
  donateIx,
  fetchCampaign,
  setCampaignStatusIx,
  submitCampaignIx,
  updateCampaignIx,
  type Campaign,
} from "../../lib/campaigns/chain";
import { displaySol, parseSolAmount } from "../../lib/campaigns/amount";

export default function CampaignDetailPage() {
  const params = useParams<{ address: string }>();
  const { cluster, getExplorerUrl } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [admin, setAdmin] = useState<string | null>(null);
  const [organizationAuthority, setOrganizationAuthority] = useState<
    string | null
  >(null);
  const [amount, setAmount] = useState("");
  const [goal, setGoal] = useState("");
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [signature, setSignature] = useState("");
  const refresh = useCallback(async () => {
    try {
      if (cluster !== "devnet" && cluster !== "localnet") return;
      const c = await fetchCampaign(cluster, address(params.address));
      setCampaign(c);
      setAdmin(await fetchAdmin(cluster));
      if (c) {
        setOrganizationAuthority(
          (await fetchOrganization(cluster, c.organization))?.authority || null
        );
        setGoal(displaySol(c.targetAmount));
        setUri(c.metadataUri);
        const response = await fetch(
          `/api/campaigns/metadata?uri=${encodeURIComponent(c.metadataUri)}`
        );
        const data = await response.json();
        if (response.ok && data.digest === c.metadataDigest) {
          setTitle(data.metadata.title);
          setDescription(data.metadata.description);
        } else {
          setTitle("Unverified metadata");
          setDescription("");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cluster, params.address]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  const transact = async (
    build: () => Promise<Parameters<typeof send>[0]["instructions"][number]>,
    success: string
  ) => {
    setError("");
    setSignature("");
    try {
      setStage("Awaiting wallet signature");
      const tx = await send({ instructions: [await build()] });
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
          setStage(success);
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
  const update = async () => {
    if (!campaign || !walletAddress) return;
    try {
      const response = await fetch(
        `/api/campaigns/metadata?uri=${encodeURIComponent(uri)}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await transact(
        () =>
          updateCampaignIx(
            campaign,
            address(walletAddress),
            parseSolAmount(goal),
            campaign.endsAt,
            data.digest,
            uri
          ),
        "Campaign updated"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <header className="flex justify-between">
        <Link className="underline" href="/campaigns">
          Campaigns
        </Link>
        <WalletButton />
      </header>
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
      {campaign ? (
        <>
          <h1 className="text-3xl font-semibold">{title || "Campaign"}</h1>
          <p>{description}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt>Status</dt>
              <dd>{campaign.status}</dd>
            </div>
            <div>
              <dt>Raised / goal</dt>
              <dd>
                {displaySol(campaign.amountRaised)} /{" "}
                {displaySol(campaign.targetAmount)} SOL
              </dd>
            </div>
            <div>
              <dt>Donations</dt>
              <dd>{campaign.nextDonationId.toString()}</dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd className="break-all text-sm">{campaign.organization}</dd>
            </div>
          </dl>
          <a
            className="underline"
            href={getExplorerUrl(`/address/${campaign.address}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View campaign on explorer
          </a>
          <section className="space-y-3 rounded-xl border p-5">
            <h2 className="text-xl font-semibold">Donate SOL</h2>
            <input
              className="w-full rounded border p-2"
              placeholder="Amount in SOL"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
              disabled={
                isSending ||
                !walletAddress ||
                !amount ||
                campaign.status !== "Active"
              }
              onClick={() =>
                void transact(
                  () =>
                    donateIx(
                      campaign,
                      address(walletAddress!),
                      parseSolAmount(amount)
                    ),
                  "Donation confirmed"
                )
              }
            >
              Donate with wallet
            </button>
            {campaign.status !== "Active" && (
              <p>Donations open when the admin activates this campaign.</p>
            )}
          </section>
          {walletAddress === admin && (
            <section className="space-x-3 rounded-xl border p-5">
              <h2 className="mb-3 text-xl font-semibold">Admin review</h2>
              {(["Active", "Paused", "Closed"] as const).map((status) => (
                <button
                  key={status}
                  className="rounded border px-3 py-2 disabled:opacity-50"
                  disabled={isSending || campaign.status === status}
                  onClick={() =>
                    void transact(
                      () =>
                        setCampaignStatusIx(
                          campaign,
                          address(walletAddress),
                          status
                        ),
                      `Campaign ${status.toLowerCase()}`
                    )
                  }
                >
                  {status}
                </button>
              ))}
            </section>
          )}
          {walletAddress && walletAddress === organizationAuthority && (
            <section className="space-y-3 rounded-xl border p-5">
              <h2 className="text-xl font-semibold">Manage campaign</h2>
              <input
                className="w-full rounded border p-2"
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                aria-label="Metadata URI"
              />
              <input
                className="w-full rounded border p-2"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                aria-label="Goal in SOL"
              />
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={isSending}
                onClick={() => void update()}
              >
                Update draft
              </button>
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={isSending || campaign.status !== "Draft"}
                onClick={() =>
                  void transact(
                    () => submitCampaignIx(campaign, address(walletAddress)),
                    "Submitted for review"
                  )
                }
              >
                Submit for review
              </button>
            </section>
          )}
        </>
      ) : (
        <p>Campaign not found.</p>
      )}
    </main>
  );
}
