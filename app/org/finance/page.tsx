"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { address, type Address, type Instruction } from "@solana/kit";
import { WalletButton } from "../../components/wallet-button";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import {
  fetchOrganization,
  organizationPda,
} from "../../lib/organizations/chain";
import { listCampaigns, type Campaign } from "../../lib/campaigns/chain";
import {
  availableFunds,
  allocationPda,
  cancelAllocationIx,
  createAllocationIx,
  disbursementPda,
  listAllocations,
  listDisbursements,
  recordDisbursementIx,
  type Allocation,
  type Disbursement,
} from "../../lib/finance/chain";

const LAMPORTS = 1_000_000_000n;
function sol(value: bigint) {
  return `${(Number(value) / Number(LAMPORTS)).toFixed(4)} SOL`;
}
function lamports(value: string) {
  if (!/^\d+(\.\d{0,9})?$/.test(value))
    throw new Error("Enter a valid SOL amount");
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * LAMPORTS + BigInt((fraction + "000000000").slice(0, 9))
  );
}

export default function FinancePage() {
  const { wallet } = useWallet();
  const { cluster, getExplorerUrl } = useCluster();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const supported = cluster === "localnet" || cluster === "devnet";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [history, setHistory] = useState<{
    allocations: Array<Record<string, string>>;
    disbursements: Array<Record<string, string>>;
  } | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutDescription, setPayoutDescription] = useState("");
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState("");
  const [signature, setSignature] = useState("");

  const refresh = useCallback(async () => {
    if (!supported || !walletAddress) return;
    const org = await fetchOrganization(
      cluster,
      await organizationPda(address(walletAddress))
    );
    if (!org) {
      setCampaigns([]);
      setSelected(null);
      return;
    }
    const own = (await listCampaigns(cluster)).filter(
      (campaign) => campaign.organization === org.address
    );
    setCampaigns(own);
    const current =
      own.find((campaign) => campaign.address === selected?.address) ||
      own[0] ||
      null;
    setSelected(current);
    if (current) {
      const [nextAllocations, nextDisbursements] = await Promise.all([
        listAllocations(cluster, current.address),
        listDisbursements(cluster, current.address),
      ]);
      setAllocations(nextAllocations);
      setDisbursements(nextDisbursements);
      const response = await fetch(
        `/api/finance/history?campaign=${current.address}`
      );
      setHistory(response.ok ? await response.json() : null);
    } else {
      setAllocations([]);
      setDisbursements([]);
      setHistory(null);
    }
  }, [cluster, selected?.address, supported, walletAddress]);
  useEffect(() => {
    void refresh().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "Could not load finance data"
      )
    );
  }, [refresh]);
  const canManage =
    !!selected &&
    selected.authority === walletAddress &&
    selected.status === "Active";
  const transact = async (
    build: () => Promise<Instruction>,
    after?: (signature: string) => Promise<void>
  ) => {
    setMessage("");
    setSignature("");
    setStage("Preparing");
    try {
      const instruction = await build();
      setStage("Awaiting wallet signature");
      const next = await send({ instructions: [instruction] });
      setSignature(next);
      if (after) await after(next);
      setStage("Confirmed on Solana");
      await refresh();
    } catch (error) {
      setStage("Failed");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const metrics = useMemo(
    () =>
      selected
        ? {
            raised: selected.amountRaised,
            reserved: selected.amountReserved,
            disbursed: selected.amountDisbursed,
            available: availableFunds(selected),
          }
        : null,
    [selected]
  );
  const indexed = useMemo(
    () =>
      new Map(
        [
          ...(history?.allocations || []),
          ...(history?.disbursements || []),
        ].map((item) => [item.address, item])
      ),
    [history]
  );
  const createAllocation = () => {
    if (!selected || !walletAddress) return;
    let metadata: { digest: string; uri: string } | undefined;
    const allocationId = selected.nextAllocationId;
    void transact(
      async () => {
        const metadata = await fetch("/api/metadata", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "allocation",
            metadata: { purpose, category, description },
          }),
        }).then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(
              body.error || "Could not create allocation metadata"
            );
          return body as { digest: string; uri: string };
        });
        return createAllocationIx(
          selected,
          address(walletAddress),
          address(recipient),
          lamports(amount),
          metadata.digest
        );
      },
      async (signature) => {
        await fetch("/api/finance/metadata-link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address: await allocationPda(selected.address, allocationId),
            kind: "allocation",
            digest: metadata!.digest,
            uri: metadata!.uri,
            signature,
          }),
        });
      }
    );
  };
  const payout = (allocation: Allocation) => {
    if (!selected || !walletAddress) return;
    let metadata: { digest: string; uri: string } | undefined;
    const disbursementId = allocation.nextDisbursementId;
    void transact(
      async () => {
        const metadata = await fetch("/api/metadata", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "disbursement",
            metadata: { description: payoutDescription },
          }),
        }).then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(
              body.error || "Could not create disbursement metadata"
            );
          return body as { digest: string; uri: string };
        });
        return recordDisbursementIx(
          allocation,
          selected,
          address(walletAddress),
          lamports(payoutAmount),
          metadata.digest
        );
      },
      async (signature) => {
        await fetch("/api/finance/metadata-link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address: await disbursementPda(allocation.address, disbursementId),
            kind: "disbursement",
            digest: metadata!.digest,
            uri: metadata!.uri,
            signature,
          }),
        });
      }
    );
  };
  return (
    <main className="mx-auto max-w-6xl space-y-7 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Organization finance</h1>
          <p className="text-sm text-muted">
            Canonical Solana balances, allocations, and disbursements.
          </p>
        </div>
        <WalletButton />
      </header>
      {!supported && (
        <p role="alert" className="rounded border p-4">
          Finance controls are available on localnet and Devnet.
        </p>
      )}
      {stage && (
        <p role="status">
          Transaction: {stage}
          {signature && (
            <>
              {" "}
              ·{" "}
              <a
                className="underline"
                href={getExplorerUrl(`/tx/${signature}`)}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
              </a>
            </>
          )}
        </p>
      )}
      {message && (
        <p role="alert" className="rounded border border-red-500 p-3">
          {message}
        </p>
      )}
      {!walletAddress && (
        <p className="rounded border p-4">
          Connect the active organization authority wallet to manage funds.
        </p>
      )}
      {walletAddress && !selected && (
        <p className="rounded border p-4">
          No campaigns owned by this wallet were found.
        </p>
      )}
      {selected && (
        <>
          <label className="block text-sm">
            Campaign
            <select
              className="mt-1 w-full rounded border p-2"
              value={selected.address}
              onChange={(event) =>
                setSelected(
                  campaigns.find(
                    (campaign) => campaign.address === event.target.value
                  ) || null
                )
              }
            >
              {campaigns.map((campaign) => (
                <option key={campaign.address} value={campaign.address}>
                  Campaign #{campaign.campaignId.toString()} · {campaign.status}
                </option>
              ))}
            </select>
          </label>
          {metrics && (
            <section className="grid gap-3 sm:grid-cols-4">
              {Object.entries(metrics).map(([label, value]) => (
                <div key={label} className="rounded-xl border p-4">
                  <p className="capitalize text-sm text-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{sol(value)}</p>
                </div>
              ))}
            </section>
          )}
          <p className="text-sm text-muted">
            Delivery verification: Pending Task 5.
          </p>
          <p className="text-sm text-muted">
            {history
              ? "Audit history indexed from confirmed Solana data."
              : "Audit history is indexing. Run npm run index:finance to populate it."}
          </p>
          {canManage ? (
            <section className="space-y-3 rounded-xl border p-5">
              <h2 className="text-xl font-semibold">Create allocation</h2>
              <label className="block text-sm">
                Recipient wallet
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Amount in SOL
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Purpose
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Category
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Description
                <textarea
                  className="mt-1 w-full rounded border p-2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button
                className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
                disabled={
                  isSending ||
                  !recipient ||
                  !amount ||
                  !purpose ||
                  !category ||
                  !description
                }
                onClick={createAllocation}
              >
                Reserve funds
              </button>
            </section>
          ) : (
            <p className="rounded border p-4 text-sm">
              Only the active organization authority can manage funds, and only
              while the campaign is Active.
            </p>
          )}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Allocations</h2>
            {allocations.length === 0 ? (
              <p className="text-muted">No allocations yet.</p>
            ) : (
              allocations.map((allocation) => (
                <article
                  className="space-y-3 rounded-xl border p-4"
                  key={allocation.address}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>
                      Allocation #{allocation.allocationId.toString()}
                    </strong>
                    <span>{allocation.status}</span>
                  </div>
                  <p className="break-all text-sm">
                    Recipient: {allocation.recipient}
                  </p>
                  <p>
                    {sol(allocation.spent)} spent of {sol(allocation.amount)} ·{" "}
                    {sol(allocation.amount - allocation.spent)} remaining
                  </p>
                  {indexed.get(allocation.address)?.uri && (
                    <p className="text-sm">
                      <a
                        className="underline"
                        href={`/api/metadata?uri=${encodeURIComponent(indexed.get(allocation.address)!.uri)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View allocation metadata
                      </a>
                      {indexed.get(allocation.address)?.signature && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            className="underline"
                            href={getExplorerUrl(
                              `/tx/${indexed.get(allocation.address)!.signature}`
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View transaction
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  {canManage && allocation.status === "Open" && (
                    <div className="space-y-2 border-t pt-3">
                      <label className="block text-sm">
                        Payout amount in SOL
                        <input
                          className="mt-1 w-full rounded border p-2"
                          value={payoutAmount}
                          onChange={(e) => setPayoutAmount(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm">
                        Payout description
                        <textarea
                          className="mt-1 w-full rounded border p-2"
                          value={payoutDescription}
                          onChange={(e) => setPayoutDescription(e.target.value)}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          className="rounded border px-3 py-2 disabled:opacity-50"
                          disabled={
                            isSending || !payoutAmount || !payoutDescription
                          }
                          onClick={() => payout(allocation)}
                        >
                          Disburse SOL
                        </button>
                        <button
                          className="rounded border px-3 py-2 disabled:opacity-50"
                          disabled={isSending}
                          onClick={() =>
                            void transact(() =>
                              cancelAllocationIx(
                                allocation,
                                selected,
                                address(walletAddress!)
                              )
                            )
                          }
                        >
                          Cancel remaining reservation
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Disbursements</h2>
            {disbursements.length === 0 ? (
              <p className="text-muted">No disbursements yet.</p>
            ) : (
              disbursements.map((item) => (
                <article className="rounded-xl border p-4" key={item.address}>
                  Disbursement #{item.disbursementId.toString()} ·{" "}
                  {sol(item.amount)} · {item.status}
                  <p className="break-all text-sm text-muted">
                    Recipient: {item.recipient}
                  </p>
                  {indexed.get(item.address)?.uri && (
                    <p className="text-sm">
                      <a
                        className="underline"
                        href={`/api/metadata?uri=${encodeURIComponent(indexed.get(item.address)!.uri)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View disbursement metadata
                      </a>
                      {indexed.get(item.address)?.signature && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            className="underline"
                            href={getExplorerUrl(
                              `/tx/${indexed.get(item.address)!.signature}`
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View transaction
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
