"use client";
import { useCallback, useEffect, useState } from "react";
import { useCluster } from "../../components/cluster-context";
import { WalletButton } from "../../components/wallet-button";
import { useWallet } from "../../lib/wallet/context";

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
  const load = useCallback(
    () =>
      fetch("/api/disasters")
        .then(async (r) => {
          if (!r.ok) throw new Error("Could not load candidates");
          setItems(await r.json());
        })
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);
  const decide = async (c: Candidate, action: "approve" | "reject") => {
    if (!wallet?.signMessage) {
      setError("Connected wallet must support message signing");
      return;
    }
    const challenge = await fetch("/api/disasters/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: wallet.account.address,
        action,
        candidateId: c.id,
      }),
    }).then((r) => r.json());
    if (challenge.error) {
      setError(challenge.error);
      return;
    }
    const signed = await wallet.signMessage(
      new TextEncoder().encode(challenge.message)
    );
    const proposal =
      action === "approve"
        ? {
            organization: prompt("Organization address") || "",
            title: c.title,
            description: `Human-reviewed relief campaign for ${c.title}.`,
            disasterType: c.disaster_type,
            location: c.location,
            goalLamports: prompt("Goal in lamports") || "",
            endsAt: null,
          }
        : undefined;
    const note =
      action === "reject" ? prompt("Rejection note") || "" : undefined;
    const response = await fetch(`/api/disasters/${c.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        wallet: wallet.account.address,
        nonce: challenge.nonce,
        message: new TextDecoder().decode(signed.message),
        signature: b64(signed.signature),
        cluster,
        candidateId: c.id,
        proposal,
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
      {error && (
        <p role="alert" className="rounded border p-3">
          {error}
        </p>
      )}
      <button className="rounded border px-3 py-2" onClick={() => void load()}>
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
          {c.status === "detected" && (
            <div className="flex gap-2">
              <button
                className="rounded border px-3 py-2"
                onClick={() => void decide(c, "approve")}
              >
                Approve proposal
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
