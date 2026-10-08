"use client";
import { useCallback, useEffect, useState } from "react";
import { useCluster } from "../../components/cluster-context";
import { WalletButton } from "../../components/wallet-button";
import { useWallet } from "../../lib/wallet/context";
import { fetchAdmin } from "../../lib/organizations/chain";

type Candidate = {
  id: string;
  status: string;
  title: string;
  location: string;
  disaster_type: string;
  provider: string;
  occurred_at: string | null;
  observations: { source_url: string; provider: string }[];
};
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));
export default function DisasterReview() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const [items, setItems] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const signedPayload = async (action: string, candidateId?: string) => {
    if (!wallet?.signMessage) throw new Error("Connected wallet must support message signing");
    const challengeResponse = await fetch("/api/disasters/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: wallet.account.address, action, ...(candidateId ? { candidateId } : {}) }) });
    const challenge = await challengeResponse.json();
    if (!challengeResponse.ok) throw new Error(challenge.error || "Could not create authorization challenge");
    const signed = await wallet.signMessage(new TextEncoder().encode(challenge.message));
    if (new TextDecoder().decode(signed.message) !== challenge.message)
      throw new Error("Wallet returned a different signed message");
    return { wallet: wallet.account.address, nonce: challenge.nonce, message: challenge.message, signature: b64(signed.signature), cluster, ...(candidateId ? { candidateId } : {}) };
  };
  const load = useCallback(async () => {
    try {
      const payload = await signedPayload("list_admin");
      const response = await fetch("/api/disasters/list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, role: "admin" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load candidates");
      setItems(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load candidates"); }
  // signedPayload intentionally follows the active wallet and cluster.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cluster]);
  useEffect(() => {
    let current = true;
    if (!wallet?.account.address) { setIsAdmin(false); return; }
    void fetchAdmin(cluster).then((admin) => { if (current) setIsAdmin(admin === wallet.account.address); }).catch(() => { if (current) setIsAdmin(false); });
    return () => { current = false; };
  }, [wallet?.account.address, cluster]);
  const decide = async (c: Candidate, action: "approve" | "reject") => {
    if (!wallet?.signMessage) {
      setError("Connected wallet must support message signing");
      return;
    }
    const authorization = await signedPayload(action, c.id);
    const note =
      action === "reject" ? prompt("Rejection note") || "" : undefined;
    const response = await fetch(`/api/disasters/${c.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        ...authorization,
        note,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Review failed");
      return;
    }
    await load();
  };
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-5 py-10">
      <header className="flex justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Disaster candidates</h1>
          <p className="text-sm text-muted">
            Private, provenance-first human review. No candidate creates a
            campaign automatically.
          </p>
        </div>
        <WalletButton />
      </header>
      {!isAdmin && <p role="alert" className="rounded border p-3">Connect the GlobalConfig admin wallet to view disaster requests.</p>}
      {error && (
        <p role="alert" className="rounded border p-3">
          {error}
        </p>
      )}
      <button disabled={!isAdmin} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void load()}>
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
                className="rounded border px-3 py-2"
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
        </article>
      ))}
    </main>
  );
}
