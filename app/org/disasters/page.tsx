"use client";

import { useCallback, useEffect, useState } from "react";
import { WalletButton } from "../../components/wallet-button";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { organizationPda } from "../../lib/organizations/chain";

type Candidate = { id: string; status: string; title: string; location: string; disaster_type: string; occurred_at: string | null; observations: { provider: string; source_url: string }[] };
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));

export default function OrganizationDisastersPage() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const [organization, setOrganization] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!wallet?.account.address) { setOrganization(""); return; }
    void organizationPda(wallet.account.address).then((value) => setOrganization(value));
  }, [wallet?.account.address]);

  const authorize = async (action: "list_organization" | "request_campaign", candidateId?: string) => {
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

  return <main className="mx-auto max-w-5xl space-y-5 px-5 py-10">
    <header className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Disaster opportunities</h1><p className="text-sm text-muted">Organization authorities can request an admin-reviewed relief campaign. Nothing is created on-chain until the separate wallet approvals.</p></div><WalletButton /></header>
    {error && <p role="alert" className="rounded border p-3">{error}</p>}
    <label className="block text-sm">Organization address<input className="mt-1 w-full rounded border p-2 font-mono" value={organization} onChange={(event) => setOrganization(event.target.value)} /></label>
    <button className="rounded border px-3 py-2" disabled={!wallet || !organization} onClick={() => void load()}>Sign to view candidates</button>
    {items.map((candidate) => <article className="space-y-2 rounded-xl border p-4" key={candidate.id}><h2 className="font-semibold">{candidate.title}</h2><p>{candidate.disaster_type} · {candidate.location} · {candidate.status}</p>{candidate.observations.map((observation, index) => <a className="block text-sm underline" href={observation.source_url} key={index} target="_blank" rel="noreferrer">Source: {observation.provider}</a>)}{candidate.status === "detected" && <button className="rounded border px-3 py-2" onClick={() => void requestCampaign(candidate)}>Request admin approval</button>}</article>)}
  </main>;
}
