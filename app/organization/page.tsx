"use client";

import { useCallback, useEffect, useState } from "react";
import { address, type Address, type Instruction } from "@solana/kit";
import { WalletButton } from "../components/wallet-button";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "../components/cluster-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import {
  acceptAuthorityIx,
  fetchAdmin,
  fetchOrganization,
  nominateAuthorityIx,
  organizationPda,
  registerOrganizationIx,
  rpcCall,
  setStatusIx,
  setVerifiedIx,
  updateMetadataIx,
  type OrganizationAccount,
} from "../lib/organizations/chain";
import { listCampaigns, type Campaign } from "../lib/campaigns/chain";
import { displaySol } from "../lib/campaigns/amount";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { RefreshCw, ShieldCheck, WalletCards } from "lucide-react";

type ListedOrganization = OrganizationAccount & {
  metadata?: { name: string } | null;
};
export default function OrganizationPage() {
  const { wallet } = useWallet();
  const { cluster, getExplorerUrl } = useCluster();
  const { send, isSending } = useSendTransaction();
  const walletAddress = wallet?.account.address;
  const supported = cluster === "devnet" || cluster === "localnet";
  const [mine, setMine] = useState<OrganizationAccount | null>(null);
  const [selected, setSelected] = useState<OrganizationAccount | null>(null);
  const [organizations, setOrganizations] = useState<ListedOrganization[]>([]);
  const [admin, setAdmin] = useState<Address | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [nextAuthority, setNextAuthority] = useState("");
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState("");
  const [signature, setSignature] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const [adminKey, listing] = await Promise.all([
        fetchAdmin(cluster),
        fetch(`/api/organizations?cluster=${cluster}`).then((r) =>
          r.ok ? (r.json() as Promise<ListedOrganization[]>) : []
        ),
      ]);
      setAdmin(adminKey);
      setOrganizations(listing);
      if (walletAddress) {
        const key = await organizationPda(walletAddress);
        const own = await fetchOrganization(cluster, key);
        setMine(own);
        if (own) setSelected(own);
        else {
          const managed = listing.find(
            (item) =>
              item.authority === walletAddress ||
              item.pendingAuthority === walletAddress
          );
          if (managed)
            setSelected(await fetchOrganization(cluster, managed.address));
        }
      } else {
        setMine(null);
        setSelected(null);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load organizations"
      );
    }
  }, [cluster, supported, walletAddress]);
  useEffect(() => {
    const handle = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(handle);
  }, [refresh]);

  useEffect(() => {
    if (!selected || !supported) {
      setCampaigns([]);
      return;
    }
    setCampaignsLoading(true);
    void listCampaigns(cluster)
      .then((all) =>
        setCampaigns(all.filter((campaign) => campaign.organization === selected.address))
      )
      .catch(() => setCampaigns([]))
      .finally(() => setCampaignsLoading(false));
  }, [cluster, selected, supported]);

  const transact = async (
    build: () => Promise<Instruction>,
    after?: () => Promise<void>
  ) => {
    setMessage("");
    setSignature("");
    setStage("Preparing");
    try {
      const ix = await build();
      setStage("Awaiting wallet signature");
      const sig = await send({ instructions: [ix] });
      setSignature(sig);
      setStage("Confirming");
      let confirmed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const status = await rpcCall<{
          value: Array<{ err: unknown; confirmationStatus: string } | null>;
        }>(cluster, "getSignatureStatuses", [
          [sig],
          { searchTransactionHistory: true },
        ]);
        if (status.value[0]?.err)
          throw new Error("Transaction failed on Solana");
        if (
          ["confirmed", "finalized"].includes(
            status.value[0]?.confirmationStatus || ""
          )
        ) {
          confirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!confirmed)
        throw new Error(
          "Transaction submitted, but confirmation timed out. Check the explorer before retrying."
        );
      setStage("Confirmed on Solana");
      if (after) await after();
      await refresh();
    } catch (error) {
      setStage("Failed");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const prepareMetadata = async () => {
    const response = await fetch("/api/metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "organization",
        metadata: { name, description, ...(website ? { website } : {}) },
      }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Metadata could not be validated");
    return body as { digest: string; uri: string };
  };
  const saveUri = async (key: Address, uri: string) => {
    const response = await fetch(`/api/organizations/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uri, cluster }),
    });
    if (!response.ok)
      setMessage(
        "Transaction confirmed; metadata link will appear after the indexer runs. Save this URI and retry."
      );
  };
  const canManage = selected?.authority === walletAddress;
  const isAdmin = !!walletAddress && admin === walletAddress;
  const disabled = isSending || !supported;

  return (
    <main className="min-h-screen bg-[#f7f4ed] px-5 py-8 text-[#302a21] md:px-8 md:py-10">
      <div className="mx-auto max-w-[1480px] space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-extrabold tracking-[.12em] text-red-700">— ORGANIZATION WORKSPACE</p>
          <h1 className="font-serif text-4xl">Organization overview</h1>
          <p className="mt-2 text-sm text-[#776f63]">Balances, delivery verification and trust signals across your campaigns.</p>
        </div>
        <div className="flex items-center gap-3"><WalletButton /></div>
      </header>
      {!supported && (
        <p role="alert" className="rounded-lg border p-4">
          Organization management is available on Devnet and localnet.
        </p>
      )}
      {stage && (
        <p role="status">
          Transaction: {stage}
          {signature && (
            <>
              {" "}
              ·{" "}
              <a
                className="underline"
                href={getExplorerUrl(`/tx/${signature}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View transaction
              </a>
            </>
          )}
        </p>
      )}
      {message && (
        <p role="alert" className="rounded-lg border border-red-500 p-3">
          {message}
        </p>
      )}

      {walletAddress && !mine && !selected && (
        <section className="space-y-4 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Register an organization</h2>
          <p className="text-sm text-muted">
            Enter a profile below. Registration starts in Pending status.
          </p>
          <label className="block text-sm">
            Name
            <input
              className="mt-1 w-full rounded border p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">Description
            <textarea className="mt-1 w-full rounded border p-2" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block text-sm">Website (optional)
            <input className="mt-1 w-full rounded border p-2" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.org" />
          </label>
          <Button
            disabled={disabled || !name || !description}
            onClick={() => {
              let metadata: { digest: string; uri: string } | undefined;
              void transact(
                async () => {
                  metadata = await prepareMetadata();
                  return registerOrganizationIx(address(walletAddress), metadata.digest);
                },
                async () =>
                  saveUri(
                    await organizationPda(address(walletAddress)),
                    metadata!.uri
                  )
              );
            }}
          >
            Register with wallet
          </Button>
        </section>
      )}

      {selected && (
        <>
        <section className="space-y-4 border border-[#d8d0c2] bg-[#fffdf8] p-5 shadow-[0_8px_30px_-26px_#302a21]">
          <h2 className="text-xl font-semibold">
            {organizations.find((item) => item.address === selected.address)
              ?.metadata?.name || "Organization"}
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Address</dt>
              <dd className="break-all font-mono">{selected.address}</dd>
            </div>
            <div>
              <dt className="text-muted">Authority</dt>
              <dd className="break-all font-mono">{selected.authority}</dd>
            </div>
            <div>
              <dt className="text-muted">Canonical status</dt>
              <dd className="mt-1"><Badge variant={selected.status === "Active" ? "success" : selected.status === "Closed" ? "destructive" : "warning"}>{selected.status}</Badge></dd>
            </div>
            <div>
              <dt className="text-muted">Verification</dt>
              <dd className="mt-1">
                {selected.verified
                  ? <Badge variant="success"><ShieldCheck className="mr-1 size-3" />Admin verified</Badge>
                  : <Badge variant="warning">Awaiting admin verification</Badge>}
              </dd>
            </div>
          </dl>
          <Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCw className="size-3.5" />Refresh canonical state</Button>
          <a
            className={buttonVariants({ variant: "outline", className: "w-fit" })}
            href="/organization/finance"
          >
            <WalletCards className="size-4" />Open finance dashboard
          </a>
          {canManage && selected.status !== "Closed" && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Manage profile</h3>
              <label className="block text-sm">
                Name
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm">Description
                <textarea className="mt-1 w-full rounded border p-2" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <label className="block text-sm">Website (optional)
                <input className="mt-1 w-full rounded border p-2" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
              <Button
                variant="outline"
                disabled={disabled || !name || !description}
                onClick={() => {
                  let metadata: { digest: string; uri: string } | undefined;
                  void transact(
                    async () => {
                      metadata = await prepareMetadata();
                      return updateMetadataIx(selected, metadata.digest);
                    },
                    async () => saveUri(selected.address, metadata!.uri)
                  );
                }}
              >
                Update metadata
              </Button>
              <label className="block text-sm">
                New authority wallet
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={nextAuthority}
                  onChange={(e) => setNextAuthority(e.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={disabled || !nextAuthority}
                onClick={() =>
                  void transact(async () =>
                    nominateAuthorityIx(selected, address(nextAuthority))
                  )
                }
              >
                Nominate authority
              </Button>
            </div>
          )}
          {selected.pendingAuthority === walletAddress && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() =>
                void transact(async () =>
                  acceptAuthorityIx(selected, address(walletAddress))
                )
              }
            >
              Accept authority
            </Button>
          )}
          {isAdmin && selected.status !== "Closed" && (
            <div className="space-x-2 space-y-2 border-t pt-4">
              <h3 className="font-semibold">Admin controls</h3>
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={disabled}
                onClick={() =>
                  void transact(async () =>
                    setVerifiedIx(
                      selected,
                      address(walletAddress),
                      !selected.verified
                    )
                  )
                }
              >
                {selected.verified
                  ? "Revoke verification"
                  : "Verify organization"}
              </button>
              {selected.verified && selected.status !== "Active" && (
                <button
                  className="rounded border px-3 py-2 disabled:opacity-50"
                  disabled={disabled}
                  onClick={() =>
                    void transact(async () =>
                      setStatusIx(selected, address(walletAddress), "Active")
                    )
                  }
                >
                  Activate
                </button>
              )}
              {selected.status === "Active" && (
                <button
                  className="rounded border px-3 py-2 disabled:opacity-50"
                  disabled={disabled}
                  onClick={() =>
                    void transact(async () =>
                      setStatusIx(selected, address(walletAddress), "Suspended")
                    )
                  }
                >
                  Suspend
                </button>
              )}
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm("Close this organization permanently?"))
                    void transact(async () =>
                      setStatusIx(selected, address(walletAddress), "Closed")
                    );
                }}
              >
                Close
              </button>
            </div>
          )}
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Raised", campaigns.reduce((sum, campaign) => sum + campaign.amountRaised, 0n), "SOL · canonical"],
            ["Allocated", campaigns.reduce((sum, campaign) => sum + campaign.amountReserved, 0n), "Reserved for delivery"],
            ["Disbursed", campaigns.reduce((sum, campaign) => sum + campaign.amountDisbursed, 0n), "Recorded on Solana"],
            ["Available", campaigns.reduce((sum, campaign) => sum + campaign.amountRaised - campaign.amountReserved - campaign.amountDisbursed, 0n), "Available to allocate"],
          ].map(([label, amount, detail]) => (
            <article key={String(label)} className="border-l-2 border-red-700 bg-[#fffdf8] p-5 shadow-[0_8px_30px_-26px_#302a21]">
              <p className="text-xs font-bold uppercase tracking-wide text-[#776f63]">{String(label)}</p>
              <p className="mt-1 font-serif text-3xl">{displaySol(amount as bigint)} <span className="text-base">SOL</span></p>
              <p className="mt-1 text-xs text-[#776f63]">{String(detail)}</p>
            </article>
          ))}
        </section>
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="overflow-hidden border border-[#d8d0c2] bg-[#fffdf8] shadow-[0_8px_30px_-26px_#302a21]">
            <div className="flex items-center justify-between border-b border-[#d8d0c2] p-5"><div><h2 className="font-serif text-2xl">Campaign balances</h2><p className="mt-1 text-sm text-[#776f63]">Canonical campaign accounts owned by this organization.</p></div><a href="/campaigns" className="text-sm font-bold underline">Open campaigns</a></div>
            <div className="overflow-x-auto"><table className="min-w-[640px] w-full text-left text-sm"><thead className="bg-[#eee7db] text-xs uppercase tracking-wide text-[#776f63]"><tr><th className="p-4">Campaign</th><th className="p-4">Status</th><th className="p-4">Raised</th><th className="p-4">Disbursed</th><th className="p-4">Available</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.address} className="border-t border-[#e6ded1]"><td className="p-4"><a href={`/campaigns/${campaign.address}`} className="font-bold underline">Campaign #{campaign.campaignId.toString()}</a><p className="mt-1 max-w-48 truncate font-mono text-xs text-[#776f63]">{campaign.address}</p></td><td className="p-4"><span className={campaign.status === "Active" ? "bg-[#dff1e1] px-2 py-1 text-xs font-bold text-[#29603a]" : "bg-[#f6e6bd] px-2 py-1 text-xs font-bold text-[#815b13]"}>{campaign.status}</span></td><td className="p-4">{displaySol(campaign.amountRaised)} SOL</td><td className="p-4">{displaySol(campaign.amountDisbursed)} SOL</td><td className="p-4">{displaySol(campaign.amountRaised - campaign.amountReserved - campaign.amountDisbursed)} SOL</td></tr>)}{!campaignsLoading && campaigns.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-[#776f63]">No campaign accounts found for this organization.</td></tr>}{campaignsLoading && <tr><td colSpan={5} className="p-8 text-center text-[#776f63]">Loading canonical campaign balances…</td></tr>}</tbody></table></div>
          </div>
          <aside className="space-y-6"><section className="border border-[#d8d0c2] bg-[#fffdf8] p-5"><h2 className="font-serif text-2xl">Needs attention</h2><ul className="mt-4 space-y-3 text-sm"><li className="border-l-2 border-amber-500 pl-3"><strong>Delivery verification</strong><br /><span className="text-[#776f63]">Evidence verification is not yet implemented in this app.</span></li><li className="border-l-2 border-cyan-600 pl-3"><strong>Canonical status</strong><br /><span className="text-[#776f63]">Refresh the organization record after each confirmed transaction.</span></li></ul></section><section className="border border-[#d8d0c2] bg-[#fffdf8] p-5"><h2 className="font-serif text-2xl">Trust signal</h2><p className="mt-3 font-serif text-4xl">82<span className="text-lg">/100</span></p><p className="mt-1 text-sm font-bold text-[#29603a]">Low observed risk</p><p className="mt-3 text-sm text-[#776f63]">Trust scoring is a sample presentation only; this app does not yet calculate or store AI assessments.</p></section></aside>
        </section>
        </>
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Indexed organizations</h2>
        {organizations.map((item) => (
          <button
            key={item.address}
            className="block w-full rounded border p-3 text-left"
            onClick={async () =>
              setSelected(
                await fetchOrganization(
                  cluster === "localnet" ? "localnet" : "devnet",
                  item.address
                )
              )
            }
          >
            {item.metadata?.name || item.address} · {item.status} ·{" "}
            {item.verified ? "Verified" : "Unverified"}
          </button>
        ))}
      </section>
      </div>
    </main>
  );
}
