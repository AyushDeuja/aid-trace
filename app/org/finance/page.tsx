"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { address, type Address, type Instruction } from "@solana/kit";
import { ExternalLink, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  listVerifierRecordsForWallet,
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
type EvidenceAttachment = {
  uri: string;
  digest: string;
  account_address?: string;
  metadata?: { filename: string; mimeType: string; byteSize: number };
  filename?: string;
  mime_type?: string;
  byte_size?: string;
};
function sol(value: bigint) {
  return `${(Number(value) / Number(LAMPORTS)).toFixed(4)} SOL`;
}
function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}
function lamports(value: string) {
  if (!/^\d+(\.\d{0,9})?$/.test(value))
    throw new Error("Enter a valid SOL amount");
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * LAMPORTS + BigInt((fraction + "000000000").slice(0, 9))
  );
}

function FinancePageClient() {
  const { wallet } = useWallet();
  const { cluster, getExplorerUrl } = useCluster();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const searchParams = useSearchParams();
  const requestedOrganization = searchParams.get("organization");
  const section =
    searchParams.get("section") === "verification" ? "verification" : "funds";
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
    evidence?: EvidenceAttachment[];
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
  const [evidence, setEvidence] = useState<Record<string, EvidenceAttachment>>(
    {}
  );
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState("");
  const [signature, setSignature] = useState("");
  const [fundTab, setFundTab] = useState<"allocations" | "disbursements">(
    "allocations"
  );
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [disbursementAllocation, setDisbursementAllocation] =
    useState<Allocation | null>(null);

  const refresh = useCallback(async () => {
    if (!supported || !walletAddress) return;
    let org = await fetchOrganization(
      cluster,
      requestedOrganization
        ? address(requestedOrganization)
        : await organizationPda(address(walletAddress))
    );
    if (!org && !requestedOrganization) {
      const records = await listVerifierRecordsForWallet(
        cluster,
        address(walletAddress)
      );
      if (records.length === 1)
        org = await fetchOrganization(cluster, records[0].organization);
      if (records.length > 1)
        setMessage(
          "This verifier is registered for multiple organizations. Open an organization and use its Finance button to choose one."
        );
    }
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
  }, [
    cluster,
    requestedOrganization,
    selected?.address,
    supported,
    walletAddress,
  ]);
  useEffect(() => {
    // Start asynchronous chain reads after this render commits. This avoids a
    // synchronous state cascade while retaining refresh-on-wallet/network change.
    const timer = window.setTimeout(() => {
      void refresh().catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Could not load finance data"
        )
      );
    }, 0);
    return () => window.clearTimeout(timer);
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
      toast.success("Transaction confirmed on Solana.");
      await refresh();
    } catch (error) {
      setStage("Failed");
      const nextMessage =
        error instanceof Error ? error.message : String(error);
      setMessage(nextMessage);
      toast.error("Transaction could not be completed.");
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
  const evidenceFor = (disbursement: Address): EvidenceAttachment | undefined =>
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
        metadata = await fetch("/api/metadata", {
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
        metadata = await fetch("/api/metadata", {
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
            manifest.error ||
              "Evidence manifest digest does not match the attachment"
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
  const allocationColumns: DataTableColumn<Allocation>[] = [
    {
      key: "allocation",
      header: "Allocation",
      cell: (item) => (
        <div>
          <p className="font-semibold">
            Allocation #{item.allocationId.toString()}
          </p>
          <p
            className="mt-1 font-mono text-xs text-muted-foreground"
            title={item.address}
          >
            {shortAddress(item.address)}
          </p>
        </div>
      ),
    },
    {
      key: "recipient",
      header: "Recipient",
      cell: (item) => (
        <span className="font-mono text-xs" title={item.recipient}>
          {shortAddress(item.recipient)}
        </span>
      ),
    },
    {
      key: "funds",
      header: "Reserved / remaining",
      cell: (item) => (
        <div className="text-sm">
          <p>{sol(item.amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sol(item.amount - item.spent)} remaining
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (item) => (
        <Badge variant={item.status === "Open" ? "verified" : "outline"}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      cell: (item) => (
        <div data-table-action className="flex justify-end gap-2">
          {indexed.get(item.address)?.uri && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  `/api/metadata?uri=${encodeURIComponent(indexed.get(item.address)!.uri)}`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              Metadata <ExternalLink />
            </Button>
          )}
          {indexed.get(item.address)?.signature && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  getExplorerUrl(`/tx/${indexed.get(item.address)!.signature}`),
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              Transaction <ExternalLink />
            </Button>
          )}
          {canManage && item.status === "Open" && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => setDisbursementAllocation(item)}
              >
                Disburse
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSending}
                onClick={() =>
                  void transact(() =>
                    cancelAllocationIx(item, selected!, address(walletAddress!))
                  )
                }
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];
  const disbursementColumns: DataTableColumn<Disbursement>[] = [
    {
      key: "disbursement",
      header: "Disbursement",
      cell: (item) => (
        <div>
          <p className="font-semibold">
            Disbursement #{item.disbursementId.toString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Allocation {shortAddress(item.allocation)}
          </p>
        </div>
      ),
    },
    {
      key: "recipient",
      header: "Recipient",
      cell: (item) => (
        <span className="font-mono text-xs" title={item.recipient}>
          {shortAddress(item.recipient)}
        </span>
      ),
    },
    { key: "amount", header: "Amount", cell: (item) => sol(item.amount) },
    {
      key: "evidence",
      header: "Evidence",
      cell: (item) =>
        evidenceFor(item.address) ? (
          <Badge variant="verified">Digest linked</Badge>
        ) : (
          <Badge variant="warning">Missing</Badge>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (item) => (
        <Badge
          variant={
            item.status === "Verified"
              ? "verified"
              : item.status === "Recorded"
                ? "warning"
                : "outline"
          }
        >
          {item.status}
        </Badge>
      ),
    },
    {
      key: "links",
      header: "Links",
      headerClassName: "text-right",
      className: "text-right",
      cell: (item) => (
        <div data-table-action className="flex justify-end gap-2">
          {indexed.get(item.address)?.uri && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  `/api/metadata?uri=${encodeURIComponent(indexed.get(item.address)!.uri)}`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              Metadata <ExternalLink />
            </Button>
          )}
          {indexed.get(item.address)?.signature && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  getExplorerUrl(`/tx/${indexed.get(item.address)!.signature}`),
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              Transaction <ExternalLink />
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <main className="mx-auto max-w-7xl space-y-7 px-5 py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
            <span className="h-px w-5 bg-primary" /> Organization finance
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">
            Funding and verification
          </h1>
          <p className="mt-3 text-muted-foreground">
            Manage campaign reservations, recorded disbursements, and delivery
            evidence.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!walletAddress}
          onClick={() => void refresh()}
        >
          <RefreshCw /> Refresh canonical data
        </Button>
      </header>
      {!supported && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          Finance controls are available on localnet and Devnet.
        </p>
      )}
      {stage && (
        <p
          role="status"
          className="rounded-xl border border-border bg-card p-4 text-sm"
        >
          Transaction: <strong>{stage}</strong>
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
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          {message}
        </p>
      )}
      {!walletAddress && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Connect an organization authority or registered verifier wallet to use
          finance tools.
        </p>
      )}
      {walletAddress && !selected && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No campaigns owned by this wallet were found.
        </p>
      )}
      {selected && (
        <>
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <label className="block max-w-2xl text-sm font-medium">
              Campaign
              <select
                className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
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
                    Campaign #{campaign.campaignId.toString()} ·{" "}
                    {campaign.status}
                  </option>
                ))}
              </select>
            </label>
            {metrics && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(metrics).map(([label, value]) => (
                  <div
                    key={label}
                    className="border-l-2 border-primary bg-background px-4 py-3"
                  >
                    <p className="text-xs font-medium capitalize text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 font-serif text-2xl font-semibold">
                      {sol(value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div
            className="flex border-b border-border"
            role="tablist"
            aria-label="Finance sections"
          >
            <a
              className={
                section === "funds"
                  ? "border-b-2 border-primary px-4 py-3 text-sm font-semibold text-primary"
                  : "px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
              }
              href={`/org/finance${requestedOrganization ? `?organization=${encodeURIComponent(requestedOrganization)}` : ""}`}
            >
              Allocation &amp; disbursement
            </a>
            <a
              className={
                section === "verification"
                  ? "border-b-2 border-primary px-4 py-3 text-sm font-semibold text-primary"
                  : "px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
              }
              href={`/org/finance?section=verification${requestedOrganization ? `&organization=${encodeURIComponent(requestedOrganization)}` : ""}`}
            >
              Verification
            </a>
          </div>
          {section === "funds" ? (
            <section className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl font-semibold">
                    Allocation &amp; disbursement
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Reservations and payouts are confirmed directly on Solana.
                  </p>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    onClick={() => setAllocationModalOpen(true)}
                  >
                    <Plus /> Reserve funds
                  </Button>
                )}
              </div>
              {!canManage && (
                <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  Only the active organization authority can reserve, disburse,
                  or cancel campaign funds.
                </p>
              )}
              <div
                className="flex gap-2"
                role="tablist"
                aria-label="Funding records"
              >
                <Button
                  type="button"
                  variant={fundTab === "allocations" ? "default" : "outline"}
                  onClick={() => setFundTab("allocations")}
                >
                  Allocations ({allocations.length})
                </Button>
                <Button
                  type="button"
                  variant={fundTab === "disbursements" ? "default" : "outline"}
                  onClick={() => setFundTab("disbursements")}
                >
                  Disbursements ({disbursements.length})
                </Button>
              </div>
              {fundTab === "allocations" ? (
                <DataTable
                  columns={allocationColumns}
                  rows={allocations}
                  rowKey={(item) => item.address}
                  emptyMessage="No funds have been reserved for this campaign."
                />
              ) : (
                <DataTable
                  columns={disbursementColumns}
                  rows={disbursements}
                  rowKey={(item) => item.address}
                  emptyMessage="No disbursements have been recorded for this campaign."
                />
              )}
              <p className="text-xs text-muted-foreground">
                {history
                  ? "Audit history is indexed from confirmed Solana data."
                  : "Audit history is indexing; canonical campaign records remain available."}
              </p>
            </section>
          ) : (
            <section className="space-y-5">
              <div>
                <h2 className="font-serif text-2xl font-semibold">
                  Delivery verification
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Evidence is digest-linked before a registered verifier makes a
                  delivery decision.
                </p>
              </div>
              {canManage && (
                <section className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-primary" />
                    <h3 className="font-semibold">Registered verifiers</h3>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Input
                      className="min-w-60 flex-1"
                      placeholder="Verifier wallet address"
                      value={verifierWallet}
                      onChange={(event) =>
                        setVerifierWallet(event.target.value)
                      }
                    />
                    <Button
                      type="button"
                      disabled={isSending || !verifierWallet}
                      onClick={registerVerifier}
                    >
                      Register verifier
                    </Button>
                  </div>
                  <DataTable
                    columns={[
                      {
                        key: "wallet",
                        header: "Verifier",
                        cell: (item: Verifier) => (
                          <span className="font-mono text-xs">
                            {item.verifier}
                          </span>
                        ),
                      },
                      {
                        key: "status",
                        header: "Status",
                        cell: (item: Verifier) => (
                          <Badge variant={item.active ? "verified" : "outline"}>
                            {item.active ? "Active" : "Revoked"}
                          </Badge>
                        ),
                      },
                      {
                        key: "actions",
                        header: "Actions",
                        headerClassName: "text-right",
                        className: "text-right",
                        cell: (item: Verifier) =>
                          item.active ? (
                            <div data-table-action>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isSending}
                                onClick={() => revokeVerifier(item.verifier)}
                              >
                                Revoke
                              </Button>
                            </div>
                          ) : null,
                      },
                    ]}
                    rows={verifiers}
                    rowKey={(item) => item.address}
                    emptyMessage="No verifier is registered for this organization."
                  />
                </section>
              )}
              <DataTable
                columns={[
                  {
                    key: "disbursement",
                    header: "Disbursement",
                    cell: (item: Disbursement) => (
                      <div>
                        <p className="font-semibold">
                          #{item.disbursementId.toString()} · {sol(item.amount)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {shortAddress(item.recipient)}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: "evidence",
                    header: "Evidence",
                    cell: (item: Disbursement) =>
                      evidenceFor(item.address) ? (
                        <Badge variant="verified">Digest confirmed</Badge>
                      ) : (
                        <Badge variant="warning">Missing evidence</Badge>
                      ),
                  },
                  {
                    key: "milestones",
                    header: "Decisions",
                    cell: (item: Disbursement) => {
                      const milestones = verifications[item.address] || [];
                      return milestones.length ? (
                        <div className="space-y-1 text-xs">
                          {milestones.map((milestone) => (
                            <p key={milestone.address}>
                              {milestone.status} ·{" "}
                              {shortAddress(milestone.verifier)}
                            </p>
                          ))}
                        </div>
                      ) : (
                        "No decision"
                      );
                    },
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    headerClassName: "text-right",
                    className: "text-right",
                    cell: (item: Disbursement) => {
                      const attached = evidenceFor(item.address);
                      return (
                        <div
                          data-table-action
                          className="flex justify-end gap-2"
                        >
                          {canManage && (
                            <label className="inline-flex cursor-pointer items-center rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium">
                              {uploading === item.address
                                ? "Uploading…"
                                : "Upload evidence"}
                              <input
                                className="sr-only"
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
                            <>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => decide(item, "Verified")}
                              >
                                Verify
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => decide(item, "Disputed")}
                              >
                                Dispute
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => decide(item, "Rejected")}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    },
                  },
                ]}
                rows={disbursements}
                rowKey={(item) => item.address}
                emptyMessage="No disbursements are ready for verification."
              />
            </section>
          )}
        </>
      )}
      {allocationModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close reserve funds dialog"
            className="absolute inset-0 bg-black/35"
            onClick={() => setAllocationModalOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reserve-funds-title"
            className="relative z-10 w-full rounded-xl border border-border bg-card p-5 shadow-xl sm:p-6"
            style={{ maxWidth: "28rem" }}
          >
            <h2
              id="reserve-funds-title"
              className="font-serif text-2xl font-semibold"
            >
              Reserve funds
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a canonical allocation for this campaign.
            </p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium">
                Recipient wallet
                <Input
                  className="mt-1.5"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Amount in SOL
                <Input
                  className="mt-1.5"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Purpose
                <Input
                  className="mt-1.5"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Category
                <Input
                  className="mt-1.5"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  className="mt-1.5 min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAllocationModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
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
              </Button>
            </div>
          </section>
        </div>
      )}
      {disbursementAllocation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close disbursement dialog"
            className="absolute inset-0 bg-black/35"
            onClick={() => setDisbursementAllocation(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-disbursement-title"
            className="relative z-10 w-full rounded-xl border border-border bg-card p-5 shadow-xl sm:p-6"
            style={{ maxWidth: "28rem" }}
          >
            <h2
              id="record-disbursement-title"
              className="font-serif text-2xl font-semibold"
            >
              Record disbursement
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Allocation #{disbursementAllocation.allocationId.toString()} ·{" "}
              {sol(
                disbursementAllocation.amount - disbursementAllocation.spent
              )}{" "}
              available.
            </p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium">
                Payout amount in SOL
                <Input
                  className="mt-1.5"
                  inputMode="decimal"
                  value={payoutAmount}
                  onChange={(event) => setPayoutAmount(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Payout description
                <textarea
                  className="mt-1.5 min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  value={payoutDescription}
                  onChange={(event) => setPayoutDescription(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisbursementAllocation(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSending || !payoutAmount || !payoutDescription}
                onClick={() => {
                  payout(disbursementAllocation);
                  setDisbursementAllocation(null);
                }}
              >
                Record disbursement
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
  /*
  return (
    <main className="mx-auto max-w-6xl space-y-7 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Organization finance</h1>
          <p className="text-sm text-muted">
            Canonical Solana balances, allocations, and disbursements.
          </p>
        </div>
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
      {(requestedOrganization ||
        (selected &&
          !campaigns.some(
            (campaign) => campaign.authority === walletAddress
          ))) && (
        <p className="text-sm text-muted">
          Viewing the selected organization. Registered verifier wallets can
          review and decide on its uploaded evidence.
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
                            href={`/api/evidence/${encodeURIComponent(attached.uri.split("/").pop() || "")}/file`}
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
  */
}

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-5 py-10">Loading finance…</main>
      }
    >
      <FinancePageClient />
    </Suspense>
  );
}
