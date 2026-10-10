"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { address, type Instruction } from "@solana/kit";
import { Check, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "../components/cluster-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import {
  fetchAdmin,
  fetchOrganization,
  organizationPda,
  registerOrganizationIx,
  rpcCall,
  setStatusIx,
  setVerifiedIx,
  type OrganizationAccount,
} from "../lib/organizations/chain";
import { ellipsify } from "../lib/explorer";

type ListedOrganization = Omit<
  OrganizationAccount,
  "verifiedDeliveryCount" | "nextCampaignId"
> & {
  verifiedDeliveryCount: string;
  nextCampaignId: string;
  metadata?: { name: string; description: string; website?: string } | null;
};

const shortError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  if (/InvalidStatusTransition|status transition/i.test(message))
    return "This organization cannot move to that status.";
  if (/signature|rejected/i.test(message))
    return "Wallet signature was rejected or expired.";
  return fallback;
};

export default function OrganizationPage() {
  const router = useRouter();
  const { wallet } = useWallet();
  const { cluster } = useCluster();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const [organizations, setOrganizations] = useState<ListedOrganization[]>([]);
  const [admin, setAdmin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [adminKey, response] = await Promise.all([
        fetchAdmin(cluster),
        fetch(`/api/organizations?cluster=${cluster}`),
      ]);
      if (!response.ok) throw new Error("Could not load indexed organizations");
      setAdmin(adminKey);
      setOrganizations((await response.json()) as ListedOrganization[]);
    } catch (error) {
      toast.error(
        shortError(
          error,
          "Organization records are unavailable. Please refresh."
        )
      );
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const isAdmin = Boolean(walletAddress && admin === walletAddress);
  const myOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) => organization.founder === walletAddress
      ),
    [organizations, walletAddress]
  );
  const rows = isAdmin ? organizations : myOrganizations;
  const canCreate = Boolean(
    walletAddress && !isAdmin && myOrganizations.length === 0
  );

  const transact = async (
    build: () => Promise<Instruction>,
    success: string
  ) => {
    const id = toast.loading("Awaiting wallet approval");
    try {
      const signature = await send({ instructions: [await build()] });
      toast.loading("Transaction submitted. Confirming on Solana…", { id });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const result = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [signature],
          { searchTransactionHistory: true },
        ]);
        if (result.value[0]?.err)
          throw new Error("Transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            result.value[0]?.confirmationStatus || ""
          )
        ) {
          toast.success(success, { id });
          await refresh();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Transaction confirmation timed out");
    } catch (error) {
      toast.error(
        shortError(error, "Transaction validation failed. Please try again."),
        { id }
      );
    }
  };

  const canonical = async (item: ListedOrganization) => {
    const value = await fetchOrganization(cluster, address(item.address));
    if (!value) throw new Error("Organization is no longer available on-chain");
    return value;
  };
  const createOrganization = async () => {
    if (!walletAddress)
      return toast.error("Connect an organization wallet first.");
    const id = toast.loading("Preparing immutable organization metadata…");
    try {
      const metadataResponse = await fetch("/api/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "organization",
          metadata: { name, description, ...(website ? { website } : {}) },
        }),
      });
      const metadata = await metadataResponse.json();
      if (!metadataResponse.ok)
        throw new Error(metadata.error || "Invalid organization details");
      toast.loading("Awaiting wallet approval", { id });
      const signature = await send({
        instructions: [
          await registerOrganizationIx(address(walletAddress), metadata.digest),
        ],
      });
      toast.loading("Registration submitted. Confirming on Solana…", { id });
      let confirmed = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const result = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [signature],
          { searchTransactionHistory: true },
        ]);
        if (result.value[0]?.err)
          throw new Error("Transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            result.value[0]?.confirmationStatus || ""
          )
        ) {
          confirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!confirmed) throw new Error("Transaction confirmation timed out");
      const key = await organizationPda(address(walletAddress));
      const link = await fetch(`/api/organizations/${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uri: metadata.uri, cluster }),
      });
      if (!link.ok)
        toast.message(
          "Registration submitted. Metadata will appear after indexing."
        );
      setCreateOpen(false);
      setName("");
      setDescription("");
      setWebsite("");
      toast.success(`Organization registered: ${ellipsify(signature)}`, { id });
      await refresh();
    } catch (error) {
      toast.error(
        shortError(
          error,
          "Could not create the organization. Check the form and try again."
        ),
        { id }
      );
    }
  };

  const columns: DataTableColumn<ListedOrganization>[] = [
    {
      key: "organization",
      header: "Organization",
      cell: (item) => (
        <div>
          <p className="font-semibold">
            {item.metadata?.name || ellipsify(item.address)}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {ellipsify(item.address, 6)}
          </p>
        </div>
      ),
    },
    {
      key: "authority",
      header: "Authority",
      cell: (item) => (
        <span className="font-mono text-xs">
          {ellipsify(item.authority, 6)}
        </span>
      ),
    },
    {
      key: "verification",
      header: "Verification",
      cell: (item) => (
        <Badge variant={item.verified ? "verified" : "warning"}>
          {item.verified ? (
            <>
              <Check /> Verified
            </>
          ) : (
            "Pending verification"
          )}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (item) => (
        <Badge
          variant={
            item.status === "Active"
              ? "verified"
              : item.status === "Suspended" || item.status === "Closed"
                ? "outline"
                : "warning"
          }
        >
          {item.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      cell: (item) =>
        isAdmin ? (
          <div
            className="flex justify-end gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {!item.verified && (
              <Button
                size="sm"
                disabled={isSending}
                onClick={() =>
                  void transact(
                    async () =>
                      setVerifiedIx(
                        await canonical(item),
                        address(walletAddress!),
                        true
                      ),
                    "Organization verified."
                  )
                }
              >
                <Check /> Verify
              </Button>
            )}
            {item.verified && item.status === "Pending" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isSending}
                onClick={() =>
                  void transact(
                    async () =>
                      setStatusIx(
                        await canonical(item),
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
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">View details</span>
        ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-5 py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
            <span className="h-px w-5 bg-primary" />
            {isAdmin ? "Admin" : "Organization workspace"}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            Organizations
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            {isAdmin
              ? "Verify, inspect, and manage indexed organizations."
              : "Your canonical organization identity and operating status."}
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="rounded-full px-5"
          >
            <Plus /> Create organization
          </Button>
        )}
      </header>
      {!walletAddress ? (
        <EmptyState
          title="Connect a wallet to manage an organization"
          detail="Organization registration and management require an explicit wallet signature."
        />
      ) : !isAdmin && !loading && rows.length === 0 ? (
        <EmptyState
          title="No organization created by this wallet"
          detail="Create a canonical organization profile to begin."
          action={
            <Button
              onClick={() => setCreateOpen(true)}
              className="rounded-full"
            >
              <Plus /> Create organization
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(item) => item.address}
          loading={loading}
          onRowClick={(item) => router.push(`/org/${item.address}`)}
          emptyMessage="No indexed organizations are available on this cluster."
        />
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Your profile begins in Pending status and requires an admin
              review.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium">
              Name
              <Input
                className="mt-1.5"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Organization name"
              />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea
                className="mt-1.5 min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does your organization do?"
              />
            </label>
            <label className="block text-sm font-medium">
              Website{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
              <Input
                className="mt-1.5"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.org"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={isSending || !name.trim() || !description.trim()}
                onClick={() => void createOrganization()}
              >
                Create with wallet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center shadow-sm">
      <ShieldCheck className="mx-auto size-7 text-primary" />
      <h2 className="mt-4 font-serif text-2xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {detail}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
