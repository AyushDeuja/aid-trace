"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { address, type Address, type Instruction } from "@solana/kit";
import {
  Check,
  ExternalLink,
  FileUp,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
  deliveryVerificationPda,
  fetchFinanceSnapshot,
  invalidateFinanceReadCache,
  listVerifierRecordsForWallet,
  registerVerifierIx,
  revokeVerifierIx,
  verifyDeliveryIx,
  type Allocation,
  type DeliveryVerification,
  type Disbursement,
  type Verifier,
} from "../../lib/finance/chain";
import {
  evidenceReviewBadgeVariant,
  evidenceReviewStatus,
} from "../../lib/finance/evidence-status";

type EvidenceAttachment = {
  uri: string;
  digest: string;
  account_address?: string;
  metadata?: { filename: string; mimeType: string; byteSize: number };
  filename?: string;
  mime_type?: string;
  byte_size?: string;
};

type Filter = "Pending" | "Verified" | "Disputed" | "Rejected";

const shortAddress = (value: string) =>
  value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;

function verificationState(
  item: Disbursement,
  hasEvidence: boolean
): "Missing evidence" | Filter {
  return evidenceReviewStatus(item, hasEvidence);
}

function VerificationPageClient() {
  const { wallet } = useWallet();
  const { cluster, getExplorerUrl } = useCluster();
  const { send, isSending } = useSendTransaction();
  const searchParams = useSearchParams();
  const requestedOrganization = searchParams.get("organization");
  const walletAddress = wallet?.account.address;
  const supported = cluster === "localnet" || cluster === "devnet";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [verifiers, setVerifiers] = useState<Verifier[]>([]);
  const [verifierWallet, setVerifierWallet] = useState("");
  const [verifications, setVerifications] = useState<
    Record<string, DeliveryVerification[]>
  >({});
  const [evidence, setEvidence] = useState<Record<string, EvidenceAttachment>>(
    {}
  );
  const [history, setHistory] = useState<{
    evidence?: EvidenceAttachment[];
  } | null>(null);
  const [filter, setFilter] = useState<Filter>("Pending");
  const [inspecting, setInspecting] = useState<Disbursement | null>(null);
  const [verifierModalOpen, setVerifierModalOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");

  const retryRefresh = () => {
    void refresh().catch(() => {
      setMessage(
        "Canonical verification data is temporarily unavailable. Please retry."
      );
      toast.error("Could not refresh verification records.");
    });
  };

  const refresh = useCallback(async () => {
    if (!supported || !walletAddress) return;
    let organization = await fetchOrganization(
      cluster,
      requestedOrganization
        ? address(requestedOrganization)
        : await organizationPda(address(walletAddress))
    );
    if (!organization && !requestedOrganization) {
      const records = await listVerifierRecordsForWallet(
        cluster,
        address(walletAddress)
      );
      if (records.length === 1)
        organization = await fetchOrganization(
          cluster,
          records[0].organization
        );
    }
    if (!organization) {
      setCampaigns([]);
      setSelected(null);
      return;
    }
    const nextCampaigns = (await listCampaigns(cluster)).filter(
      (campaign) => campaign.organization === organization.address
    );
    setCampaigns(nextCampaigns);
    const current =
      nextCampaigns.find(
        (campaign) => campaign.address === selected?.address
      ) ||
      nextCampaigns[0] ||
      null;
    setSelected(current);
    if (!current) {
      setAllocations([]);
      setDisbursements([]);
      return;
    }
    const [snapshot, historyResponse] = await Promise.all([
      fetchFinanceSnapshot(cluster, current.address, current.organization),
      fetch(`/api/finance/history?campaign=${current.address}`).catch(
        () => null
      ),
    ]);
    setAllocations(snapshot.allocations);
    setDisbursements(snapshot.disbursements);
    setVerifiers(snapshot.verifiers);
    setVerifications(snapshot.verifications);
    if (historyResponse?.ok) setHistory(await historyResponse.json());
    else {
      toast.warning("Evidence history is temporarily unavailable.");
    }
  }, [
    cluster,
    requestedOrganization,
    selected?.address,
    supported,
    walletAddress,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void refresh().catch((error) => {
          const busy =
            error instanceof Error &&
            /temporarily busy|429/i.test(error.message);
          setMessage(
            busy
              ? "Solana is temporarily busy. Your last confirmed records remain visible."
              : "Canonical verification data is temporarily unavailable. Please retry."
          );
          toast.error(
            busy
              ? "Solana is busy; please retry shortly."
              : "Could not refresh verification records."
          );
        }),
      0
    );
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const evidenceFor = useCallback(
    (disbursement: Address) =>
      evidence[disbursement] ||
      (history?.evidence || []).find(
        (item) => item.account_address === disbursement
      ),
    [evidence, history]
  );
  const canManage =
    !!selected &&
    selected.authority === walletAddress &&
    selected.status === "Active";
  const isVerifier =
    !!walletAddress &&
    verifiers.some((item) => item.active && item.verifier === walletAddress);
  const visible = useMemo(
    () =>
      disbursements.filter(
        (item) =>
          verificationState(item, !!evidenceFor(item.address)) === filter
      ),
    [disbursements, evidenceFor, filter]
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (["Pending", "Verified", "Disputed", "Rejected"] as Filter[]).map(
          (state) => [
            state,
            disbursements.filter(
              (item) =>
                verificationState(item, !!evidenceFor(item.address)) === state
            ).length,
          ]
        )
      ) as Record<Filter, number>,
    [disbursements, evidenceFor]
  );

  const transact = async (
    build: () => Promise<Instruction>,
    after?: (nextSignature: string) => Promise<void>
  ) => {
    setMessage("");
    try {
      const nextSignature = await send({ instructions: [await build()] });
      setSignature(nextSignature);
      if (after) await after(nextSignature);
      toast.success("Transaction confirmed on Solana.");
      invalidateFinanceReadCache(cluster);
      await refresh();
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Transaction failed";
      setMessage(nextMessage);
      toast.error("Transaction could not be completed.");
    }
  };

  const uploadEvidence = async (disbursement: Disbursement, file: File) => {
    if (!walletAddress) return;
    setUploading(disbursement.address);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("uploader", walletAddress);
      const uploaded = await fetch("/api/evidence", {
        method: "POST",
        body: form,
      });
      const body = await uploaded.json();
      if (!uploaded.ok) throw new Error(body.error || "Evidence upload failed");
      const linked = await fetch("/api/evidence/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uri: body.uri,
          digest: body.digest,
          accountAddress: disbursement.address,
          signature: `upload:${body.uri}`,
        }),
      });
      if (!linked.ok)
        throw new Error(
          (await linked.json()).error || "Could not link evidence"
        );
      setEvidence((current) => ({ ...current, [disbursement.address]: body }));
      toast.success("Evidence uploaded and digest linked.");
      invalidateFinanceReadCache(cluster);
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Evidence upload failed"
      );
      toast.error("Evidence could not be added.");
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
    const allocation = allocations.find(
      (item) => item.address === disbursement.allocation
    );
    if (!attached || !allocation) {
      setMessage(
        !attached
          ? "Add evidence before submitting a decision."
          : "The related allocation is unavailable."
      );
      return;
    }
    void transact(
      async () => {
        const response = await fetch(
          `/api/evidence?uri=${encodeURIComponent(attached.uri)}`
        );
        const manifest = await response.json();
        if (!response.ok || manifest.digest !== attached.digest)
          throw new Error(
            manifest.error || "Evidence digest does not match the linked record"
          );
        return verifyDeliveryIx(
          disbursement,
          allocation,
          selected,
          address(walletAddress),
          attached.digest,
          result
        );
      },
      async (nextSignature) => {
        await fetch("/api/evidence/link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            uri: attached.uri,
            digest: attached.digest,
            accountAddress: await deliveryVerificationPda(
              disbursement.address,
              disbursement.nextDeliveryVerificationId
            ),
            signature: nextSignature,
          }),
        });
        setInspecting(null);
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
    setVerifierModalOpen(false);
  };

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-5 py-8 lg:px-8">
      <header className="border-b border-border pb-7">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
          <span className="h-px w-5 bg-primary" /> Organization
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">
          Delivery verifications
        </h1>
        <p className="mt-3 text-muted-foreground">
          Human-reviewed proof that campaign funds became aid.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={retryRefresh}
        >
          <RefreshCw /> Refresh canonical data
        </Button>
      </header>
      {!supported && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          Verification controls are available on localnet and Devnet.
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
      {signature && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm">
          Latest transaction ·{" "}
          <a
            className="underline"
            target="_blank"
            rel="noreferrer"
            href={getExplorerUrl(`/tx/${signature}`)}
          >
            View on explorer
          </a>
        </p>
      )}
      {!walletAddress && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Connect an organization authority or registered verifier wallet to
          review delivery evidence.
        </p>
      )}
      {walletAddress && !selected && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          No organization campaign is available for this wallet.
        </p>
      )}
      {selected && (
        <>
          <div className="flex max-w-3xl flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-sm font-medium">
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
            {canManage && (
              <Button
                type="button"
                className="mb-0.5"
                onClick={() => setVerifierModalOpen(true)}
              >
                <ShieldCheck /> Register verifier
              </Button>
            )}
          </div>
          {canManage && (
            <section className="max-w-3xl border-b border-border pb-5">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Registered verifiers
              </p>
              <div className="space-y-2">
                {verifiers.length ? (
                  verifiers.map((item) => (
                    <div
                      key={item.address}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm"
                    >
                      <span className="font-mono">
                        {shortAddress(item.verifier)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.active ? "verified" : "outline"}>
                          {item.active ? "Active" : "Revoked"}
                        </Badge>
                        {item.active && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isSending}
                            onClick={() =>
                              void transact(() =>
                                revokeVerifierIx(
                                  selected.organization,
                                  address(walletAddress!),
                                  item.verifier
                                )
                              )
                            }
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No verifier is registered for this organization.
                  </p>
                )}
              </div>
            </section>
          )}
          <div
            className="flex flex-wrap gap-2 border-b border-border pb-3"
            role="tablist"
            aria-label="Verification states"
          >
            {(["Pending", "Verified", "Disputed", "Rejected"] as Filter[]).map(
              (state) => (
                <Button
                  key={state}
                  type="button"
                  size="sm"
                  variant={filter === state ? "default" : "outline"}
                  onClick={() => setFilter(state)}
                >
                  {state} ({counts[state]})
                </Button>
              )
            )}
          </div>
          <section className="grid gap-4 lg:grid-cols-2">
            {visible.map((item) => {
              const attached = evidenceFor(item.address);
              const milestones = verifications[item.address] || [];
              return (
                <article
                  key={item.address}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">
                        DISB-{item.disbursementId.toString()}
                      </p>
                      <h2 className="mt-2 font-serif text-xl font-semibold">
                        {item.amount.toString()} lamports to{" "}
                        {shortAddress(item.recipient)}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Allocation {shortAddress(item.allocation)} ·{" "}
                        {milestones.length} decision
                        {milestones.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge
                      variant={evidenceReviewBadgeVariant(
                        verificationState(item, !!attached)
                      )}
                    >
                      {verificationState(item, !!attached)}
                    </Badge>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {canManage ? (
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                        <FileUp className="size-4" />
                        {uploading === item.address
                          ? "Adding…"
                          : "Add evidence"}
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
                    ) : (
                      <Button type="button" variant="outline" disabled>
                        <FileUp /> Add evidence
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!attached}
                      onClick={() => setInspecting(item)}
                    >
                      <Search /> Inspect evidence
                    </Button>
                  </div>
                  {attached ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Digest linked ·{" "}
                      {attached.metadata?.filename ||
                        attached.filename ||
                        "Evidence file"}
                    </p>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Inspect evidence becomes available after a digest-linked
                      upload.
                    </p>
                  )}
                </article>
              );
            })}
          </section>
          {!visible.length && (
            <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              No {filter.toLowerCase()} delivery records for this campaign.
            </p>
          )}
        </>
      )}
      {verifierModalOpen && selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close register verifier dialog"
            onClick={() => setVerifierModalOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-verifier-title"
            className="relative z-10 w-full rounded-xl border border-border bg-card p-6 shadow-xl"
            style={{ maxWidth: "30rem" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="register-verifier-title"
                  className="font-serif text-2xl font-semibold"
                >
                  Register verifier
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a wallet that can review digest-linked delivery evidence.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close"
                onClick={() => setVerifierModalOpen(false)}
              >
                <X />
              </Button>
            </div>
            <label className="mt-5 block text-sm font-medium">
              Verifier wallet address
              <Input
                className="mt-2"
                autoFocus
                placeholder="Enter Solana wallet address"
                value={verifierWallet}
                onChange={(event) => setVerifierWallet(event.target.value)}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVerifierModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSending || !verifierWallet}
                onClick={registerVerifier}
              >
                Register verifier
              </Button>
            </div>
          </section>
        </div>
      )}
      {inspecting &&
        (() => {
          const attached = evidenceFor(inspecting.address);
          if (!attached) return null;
          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/45"
                aria-label="Close evidence inspector"
                onClick={() => setInspecting(null)}
              />
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="evidence-title"
                className="relative z-10 w-full rounded-xl border border-border bg-card p-6 shadow-xl"
                style={{ maxWidth: "42rem" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2
                      id="evidence-title"
                      className="font-serif text-2xl font-semibold"
                    >
                      Inspect delivery evidence
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Evidence digest is linked to the selected disbursement.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Close"
                    onClick={() => setInspecting(null)}
                  >
                    <X />
                  </Button>
                </div>
                <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
                  <p className="font-mono text-sm">
                    {attached.metadata?.filename ||
                      attached.filename ||
                      "Evidence file"}
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    SHA-256: {attached.digest}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {attached.metadata?.mimeType ||
                      attached.mime_type ||
                      "File"}{" "}
                    ·{" "}
                    {attached.metadata?.byteSize ||
                      attached.byte_size ||
                      "Unknown"}{" "}
                    bytes
                  </p>
                  <a
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline"
                    href={`/api/evidence/${encodeURIComponent(attached.uri.split("/").pop() || "")}/file`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open evidence <ExternalLink className="size-4" />
                  </a>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {!isVerifier && (
                    <p className="mr-auto text-sm text-muted-foreground">
                      A registered verifier wallet is required to decide.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!isVerifier || isSending}
                    onClick={() => decide(inspecting, "Disputed")}
                  >
                    Dispute
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!isVerifier || isSending}
                    onClick={() => decide(inspecting, "Rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    disabled={!isVerifier || isSending}
                    onClick={() => decide(inspecting, "Verified")}
                  >
                    <Check /> Verify
                  </Button>
                </div>
              </section>
            </div>
          );
        })()}
    </main>
  );
}

export default function VerificationPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-7xl px-5 py-8">
          Loading verification…
        </main>
      }
    >
      <VerificationPageClient />
    </Suspense>
  );
}
