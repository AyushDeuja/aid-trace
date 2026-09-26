"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  deliveryVerificationPda,
  listAllocations,
  listDisbursements,
  listDeliveryVerifications,
  listVerifiers,
  recordDisbursementIx,
  registerVerifierIx,
  revokeVerifierIx,
  verifyDeliveryIx,
  type Allocation,
  type Disbursement,
  type DeliveryVerification,
  type Verifier,
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
  const searchParams = useSearchParams();
  const requestedOrganization = searchParams.get("organization");
  const supported = cluster === "localnet" || cluster === "devnet";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [verifiers, setVerifiers] = useState<Verifier[]>([]);
  const [verifications, setVerifications] = useState<
    Record<string, DeliveryVerification[]>
  >({});
  const [history, setHistory] = useState<{
    allocations: Array<Record<string, string>>;
    disbursements: Array<Record<string, string>>;
    evidence?: Array<Record<string, string>>;
    verifications?: Array<Record<string, string>>;
  } | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutDescription, setPayoutDescription] = useState("");
  const [verifierWallet, setVerifierWallet] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<
    Record<
      string,
      {
        uri: string;
        digest: string;
        metadata: { filename: string; mimeType: string; byteSize: number };
      }
    >
  >({});
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState("");
  const [signature, setSignature] = useState("");

  const refresh = useCallback(async () => {
    if (!supported || !walletAddress) return;
    const org = await fetchOrganization(cluster, requestedOrganization ? address(requestedOrganization) : await organizationPda(address(walletAddress)));
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
      const [nextAllocations, nextDisbursements, nextVerifiers] =
        await Promise.all([
          listAllocations(cluster, current.address),
          listDisbursements(cluster, current.address),
          listVerifiers(cluster, current.organization),
        ]);
      setAllocations(nextAllocations);
      setDisbursements(nextDisbursements);
      setVerifiers(nextVerifiers);
      setVerifications(
        Object.fromEntries(
          await Promise.all(
            nextDisbursements.map(async (item) => [
              item.address,
              await listDeliveryVerifications(cluster, item.address),
            ])
          )
        )
      );
      const response = await fetch(
        `/api/finance/history?campaign=${current.address}`
      );
      setHistory(response.ok ? await response.json() : null);
    } else {
      setAllocations([]);
      setDisbursements([]);
      setHistory(null);
    }
  }, [cluster, requestedOrganization, selected?.address, supported, walletAddress]);
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
  const evidenceFor = (disbursement: Address): any =>
    evidence[disbursement] ||
    (history?.evidence || []).find(
      (item) => item.account_address === disbursement
    );
  const isVerifier =
    !!walletAddress &&
    verifiers.some((item) => item.active && item.verifier === walletAddress);
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
  const registerVerifier = () => {
    if (!selected || !walletAddress) return;
    void transact(() =>
      registerVerifierIx(
        selected.organization,
        address(walletAddress),
        address(verifierWallet)
      )
    );
    setVerifierWallet("");
  };
  const revokeVerifier = (verifier: Address) => {
    if (!selected || !walletAddress) return;
    void transact(() =>
      revokeVerifierIx(selected.organization, address(walletAddress), verifier)
    );
  };
  const uploadEvidence = async (disbursement: Disbursement, file: File) => {
    if (!walletAddress) return;
    setUploading(disbursement.address);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("uploader", walletAddress);
      const response = await fetch("/api/evidence", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Evidence upload failed");
      await fetch("/api/evidence/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uri: body.uri,
          digest: body.digest,
          accountAddress: disbursement.address,
          signature: `upload:${body.uri}`,
        }),
      }).then(async (r) => {
        if (!r.ok)
          throw new Error(
            (await r.json()).error || "Could not attach evidence"
          );
      });
      setEvidence((current) => ({ ...current, [disbursement.address]: body }));
      setMessage(
        "Evidence uploaded and digest verified. A registered verifier can now decide."
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Evidence upload failed"
      );
    } finally {
      setUploading(null);
    }
  };
  const decide = (
    disbursement: Disbursement,
    result: "Verified" | "Disputed" | "Rejected"
  ) => {
    if (!selected || !walletAddress) return;
    const attached = evidenceFor(disbursement.address);
    if (!attached) {
      setMessage("Upload evidence before submitting a verification.");
      return;
    }
    const allocation = allocations.find(
      (item) => item.address === disbursement.allocation
    );
    if (!allocation) {
      setMessage("Could not find the disbursement allocation.");
      return;
    }
    const evidenceDigest = attached.digest;
    void transact(
      async () => {
        const response = await fetch(
          `/api/evidence?uri=${encodeURIComponent(attached.uri)}`
        );
        const manifest = await response.json();
        if (!response.ok || manifest.digest !== evidenceDigest)
          throw new Error(
            manifest.error || "Evidence manifest digest does not match the attachment"
          );
        return verifyDeliveryIx(
          disbursement,
          allocation,
          selected,
          address(walletAddress),
          evidenceDigest,
          result
        );
      },
      async (nextSignature) => {
        await fetch("/api/evidence/link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            uri: attached.uri,
            digest: evidenceDigest,
            accountAddress: await deliveryVerificationPda(
              disbursement.address,
              disbursement.nextDeliveryVerificationId
            ),
            signature: nextSignature,
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
      {requestedOrganization && <p className="text-sm text-muted">Viewing organization {requestedOrganization}. This lets a registered verifier use this dashboard while connected with their own wallet.</p>}
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
            Delivery verification is recorded as immutable Solana milestones.
          </p>
          <p className="text-sm text-muted">
            {history
              ? "Audit history indexed from confirmed Solana data."
              : "Audit history is indexing. Run npm run index:finance to populate it."}
          </p>
          {canManage ? (
            <>
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
              <section className="space-y-3 rounded-xl border p-5">
                <h2 className="text-xl font-semibold">Registered verifiers</h2>
                <p className="text-sm text-muted">
                  A verifier needs their own connected wallet and signs each
                  delivery decision.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="min-w-64 flex-1 rounded border p-2"
                    placeholder="Verifier wallet address"
                    value={verifierWallet}
                    onChange={(event) => setVerifierWallet(event.target.value)}
                  />
                  <button
                    className="rounded border px-3 py-2 disabled:opacity-50"
                    disabled={isSending || !verifierWallet}
                    onClick={registerVerifier}
                  >
                    Register verifier
                  </button>
                </div>
                {verifiers.length ? (
                  verifiers.map((item) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      key={item.address}
                    >
                      <span className="break-all">
                        {item.verifier} · {item.active ? "Active" : "Revoked"}
                      </span>
                      {item.active && (
                        <button
                          className="rounded border px-2 py-1"
                          disabled={isSending}
                          onClick={() => revokeVerifier(item.verifier)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">
                    No verifier is registered.
                  </p>
                )}
              </section>
            </>
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
              disbursements.map((item) => {
                const attached = evidenceFor(item.address);
                const milestones = verifications[item.address] || [];
                return (
                  <article
                    className="space-y-3 rounded-xl border p-4"
                    key={item.address}
                  >
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
                    <section className="space-y-2 border-t pt-3">
                      <h3 className="font-medium">
                        Evidence and delivery verification
                      </h3>
                      {attached ? (
                        <div className="text-sm">
                          <p>
                            {attached.metadata?.filename || attached.filename} ·{" "}
                            {attached.metadata?.mimeType || attached.mime_type}{" "}
                            ·{" "}
                            {attached.metadata?.byteSize || attached.byte_size}{" "}
                            bytes
                          </p>
                          <p className="break-all text-muted">
                            SHA-256: {attached.digest} · digest match: confirmed
                          </p>
                          <a
                            className="underline"
                            href={`/api/evidence/${encodeURIComponent((attached.uri || "").split("/").pop() || attached.id)}/file`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download evidence
                          </a>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">Missing evidence</p>
                      )}
                      {canManage && (
                        <label className="block text-sm">
                          Upload PDF, PNG, JPEG, or WebP (max 5 MB)
                          <input
                            className="mt-1 block"
                            type="file"
                            accept="application/pdf,image/png,image/jpeg,image/webp"
                            disabled={uploading === item.address}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              if (file) void uploadEvidence(item, file);
                            }}
                          />
                        </label>
                      )}
                      {isVerifier && attached && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded border px-3 py-2"
                            disabled={isSending}
                            onClick={() => decide(item, "Verified")}
                          >
                            Verify
                          </button>
                          <button
                            className="rounded border px-3 py-2"
                            disabled={isSending}
                            onClick={() => decide(item, "Disputed")}
                          >
                            Dispute
                          </button>
                          <button
                            className="rounded border px-3 py-2"
                            disabled={isSending}
                            onClick={() => decide(item, "Rejected")}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {milestones.length ? (
                        <ol className="space-y-1 text-sm">
                          {milestones.map((milestone) => (
                            <li key={milestone.address}>
                              #{milestone.verificationId.toString()} ·{" "}
                              {milestone.status} by{" "}
                              <span className="break-all">
                                {milestone.verifier}
                              </span>{" "}
                              · evidence digest verified
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-muted">
                          No delivery decision yet.
                        </p>
                      )}
                      {(history?.verifications || [])
                        .filter((entry) => entry.disbursement === item.address)
                        .map((entry) => (
                          <p className="text-xs text-muted" key={entry.address}>
                            Indexed milestone #{entry.verification_id}:{" "}
                            {entry.status} · {entry.verifier}
                          </p>
                        ))}
                    </section>
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </main>
  );
}
