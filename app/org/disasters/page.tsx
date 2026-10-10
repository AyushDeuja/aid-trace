"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
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
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { organizationPda } from "../../lib/organizations/chain";
import { displaySol, parseSolAmount } from "../../lib/campaigns/amount";

type Proposal = {
  title: string;
  description: string;
  disasterType: string;
  location: string;
  goalLamports: string;
  endsAt: string | null;
};
type Candidate = {
  id: string;
  status: string;
  title: string;
  location: string;
  disaster_type: string;
  provider: string;
  occurred_at: string | null;
  observations: { provider: string; source_url: string }[];
  proposal?: Proposal;
  metadata_uri?: string | null;
  metadata_digest?: string | null;
  campaign_address?: string | null;
};
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const shortError = (error: unknown, fallback: string) =>
  /signature|rejected/i.test(error instanceof Error ? error.message : "")
    ? "Wallet signature was rejected or expired."
    : fallback;

export default function OrganizationDisastersPage() {
  const router = useRouter();
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const [organization, setOrganization] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState<Candidate | null>(null);
  const [goalSol, setGoalSol] = useState("");
  useEffect(() => {
    if (!wallet?.account.address) {
      queueMicrotask(() => setOrganization(""));
      return;
    }
    void organizationPda(wallet.account.address).then(setOrganization);
  }, [wallet?.account.address]);
  const authorize = async (
    action: "list_organization" | "request_campaign",
    candidateId?: string
  ) => {
    if (!wallet?.signMessage || !organization)
      throw new Error("Connect the organization authority wallet first");
    const response = await fetch("/api/disasters/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: wallet.account.address,
        action,
        ...(candidateId ? { candidateId } : {}),
      }),
    });
    const challenge = await response.json();
    if (!response.ok)
      throw new Error(challenge.error || "Could not authorize this action");
    const signed = await wallet.signMessage(
      new TextEncoder().encode(challenge.message)
    );
    if (new TextDecoder().decode(signed.message) !== challenge.message)
      throw new Error("Wallet returned a different signed message");
    return {
      wallet: wallet.account.address,
      organization,
      nonce: challenge.nonce,
      message: challenge.message,
      signature: b64(signed.signature),
      cluster,
      ...(candidateId ? { candidateId } : {}),
    };
  };
  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const auth = await authorize("list_organization");
      const response = await fetch("/api/disasters/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...auth, role: "organization" }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load candidates");
      setItems(body);
    } catch (error) {
      toast.error(
        shortError(
          error,
          "Disaster opportunities are unavailable. Please refresh."
        )
      );
    } finally {
      setLoading(false);
    }
    // Signed authorization follows the active wallet, selected organization, and cluster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cluster, organization]);
  useEffect(() => {
    if (organization) {
      const timer = window.setTimeout(() => void load(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [organization, load]);
  const requestCampaign = async () => {
    if (!requesting) return;
    let parsed: bigint;
    try {
      parsed = parseSolAmount(goalSol);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Enter a valid SOL goal."
      );
      return;
    }
    const id = toast.loading("Awaiting request signature…");
    try {
      const auth = await authorize("request_campaign", requesting.id);
      const response = await fetch(`/api/disasters/${requesting.id}/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...auth,
          proposal: {
            title: requesting.title,
            description: `Relief campaign requested by the organization for ${requesting.title}.`,
            disasterType: requesting.disaster_type,
            location: requesting.location,
            goalSol,
            endsAt: null,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not request campaign");
      toast.success(`Request submitted for ${displaySol(parsed)} SOL.`, { id });
      setRequesting(null);
      setGoalSol("");
      await load();
    } catch (error) {
      toast.error(shortError(error, "Could not submit the campaign request."), {
        id,
      });
    }
  };
  const columns: DataTableColumn<Candidate>[] = useMemo(
    () => [
      {
        key: "disaster",
        header: "Disaster",
        cell: (c) => (
          <div>
            <p className="font-semibold">{c.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.provider} ·{" "}
              {c.occurred_at
                ? new Date(c.occurred_at).toLocaleDateString()
                : "Time unavailable"}
            </p>
          </div>
        ),
      },
      {
        key: "impact",
        header: "Location / type",
        cell: (c) => (
          <div>
            <p>{c.location}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.disaster_type}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        header: "Request status",
        cell: (c) => (
          <Badge
            variant={
              c.status === "activated"
                ? "verified"
                : c.status === "rejected"
                  ? "outline"
                  : "warning"
            }
          >
            {c.status.replaceAll("_", " ")}
          </Badge>
        ),
      },
      {
        key: "goal",
        header: "Goal",
        cell: (c) =>
          c.proposal?.goalLamports ? (
            <span>{displaySol(BigInt(c.proposal.goalLamports))} SOL</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "actions",
        header: "Actions",
        headerClassName: "text-right",
        className: "text-right",
        cell: (c) => (
          <div
            className="flex justify-end gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {c.status === "detected" && (
              <Button
                size="sm"
                onClick={() => {
                  setRequesting(c);
                  setGoalSol("");
                }}
              >
                Request approval
              </Button>
            )}
            {c.status === "activated" && c.campaign_address && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/campaigns/${c.campaign_address}`)}
              >
                Open campaign <ExternalLink />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [router]
  );
  return (
    <main className="mx-auto max-w-7xl space-y-7 px-5 py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
            <span className="h-px w-5 bg-primary" /> Organization workspace
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">
            Disaster opportunities
          </h1>
          <p className="mt-3 text-muted-foreground">
            Request a review for eligible disasters. Admin approval creates the
            active canonical campaign.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!organization || loading}
          onClick={() =>
            void load().catch(() =>
              toast.error("Could not refresh opportunities.")
            )
          }
        >
          <RefreshCw className={loading ? "animate-spin" : ""} /> Signed refresh
        </Button>
      </header>
      {!wallet?.account.address ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Connect an organization authority wallet to view disaster
          opportunities.
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(c) => c.id}
          loading={loading}
          onRowClick={(c) => router.push(`/org/disasters/${c.id}`)}
          emptyMessage="No eligible disaster opportunities are available on this cluster."
        />
      )}
      <Dialog
        open={Boolean(requesting)}
        onOpenChange={(open) => !open && setRequesting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request admin approval</DialogTitle>
            <DialogDescription>
              {requesting?.title}. Enter the campaign target in SOL; the server
              converts it exactly to lamports.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-5 block text-sm font-medium">
            Goal in SOL
            <Input
              className="mt-1.5"
              inputMode="decimal"
              placeholder="10"
              value={goalSol}
              onChange={(event) => setGoalSol(event.target.value)}
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRequesting(null)}>
              Cancel
            </Button>
            <Button
              disabled={!goalSol.trim()}
              onClick={() => void requestCampaign()}
            >
              Request admin approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
