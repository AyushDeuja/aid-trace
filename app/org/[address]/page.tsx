"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { address, type Instruction } from "@solana/kit";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWallet } from "../../lib/wallet/context";
import { useCluster } from "../../components/cluster-context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import {
  fetchAdmin,
  rpcCall,
  setStatusIx,
  setVerifiedIx,
  type OrganizationAccount,
} from "../../lib/organizations/chain";

type OrganizationDetail = Omit<
  OrganizationAccount,
  "verifiedDeliveryCount" | "nextCampaignId"
> & {
  verifiedDeliveryCount: string;
  nextCampaignId: string;
  metadata: { name: string; description: string; website?: string } | null;
  metadataState: "verified" | "unlinked" | "unavailable" | "digest_mismatch";
  sourceSignature: string | null;
};

const feedback = (error: unknown) =>
  /signature|rejected/i.test(error instanceof Error ? error.message : "")
    ? "Wallet signature was rejected or expired."
    : "Transaction validation failed. Please try again.";

export default function OrganizationDetailPage() {
  const params = useParams<{ address: string }>();
  const { wallet } = useWallet();
  const { cluster, getExplorerUrl } = useCluster();
  const { send, isSending } = useSendTransaction();
  const [organization, setOrganization] = useState<OrganizationDetail | null>(
    null
  );
  const [admin, setAdmin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const walletAddress = wallet?.account.address;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [adminKey, response] = await Promise.all([
        fetchAdmin(cluster),
        fetch(`/api/organizations/${params.address}?cluster=${cluster}`),
      ]);
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Organization could not be found");
      setAdmin(adminKey);
      setOrganization(body as OrganizationDetail);
    } catch (nextError) {
      setOrganization(null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Organization could not be loaded"
      );
    } finally {
      setLoading(false);
    }
  }, [cluster, params.address]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const isAdmin = Boolean(walletAddress && admin === walletAddress);
  const transact = async (
    build: () => Promise<Instruction>,
    success: string
  ) => {
    const id = toast.loading("Awaiting wallet approval");
    try {
      const signature = await send({ instructions: [await build()] });
      toast.loading("Transaction submitted. Confirming on Solana…", { id });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const status = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [signature],
          { searchTransactionHistory: true },
        ]);
        if (status.value[0]?.err)
          throw new Error("Transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            status.value[0]?.confirmationStatus || ""
          )
        ) {
          toast.success(success, { id });
          await refresh();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Confirmation timed out");
    } catch (nextError) {
      toast.error(feedback(nextError), { id });
    }
  };

  if (loading)
    return (
      <main className="mx-auto max-w-6xl px-5 py-10">
        <p className="text-sm text-muted-foreground">
          Loading canonical organization state…
        </p>
      </main>
    );
  if (error || !organization)
    return (
      <main className="mx-auto max-w-6xl space-y-4 px-5 py-10">
        <Link
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          href="/org"
        >
          <ArrowLeft className="size-4" /> Organizations
        </Link>
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="font-serif text-3xl font-semibold">
            Organization unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "The canonical organization account is unavailable."}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => void refresh()}
          >
            <RefreshCw /> Retry
          </Button>
        </div>
      </main>
    );
  const canonical = organization as unknown as OrganizationAccount;
  const metadataBadge =
    organization.metadataState === "verified" ? (
      <Badge variant="verified">Metadata verified</Badge>
    ) : (
      <Badge variant="warning">
        Metadata {organization.metadataState.replaceAll("_", " ")}
      </Badge>
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 lg:px-8">
      <Link
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        href="/org"
      >
        <ArrowLeft className="size-4" /> Organizations
      </Link>
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  organization.status === "Active" ? "verified" : "warning"
                }
              >
                {organization.status}
              </Badge>
              <Badge variant={organization.verified ? "verified" : "warning"}>
                {organization.verified
                  ? "Admin verified"
                  : "Pending verification"}
              </Badge>
              {metadataBadge}
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold">
              {organization.metadata?.name || "Organization"}
            </h1>
            {organization.metadata?.description && (
              <p className="mt-3 max-w-2xl text-muted-foreground">
                {organization.metadata.description}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isSending}
            onClick={() => void refresh()}
          >
            <RefreshCw /> Refresh canonical state
          </Button>
        </div>
        <dl className="mt-7 grid gap-x-8 gap-y-5 border-y border-border py-5 text-sm sm:grid-cols-2">
          <Field
            label="Address"
            value={
              <span className="break-all font-mono">
                {organization.address}
              </span>
            }
          />
          <Field
            label="Authority"
            value={
              <span className="break-all font-mono">
                {organization.authority}
              </span>
            }
          />
          <Field
            label="Founder"
            value={
              <span className="break-all font-mono">
                {organization.founder}
              </span>
            }
          />
          <Field
            label="Pending authority"
            value={organization.pendingAuthority || "None"}
          />
          <Field
            label="Verified deliveries"
            value={organization.verifiedDeliveryCount}
          />
          <Field
            label="On-chain metadata digest"
            value={
              <span className="break-all font-mono text-xs">
                {organization.metadataDigest}
              </span>
            }
          />
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link
              href={`/org/finance?organization=${encodeURIComponent(organization.address)}`}
            >
              Open finance & verification
            </Link>
          </Button>
          <a
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-muted"
            target="_blank"
            rel="noreferrer"
            href={getExplorerUrl(`/address/${organization.address}`)}
          >
            Explorer <ExternalLink className="size-3" />
          </a>
          {organization.metadata?.website && (
            <a
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-muted"
              target="_blank"
              rel="noreferrer"
              href={organization.metadata.website}
            >
              Website <ExternalLink className="size-3" />
            </a>
          )}
          {organization.sourceSignature && (
            <a
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-muted"
              target="_blank"
              rel="noreferrer"
              href={getExplorerUrl(`/tx/${organization.sourceSignature}`)}
            >
              Source transaction <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {isAdmin && organization.status !== "Closed" && (
          <section className="mt-6 border-t border-border pt-5">
            <h2 className="font-serif text-2xl font-semibold">
              Admin controls
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every change requires this canonical admin wallet to approve a
              Solana transaction.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={isSending}
                onClick={() =>
                  void transact(
                    () =>
                      setVerifiedIx(
                        canonical,
                        address(walletAddress!),
                        !organization.verified
                      ),
                    organization.verified
                      ? "Verification revoked."
                      : "Organization verified."
                  )
                }
              >
                {organization.verified
                  ? "Revoke verification"
                  : "Verify organization"}
              </Button>
              {organization.verified && organization.status === "Pending" && (
                <Button
                  disabled={isSending}
                  onClick={() =>
                    void transact(
                      () =>
                        setStatusIx(
                          canonical,
                          address(walletAddress!),
                          "Active"
                        ),
                      "Organization activated."
                    )
                  }
                >
                  Activate
                </Button>
              )}
              {organization.status === "Active" && (
                <Button
                  variant="outline"
                  disabled={isSending}
                  onClick={() =>
                    void transact(
                      () =>
                        setStatusIx(
                          canonical,
                          address(walletAddress!),
                          "Suspended"
                        ),
                      "Organization suspended."
                    )
                  }
                >
                  Suspend
                </Button>
              )}
              {organization.status === "Suspended" && (
                <Button
                  variant="outline"
                  disabled={isSending}
                  onClick={() =>
                    void transact(
                      () =>
                        setStatusIx(
                          canonical,
                          address(walletAddress!),
                          "Active"
                        ),
                      "Organization activated."
                    )
                  }
                >
                  Reactivate
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={isSending}
                onClick={() => {
                  if (window.confirm("Close this organization permanently?"))
                    void transact(
                      () =>
                        setStatusIx(
                          canonical,
                          address(walletAddress!),
                          "Closed"
                        ),
                      "Organization closed."
                    );
                }}
              >
                Close
              </Button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
