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
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Organizations</h1>
          <p className="text-sm text-muted">
            Register, review, and manage canonical organization identity.
          </p>
        </div>
        <WalletButton />
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
          <button
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
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
          </button>
        </section>
      )}

      {selected && (
        <section className="space-y-4 rounded-xl border p-5">
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
              <dd>{selected.status}</dd>
            </div>
            <div>
              <dt className="text-muted">Verification</dt>
              <dd>
                {selected.verified
                  ? "Admin verified"
                  : "Awaiting admin verification"}
              </dd>
            </div>
          </dl>
          <button className="text-sm underline" onClick={() => void refresh()}>
            Refresh canonical state
          </button>
          <a className="block text-sm underline" href="/org/finance">
            Open organization finance dashboard
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
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
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
              </button>
              <label className="block text-sm">
                New authority wallet
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={nextAuthority}
                  onChange={(e) => setNextAuthority(e.target.value)}
                />
              </label>
              <button
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={disabled || !nextAuthority}
                onClick={() =>
                  void transact(async () =>
                    nominateAuthorityIx(selected, address(nextAuthority))
                  )
                }
              >
                Nominate authority
              </button>
            </div>
          )}
          {selected.pendingAuthority === walletAddress && (
            <button
              className="rounded border px-3 py-2 disabled:opacity-50"
              disabled={disabled}
              onClick={() =>
                void transact(async () =>
                  acceptAuthorityIx(selected, address(walletAddress))
                )
              }
            >
              Accept authority
            </button>
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
    </main>
  );
}
