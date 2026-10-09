"use client";
import { useCallback, useEffect, useState } from "react";
import { useCluster } from "../../components/cluster-context";
import { WalletButton } from "../../components/wallet-button";
import { useWallet } from "../../lib/wallet/context";
import { fetchAdmin } from "../../lib/organizations/chain";
import { fetchOrganization, rpcCall } from "../../lib/organizations/chain";
import {
  campaignPda,
  createAdminDisasterCampaignIx,
} from "../../lib/campaigns/chain";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { address } from "@solana/kit";

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
export default function DisasterReview() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const [items, setItems] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [stage, setStage] = useState("");
  const signedPayload = async (action: string, candidateId?: string) => {
    if (!wallet?.signMessage)
      throw new Error("Connected wallet must support message signing");
    const challengeResponse = await fetch("/api/disasters/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: wallet.account.address,
        action,
        ...(candidateId ? { candidateId } : {}),
      }),
    });
    const challenge = await challengeResponse.json();
    if (!challengeResponse.ok)
      throw new Error(
        challenge.error || "Could not create authorization challenge"
      );
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load candidates");
    }
    // signedPayload intentionally follows the active wallet and cluster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cluster]);
  useEffect(() => {
    let current = true;
    if (!wallet?.account.address) {
      const timer = window.setTimeout(() => {
        if (current) setIsAdmin(false);
      }, 0);
      return () => {
        current = false;
        window.clearTimeout(timer);
      };
    }
    void fetchAdmin(cluster)
      .then((admin) => {
        if (current) setIsAdmin(admin === wallet.account.address);
      })
      .catch(() => {
        if (current) setIsAdmin(false);
      });
    return () => {
      current = false;
    };
  }, [wallet?.account.address, cluster]);
  const decide = async (c: Candidate, action: "approve" | "reject") => {
    if (!wallet?.signMessage) {
      setError("Connected wallet must support message signing");
      return;
    }
    try {
      const authorization = await signedPayload(action, c.id);
      const note =
        action === "reject" ? prompt("Rejection note") || "" : undefined;
      const response = await fetch(`/api/disasters/${c.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...authorization, note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Review failed");
      if (action === "approve") await createActiveCampaign(c, body);
      await load();
    } catch (cause) {
      setStage("Failed");
      setError(cause instanceof Error ? cause.message : "Review failed");
    }
  };
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
    if (!organization)
      throw new Error("Organization is unavailable on the selected cluster");
    setStage("Awaiting wallet approval to create the active disaster campaign");
    const ix = await createAdminDisasterCampaignIx(
      organization.address,
      address(wallet.account.address),
      organization.nextCampaignId,
      BigInt(approval.goalLamports),
      approval.endsAt
        ? BigInt(Math.floor(new Date(approval.endsAt).getTime() / 1000))
        : null,
      approval.digest,
      approval.uri
    );
    const signature = await send({ instructions: [ix] });
    setStage("Confirming active campaign");
    for (let attempt = 0; attempt < 30; attempt++) {
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
      if (attempt === 29)
        throw new Error("Campaign transaction confirmation timed out");
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
        signature,
        campaignAddress,
      }),
    });
    const recordedBody = await recorded.json();
    if (!recorded.ok)
      throw new Error(
        recordedBody.error ||
          "Campaign was created but could not be linked to the request"
      );
    setStage(`Active campaign created: ${campaignAddress}`);
  };
  const retryActiveCampaign = async (candidate: Candidate) => {
    if (
      !candidate.organization_address ||
      !candidate.proposal ||
      !candidate.metadata_uri ||
      !candidate.metadata_digest
    )
      return;
    try {
      setError("");
      await createActiveCampaign(candidate, {
        organization: candidate.organization_address,
        goalLamports: candidate.proposal.goalLamports,
        uri: candidate.metadata_uri,
        digest: candidate.metadata_digest,
        endsAt: candidate.proposal.endsAt,
      });
      await load();
    } catch (cause) {
      setStage("Failed");
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the active campaign"
      );
    }
  };
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-5 py-10">
      <header className="flex justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Disaster candidates</h1>
          <p className="text-sm text-muted">
            Approving a verified organization request prepares canonical
            metadata and asks the admin wallet to create an active campaign.
          </p>
        </div>
        <WalletButton />
      </header>
      {!isAdmin && (
        <p role="alert" className="rounded border p-3">
          Connect the GlobalConfig admin wallet to view disaster requests.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded border p-3">
          {error}
        </p>
      )}
      {stage && <p role="status">{stage}</p>}
      <button
        disabled={!isAdmin}
        className="rounded border px-3 py-2 disabled:opacity-50"
        onClick={() => void load()}
      >
        Refresh
      </button>
      {items.map((c) => (
        <article className="space-y-2 rounded-xl border p-4" key={c.id}>
          <h2 className="font-semibold">{c.title}</h2>
          <p>
            {c.disaster_type} · {c.location} · {c.status}
          </p>
          <p className="text-sm text-muted">
            {c.provider} · {c.occurred_at || "time unavailable"}
          </p>
          {c.observations.map((o, i) => (
            <a
              className="block break-all text-sm underline"
              href={o.source_url}
              key={i}
              target="_blank"
              rel="noreferrer"
            >
              Source: {o.provider}
            </a>
          ))}
          {c.status === "requested" && isAdmin && (
            <div className="flex gap-2">
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={isSending}
                onClick={() => void decide(c, "approve")}
              >
                Approve organization request
              </button>
              <button
                className="rounded border px-3 py-2"
                onClick={() => void decide(c, "reject")}
              >
                Reject
              </button>
            </div>
          )}
          {c.status === "approved" &&
            isAdmin &&
            c.organization_address &&
            c.proposal &&
            c.metadata_uri &&
            c.metadata_digest && (
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={isSending}
                onClick={() => void retryActiveCampaign(c)}
              >
                Create active campaign
              </button>
            )}
        </article>
      ))}
    </main>
  );
}
