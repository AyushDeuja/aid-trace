"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { address } from "@solana/kit";
import { Check, RefreshCw, X } from "lucide-react";
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
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import {
  fetchAdmin,
  fetchOrganization,
  rpcCall,
} from "../../lib/organizations/chain";
import {
  campaignPda,
  createAdminDisasterCampaignIx,
} from "../../lib/campaigns/chain";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { ellipsify } from "../../lib/explorer";

type Candidate = {
  id: string;
  status: string;
  title: string;
  location: string;
  disaster_type: string;
  provider: string;
  occurred_at: string | null;
  observations: { source_url: string; provider: string }[];
  organization_address?: string;
  proposal?: { goalLamports: string; endsAt: string | null };
  metadata_uri?: string;
  metadata_digest?: string;
  campaign_address?: string;
};
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const shortError = (error: unknown, fallback: string) =>
  /signature|rejected/i.test(error instanceof Error ? error.message : "")
    ? "Wallet signature was rejected or expired."
    : fallback;
const truncateWords = (value: string, limit = 5) => {
  const words = value.trim().split(/\s+/);
  return words.length > limit ? `${words.slice(0, limit).join(" ")}…` : value;
};

export default function DisasterReview() {
  const router = useRouter();
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rejecting, setRejecting] = useState<Candidate | null>(null);
  const [note, setNote] = useState("");
  const signedPayload = async (action: string, candidateId?: string) => {
    if (!wallet?.signMessage)
      throw new Error("Connected wallet must support message signing");
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
      nonce: challenge.nonce,
      message: challenge.message,
      signature: b64(signed.signature),
      cluster,
      ...(candidateId ? { candidateId } : {}),
    };
  };
  const load = useCallback(async () => {
    if (!wallet?.account.address) return;
    setLoading(true);
    try {
      const payload = await signedPayload("list_admin");
      const response = await fetch("/api/disasters/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, role: "admin" }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load candidates");
      setItems(body);
    } catch (error) {
      toast.error(
        shortError(
          error,
          "Disaster candidates are unavailable. Please refresh."
        )
      );
    } finally {
      setLoading(false);
    }
    // Wallet and cluster are captured by signedPayload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cluster]);
  useEffect(() => {
    let live = true;
    if (!wallet?.account.address) {
      queueMicrotask(() => live && setIsAdmin(false));
      return;
    }
    void fetchAdmin(cluster)
      .then((admin) => live && setIsAdmin(admin === wallet.account.address))
      .catch(() => live && setIsAdmin(false));
    return () => {
      live = false;
    };
  }, [wallet?.account.address, cluster]);
  useEffect(() => {
    if (isAdmin) {
      const timer = window.setTimeout(() => void load(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [isAdmin, load]);

  const createActiveCampaign = async (
    candidate: Candidate,
    approval: {
      organization: string;
      goalLamports: string;
      uri: string;
      digest: string;
      endsAt: string | null;
    }
  ) => {
    if (!wallet?.account.address)
      throw new Error("Connect the administrator wallet");
    const organization = await fetchOrganization(
      cluster,
      address(approval.organization)
    );
    if (
      !organization ||
      organization.status !== "Active" ||
      !organization.verified
    )
      throw new Error(
        "The linked organization must be verified and active first."
      );
    const signature = await send({
      instructions: [
        await createAdminDisasterCampaignIx(
          organization.address,
          address(wallet.account.address),
          organization.nextCampaignId,
          BigInt(approval.goalLamports),
          approval.endsAt
            ? BigInt(Math.floor(new Date(approval.endsAt).getTime() / 1000))
            : null,
          approval.digest,
          approval.uri
        ),
      ],
    });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await rpcCall<{
        value: Array<{ err: unknown; confirmationStatus: string } | null>;
      }>(cluster, "getSignatureStatuses", [
        [signature],
        { searchTransactionHistory: true },
      ]);
      if (result.value[0]?.err)
        throw new Error("Campaign transaction failed on Solana");
      if (
        ["confirmed", "finalized"].includes(
          result.value[0]?.confirmationStatus || ""
        )
      )
        break;
      if (attempt === 29) throw new Error("Campaign confirmation timed out");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const campaignAddress = await campaignPda(
      organization.address,
      organization.nextCampaignId
    );
    const record = await signedPayload("record_active_campaign", candidate.id);
    const recorded = await fetch(`/api/disasters/${candidate.id}/chain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...record,
        organization: approval.organization,
        phase: "active_created",
        campaignSignature: signature,
        campaignAddress,
      }),
    });
    const body = await recorded.json();
    if (!recorded.ok)
      throw new Error(
        body.error ||
          "Campaign was created but could not be linked to the request"
      );
  };
  const decide = async (candidate: Candidate, action: "approve" | "reject") => {
    const id = toast.loading(
      action === "approve" ? "Authorizing approval…" : "Authorizing rejection…"
    );
    try {
      const authorization = await signedPayload(action, candidate.id);
      const response = await fetch(`/api/disasters/${candidate.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          ...authorization,
          ...(action === "reject" ? { note } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Review failed");
      if (action === "approve") {
        toast.loading(
          "Awaiting wallet approval to create the active campaign…",
          { id }
        );
        await createActiveCampaign(candidate, body);
      }
      toast.success(
        action === "approve"
          ? "Active disaster campaign created."
          : "Request rejected.",
        { id }
      );
      setRejecting(null);
      setNote("");
      await load();
    } catch (error) {
      toast.error(
        shortError(error, "Review could not be completed. Please try again."),
        { id }
      );
    }
  };
  const retry = async (candidate: Candidate) => {
    if (
      !candidate.organization_address ||
      !candidate.proposal ||
      !candidate.metadata_uri ||
      !candidate.metadata_digest
    )
      return;
    const id = toast.loading(
      "Awaiting wallet approval to create the active campaign…"
    );
    try {
      await createActiveCampaign(candidate, {
        organization: candidate.organization_address,
        goalLamports: candidate.proposal.goalLamports,
        uri: candidate.metadata_uri,
        digest: candidate.metadata_digest,
        endsAt: candidate.proposal.endsAt,
      });
      toast.success("Active disaster campaign created.", { id });
      await load();
    } catch (error) {
      toast.error(
        shortError(error, "Campaign creation could not be completed."),
        { id }
      );
    }
  };
  const columns: DataTableColumn<Candidate>[] = [
    {
      key: "disaster",
      header: "Disaster",
      cell: (c) => (
        <div>
          <p className="font-semibold" title={c.title}>
            {truncateWords(c.title)}
          </p>
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
          <p title={c.location}>{truncateWords(c.location)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {truncateWords(c.disaster_type)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
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
      key: "organization",
      header: "Organization",
      cell: (c) =>
        c.organization_address ? (
          <span className="font-mono text-xs">
            {ellipsify(c.organization_address, 6)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No request</span>
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
          {c.status === "requested" && (
            <>
              <Button
                size="sm"
                disabled={isSending}
                onClick={() => void decide(c, "approve")}
              >
                <Check /> Approve & create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejecting(c)}
              >
                <X /> Reject
              </Button>
            </>
          )}
          {c.status === "approved" && (
            <Button
              size="sm"
              disabled={isSending}
              onClick={() => void retry(c)}
            >
              Create active campaign
            </Button>
          )}
          {c.status === "activated" && c.campaign_address && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/campaigns/${c.campaign_address}`)}
            >
              Open campaign
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
            <span className="h-px w-5 bg-primary" /> Admin
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">
            Disaster candidates
          </h1>
          <p className="mt-3 text-muted-foreground">
            Review signed organization requests and create active canonical
            relief campaigns.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!isAdmin || loading}
          onClick={() =>
            void load().catch(() =>
              toast.error("Could not refresh candidates.")
            )
          }
        >
          <RefreshCw className={loading ? "animate-spin" : ""} /> Signed refresh
        </Button>
      </header>
      {!isAdmin ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Connect the canonical GlobalConfig admin wallet to review disaster
          requests.
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(c) => c.id}
          loading={loading}
          onRowClick={(c) => router.push(`/admin/disasters/${c.id}`)}
          emptyMessage="No disaster candidates are available on this cluster."
        />
      )}
      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(open) => !open && setRejecting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject organization request</DialogTitle>
            <DialogDescription>
              A short reviewer note is required and preserved with the candidate
              history.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="mt-5 min-h-28 w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            placeholder="Explain why this request is rejected"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!note.trim() || isSending}
              onClick={() => rejecting && void decide(rejecting, "reject")}
            >
              Reject request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
