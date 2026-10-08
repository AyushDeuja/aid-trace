"use client";

import { useCallback, useEffect, useState } from "react";
import { WalletButton } from "../../components/wallet-button";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { organizationPda } from "../../lib/organizations/chain";
import { address } from "@solana/kit";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { campaignPda, createCampaignIx, fetchCampaign, submitCampaignIx } from "../../lib/campaigns/chain";
import { fetchOrganization, rpcCall } from "../../lib/organizations/chain";

type Proposal = { title: string; description: string; disasterType: string; location: string; goalLamports: string; endsAt: string | null };
type Candidate = { id: string; status: string; title: string; location: string; disaster_type: string; occurred_at: string | null; observations: { provider: string; source_url: string }[]; proposal?: Proposal; metadata_uri?: string | null; metadata_digest?: string | null; campaign_address?: string | null };
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));

export default function OrganizationDisastersPage() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const [organization, setOrganization] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");

  useEffect(() => {
    if (!wallet?.account.address) {
      const timer = window.setTimeout(() => setOrganization(""), 0);
      return () => window.clearTimeout(timer);
    }
    void organizationPda(wallet.account.address).then((value) => setOrganization(value));
  }, [wallet?.account.address]);

  const authorize = async (action: "list_organization" | "request_campaign" | "prepare_draft" | "record_draft" | "record_submission", candidateId?: string) => {
    if (!wallet?.signMessage) throw new Error("Connected wallet must support message signing");
    if (!organization) throw new Error("Enter the organization address first");
    const challengeResponse = await fetch("/api/disasters/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: wallet.account.address, action, ...(candidateId ? { candidateId } : {}) }) });
    const challenge = await challengeResponse.json();
    if (!challengeResponse.ok) throw new Error(challenge.error || "Could not create authorization challenge");
    const signed = await wallet.signMessage(new TextEncoder().encode(challenge.message));
    if (new TextDecoder().decode(signed.message) !== challenge.message) throw new Error("Wallet returned a different signed message");
    return { wallet: wallet.account.address, organization, nonce: challenge.nonce, message: challenge.message, signature: b64(signed.signature), cluster, ...(candidateId ? { candidateId } : {}) };
  };
  const load = useCallback(async () => {
    try {
      const auth = await authorize("list_organization");
      const response = await fetch("/api/disasters/list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...auth, role: "organization" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load candidates");
      setItems(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load candidates"); }
  // Authorization follows the active wallet and explicit organization selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cluster, organization]);
  const requestCampaign = async (candidate: Candidate) => {
    try {
      const auth = await authorize("request_campaign", candidate.id);
      const goalLamports = prompt("Campaign goal in lamports");
      if (!goalLamports) return;
      const response = await fetch(`/api/disasters/${candidate.id}/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...auth, proposal: { title: candidate.title, description: `Relief campaign requested by the organization for ${candidate.title}.`, disasterType: candidate.disaster_type, location: candidate.location, goalLamports, endsAt: null } }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not request campaign");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request campaign"); }
  };
  const waitForConfirmation = async (signature: string) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await rpcCall<{ value: Array<{ err: unknown; confirmationStatus: string } | null> }>(cluster, "getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
      if (result.value[0]?.err) throw new Error("Transaction failed on Solana");
      if (["confirmed", "finalized"].includes(result.value[0]?.confirmationStatus || "")) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Transaction confirmation timed out; check the explorer before retrying");
  };
  const recordChainState = async (candidate: Candidate, phase: "draft_created" | "submitted", signature: string, campaignAddress: string) => {
    const auth = await authorize(phase === "draft_created" ? "record_draft" : "record_submission", candidate.id);
    const response = await fetch(`/api/disasters/${candidate.id}/chain`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...auth, phase, signature, campaignAddress }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not record campaign state");
  };
  const createDraft = async (candidate: Candidate) => {
    try {
      if (!wallet?.account.address || !candidate.proposal) throw new Error("The approved proposal is unavailable");
      setStage("Preparing canonical campaign metadata");
      const auth = await authorize("prepare_draft", candidate.id);
      const preparedResponse = await fetch(`/api/disasters/${candidate.id}/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...auth, proposal: candidate.proposal }) });
      const prepared = await preparedResponse.json();
      if (!preparedResponse.ok) throw new Error(prepared.error || "Could not prepare metadata");
      const org = await fetchOrganization(cluster, address(organization));
      if (!org || org.authority !== wallet.account.address) throw new Error("Connected wallet is not this organization authority");
      setStage("Awaiting wallet approval for campaign draft");
      const campaignAddress = await (async () => {
        const ix = await createCampaignIx(org.address, address(wallet.account.address), org.nextCampaignId, BigInt(prepared.goalLamports), null, prepared.digest, prepared.uri);
        const signature = await send({ instructions: [ix] });
        setStage("Confirming campaign draft");
        await waitForConfirmation(signature);
        const campaignAddress = await campaignPda(org.address, org.nextCampaignId);
        await recordChainState(candidate, "draft_created", signature, campaignAddress);
        return campaignAddress;
      })();
      setStage(`Draft created: ${campaignAddress}`);
      await load();
    } catch (cause) { setStage("Failed"); setError(cause instanceof Error ? cause.message : "Could not create campaign draft"); }
  };
  const submitDraft = async (candidate: Candidate) => {
    try {
      if (!wallet?.account.address || !candidate.campaign_address) throw new Error("Campaign draft address is unavailable");
      const campaign = await fetchCampaign(cluster, address(candidate.campaign_address));
      if (!campaign || campaign.authority !== wallet.account.address) throw new Error("Connected wallet cannot submit this draft");
      setStage("Awaiting wallet approval to submit for admin review");
      const signature = await send({ instructions: [await submitCampaignIx(campaign, address(wallet.account.address))] });
      setStage("Confirming campaign submission");
      await waitForConfirmation(signature);
      await recordChainState(candidate, "submitted", signature, candidate.campaign_address);
      setStage("Campaign submitted for admin activation");
      await load();
    } catch (cause) { setStage("Failed"); setError(cause instanceof Error ? cause.message : "Could not submit campaign draft"); }
  };

  return <main className="mx-auto max-w-5xl space-y-5 px-5 py-10">
    <header className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Disaster opportunities</h1><p className="text-sm text-muted">Organization authorities can request an admin-reviewed relief campaign. Nothing is created on-chain until the separate wallet approvals.</p></div><WalletButton /></header>
    {error && <p role="alert" className="rounded border p-3">{error}</p>}
    {stage && <p role="status">{stage}</p>}
    <label className="block text-sm">Organization address<input className="mt-1 w-full rounded border p-2 font-mono" value={organization} onChange={(event) => setOrganization(event.target.value)} /></label>
    <button className="rounded border px-3 py-2" disabled={!wallet || !organization} onClick={() => void load()}>Sign to view candidates</button>
    {items.map((candidate) => <article className="space-y-2 rounded-xl border p-4" key={candidate.id}><h2 className="font-semibold">{candidate.title}</h2><p>{candidate.disaster_type} · {candidate.location} · {candidate.status}</p>{candidate.observations.map((observation, index) => <a className="block text-sm underline" href={observation.source_url} key={index} target="_blank" rel="noreferrer">Source: {observation.provider}</a>)}{candidate.campaign_address && <a className="block text-sm underline" href={`/campaigns/${candidate.campaign_address}`}>Open canonical campaign draft</a>}{candidate.status === "detected" && <button className="rounded border px-3 py-2" onClick={() => void requestCampaign(candidate)}>Request admin approval</button>}{candidate.status === "approved" && <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={isSending} onClick={() => void createDraft(candidate)}>Create campaign draft</button>}{candidate.status === "draft_created" && <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={isSending} onClick={() => void submitDraft(candidate)}>Submit draft for admin review</button>}{candidate.status === "submitted" && <p className="text-sm text-muted">Submitted for the GlobalConfig admin to activate.</p>}</article>)}
  </main>;
}
