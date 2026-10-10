"use client";

import { useCallback, useEffect, useState } from "react";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../../lib/wallet/context";
import { organizationPda } from "../../lib/organizations/chain";
import { displaySol } from "../../lib/campaigns/amount";

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
  occurred_at: string | null;
  observations: { provider: string; source_url: string }[];
  proposal?: Proposal;
  metadata_uri?: string | null;
  metadata_digest?: string | null;
  campaign_address?: string | null;
};
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));

export default function OrganizationDisastersPage() {
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const [organization, setOrganization] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!wallet?.account.address) {
      const timer = window.setTimeout(() => setOrganization(""), 0);
      return () => window.clearTimeout(timer);
    }
    void organizationPda(wallet.account.address).then((value) =>
      setOrganization(value)
    );
  }, [wallet?.account.address]);

  const authorize = async (
    action: "list_organization" | "request_campaign",
    candidateId?: string
  ) => {
    if (!wallet?.signMessage)
      throw new Error("Connected wallet must support message signing");
    if (!organization) throw new Error("Enter the organization address first");
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
      organization,
      nonce: challenge.nonce,
      message: challenge.message,
      signature: b64(signed.signature),
      cluster,
      ...(candidateId ? { candidateId } : {}),
    };
  };
  const load = useCallback(async () => {
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
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load candidates"
      );
    }
    // Authorization follows the active wallet and explicit organization selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cluster, organization]);
  const requestCampaign = async (candidate: Candidate) => {
    try {
      const auth = await authorize("request_campaign", candidate.id);
      const goalSol = goals[candidate.id] || "";
      const response = await fetch(`/api/disasters/${candidate.id}/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...auth,
          proposal: {
            title: candidate.title,
            description: `Relief campaign requested by the organization for ${candidate.title}.`,
            disasterType: candidate.disaster_type,
            location: candidate.location,
            goalSol,
            endsAt: null,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not request campaign");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not request campaign"
      );
    }
  };
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-5 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Disaster opportunities</h1>
          <p className="text-sm text-muted">
            Organization authorities submit a campaign request; admin approval
            creates the active canonical campaign.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded border p-3">
          {error}
        </p>
      )}
      <label className="block text-sm">
        Organization address
        <input
          className="mt-1 w-full rounded border p-2 font-mono"
          value={organization}
          onChange={(event) => setOrganization(event.target.value)}
        />
      </label>
      <button
        className="rounded border px-3 py-2"
        disabled={!wallet || !organization}
        onClick={() => void load()}
      >
        Sign to view candidates
      </button>
      {items.map((candidate) => (
        <article className="space-y-2 rounded-xl border p-4" key={candidate.id}>
          <h2 className="font-semibold">{candidate.title}</h2>
          <p>
            {candidate.disaster_type} · {candidate.location} ·{" "}
            {candidate.status}
          </p>
          {candidate.observations.map((observation, index) => (
            <a
              className="block text-sm underline"
              href={observation.source_url}
              key={index}
              target="_blank"
              rel="noreferrer"
            >
              Source: {observation.provider}
            </a>
          ))}
          {candidate.campaign_address && (
            <a
              className="block text-sm underline"
              href={`/campaigns/${candidate.campaign_address}`}
            >
              Open active canonical campaign
            </a>
          )}
          {candidate.status === "detected" && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                Goal in SOL
                <input
                  className="mt-1 block rounded border p-2"
                  inputMode="decimal"
                  placeholder="10"
                  value={goals[candidate.id] || ""}
                  onChange={(event) =>
                    setGoals((current) => ({
                      ...current,
                      [candidate.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                className="rounded border px-3 py-2"
                disabled={!goals[candidate.id]}
                onClick={() => void requestCampaign(candidate)}
              >
                Request admin approval
              </button>
            </div>
          )}
          {candidate.proposal && (
            <p className="text-sm text-muted">
              Requested goal:{" "}
              {displaySol(BigInt(candidate.proposal.goalLamports))} SOL
            </p>
          )}
          {candidate.status === "requested" && (
            <p className="text-sm text-muted">
              Awaiting GlobalConfig admin approval.
            </p>
          )}
          {candidate.status === "approved" && (
            <p className="text-sm text-muted">
              Approved; the admin can complete campaign creation from the
              disaster review dashboard.
            </p>
          )}
          {candidate.status === "activated" && (
            <p className="text-sm text-muted">Campaign is active.</p>
          )}
        </article>
      ))}
    </main>
  );
}
