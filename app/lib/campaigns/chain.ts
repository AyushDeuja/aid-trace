import {
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";
import { PROGRAM_ID, configPda, rpcCall } from "../organizations/chain";
import type { ClusterMoniker } from "../solana-client";

const enc = new TextEncoder();
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();
const system = address("11111111111111111111111111111111");
const rw = (address: Address) => ({ address, role: AccountRole.WRITABLE });
const ro = (address: Address) => ({ address, role: AccountRole.READONLY });
const sig = (address: Address) => ({
  address,
  role: AccountRole.WRITABLE_SIGNER,
});
const u64 = (n: bigint) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
};
const i64 = (n: bigint) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, n, true);
  return out;
};
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};
const digestBytes = (hex: string) => {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("Invalid metadata digest");
  return Uint8Array.from(hex.match(/../g)!, (x) => parseInt(x, 16));
};
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function discriminator(prefix: string, name: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(`${prefix}:${name}`))
  ).slice(0, 8);
}
async function ix(
  name: string,
  accounts: { address: Address; role: AccountRole }[],
  args = new Uint8Array()
): Promise<Instruction> {
  return {
    programAddress: PROGRAM_ID,
    accounts,
    data: join(await discriminator("global", name), args),
  };
}
export async function campaignPda(org: Address, id: bigint) {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ID,
      seeds: ["campaign", addressEncoder.encode(org), u64(id)],
    })
  )[0];
}
export async function vaultPda(campaign: Address) {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ID,
      seeds: ["campaign_vault", addressEncoder.encode(campaign)],
    })
  )[0];
}
export async function donationPda(campaign: Address, id: bigint) {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ID,
      seeds: ["donation", addressEncoder.encode(campaign), u64(id)],
    })
  )[0];
}
export type CampaignStatus =
  "Draft" | "PendingReview" | "Active" | "Paused" | "Closed";
export type Campaign = {
  address: Address;
  organization: Address;
  authority: Address;
  campaignId: bigint;
  targetAmount: bigint;
  amountRaised: bigint;
  amountDisbursed: bigint;
  status: CampaignStatus;
  createdAt: bigint;
  endsAt: bigint | null;
  metadataDigest: string;
  metadataUri: string;
  nextDonationId: bigint;
  nextAllocationId: bigint;
  bump: number;
};
export async function createCampaignIx(
  org: Address,
  authority: Address,
  id: bigint,
  goal: bigint,
  endsAt: bigint | null,
  digest: string,
  uri: string
) {
  const campaign = await campaignPda(org, id);
  const uriBytes = enc.encode(uri);
  return ix(
    "create_campaign",
    [
      ro(await configPda()),
      rw(org),
      rw(campaign),
      rw(await vaultPda(campaign)),
      sig(authority),
      ro(system),
    ],
    join(
      u64(id),
      u64(goal),
      Uint8Array.of(endsAt === null ? 0 : 1),
      endsAt === null ? new Uint8Array() : i64(endsAt),
      digestBytes(digest),
      u32(uriBytes.length),
      uriBytes
    )
  );
}
export async function updateCampaignIx(
  c: Campaign,
  authority: Address,
  goal: bigint,
  endsAt: bigint | null,
  digest: string,
  uri: string
) {
  const bytes = enc.encode(uri);
  return ix(
    "update_campaign",
    [ro(c.organization), rw(c.address), sig(authority)],
    join(
      u64(goal),
      Uint8Array.of(endsAt === null ? 0 : 1),
      endsAt === null ? new Uint8Array() : i64(endsAt),
      digestBytes(digest),
      u32(bytes.length),
      bytes
    )
  );
}
export async function submitCampaignIx(c: Campaign, authority: Address) {
  return ix("submit_campaign", [
    ro(c.organization),
    rw(c.address),
    sig(authority),
  ]);
}
export async function setCampaignStatusIx(
  c: Campaign,
  admin: Address,
  status: "Active" | "Paused" | "Closed"
) {
  return ix(
    "set_campaign_status",
    [ro(await configPda()), ro(c.organization), rw(c.address), sig(admin)],
    Uint8Array.of({ Active: 2, Paused: 3, Closed: 4 }[status])
  );
}
export async function donateIx(c: Campaign, donor: Address, amount: bigint) {
  return ix(
    "donate",
    [
      ro(await configPda()),
      ro(c.organization),
      rw(c.address),
      rw(await vaultPda(c.address)),
      rw(await donationPda(c.address, c.nextDonationId)),
      sig(donor),
      ro(system),
    ],
    join(u64(amount), u64(c.nextDonationId))
  );
}
function u32(n: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}
export async function decodeCampaign(
  key: Address,
  raw: Uint8Array
): Promise<Campaign> {
  if (raw.length < 8 + 32 + 32 + 8 * 4 + 1 + 8 + 1 + 32 + 4 + 8 + 8 + 1)
    throw new Error("Campaign account is too small");
  const expected = await discriminator("account", "Campaign");
  if (!expected.every((b, i) => raw[i] === b))
    throw new Error("Invalid campaign discriminator");
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let p = 8;
  const addr = () => {
    const a = addressDecoder.decode(raw.slice(p, p + 32));
    p += 32;
    return a;
  };
  const readU64 = () => {
    const n = v.getBigUint64(p, true);
    p += 8;
    return n;
  };
  const organization = addr(),
    authority = addr(),
    campaignId = readU64(),
    targetAmount = readU64(),
    amountRaised = readU64(),
    amountDisbursed = readU64();
  const status = (
    ["Draft", "PendingReview", "Active", "Paused", "Closed"] as const
  )[raw[p++]];
  if (!status) throw new Error("Invalid campaign status");
  const createdAt = v.getBigInt64(p, true);
  p += 8;
  const tag = raw[p++];
  if (tag > 1) throw new Error("Invalid end time");
  const endsAt = tag ? v.getBigInt64(p, true) : null;
  if (tag) p += 8;
  const metadataDigest = hex(raw.slice(p, p + 32));
  p += 32;
  const length = v.getUint32(p, true);
  p += 4;
  if (length > 500 || p + length + 17 > raw.length)
    throw new Error("Invalid campaign metadata URI");
  const metadataUri = new TextDecoder().decode(raw.slice(p, p + length));
  p += length;
  const nextDonationId = readU64(),
    nextAllocationId = readU64(),
    bump = raw[p];
  if ((await campaignPda(organization, campaignId)) !== key)
    throw new Error("Campaign PDA mismatch");
  return {
    address: key,
    organization,
    authority,
    campaignId,
    targetAmount,
    amountRaised,
    amountDisbursed,
    status,
    createdAt,
    endsAt,
    metadataDigest,
    metadataUri,
    nextDonationId,
    nextAllocationId,
    bump,
  };
}
export async function fetchCampaign(cluster: ClusterMoniker, key: Address) {
  const result = await rpcCall<{
    value: { owner: string; data: [string, string] } | null;
  }>(cluster, "getAccountInfo", [
    key,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (!result.value) return null;
  if (result.value.owner !== PROGRAM_ID)
    throw new Error("Invalid campaign owner");
  return decodeCampaign(
    key,
    Uint8Array.from(atob(result.value.data[0]), (c) => c.charCodeAt(0))
  );
}
export async function fetchDonation(
  cluster: ClusterMoniker,
  campaign: Address,
  id: bigint
) {
  const key = await donationPda(campaign, id);
  const result = await rpcCall<{
    value: { owner: string; data: [string, string] } | null;
  }>(cluster, "getAccountInfo", [
    key,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (!result.value) return null;
  if (result.value.owner !== PROGRAM_ID)
    throw new Error("Invalid donation owner");
  const raw = Uint8Array.from(atob(result.value.data[0]), (c) =>
    c.charCodeAt(0)
  );
  if (
    raw.length !== 98 ||
    !(await discriminator("account", "Donation")).every((b, i) => raw[i] === b)
  )
    throw new Error("Invalid donation account");
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (
    addressDecoder.decode(raw.slice(8, 40)) !== campaign ||
    v.getBigUint64(72, true) !== id ||
    raw[88] !== 0
  )
    throw new Error("Donation record mismatch");
  return {
    address: key,
    campaign,
    donor: addressDecoder.decode(raw.slice(40, 72)),
    donationId: id,
    amount: v.getBigUint64(80, true),
    source: "Standard" as const,
    occurredAt: v.getBigInt64(89, true),
    bump: raw[97],
  };
}
export async function listCampaigns(cluster: ClusterMoniker) {
  const result = await rpcCall<
    Array<{
      pubkey: string;
      account: { owner: string; data: [string, string] };
    }>
  >(cluster, "getProgramAccounts", [
    PROGRAM_ID,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  const campaigns: Campaign[] = [];
  for (const item of result) {
    try {
      if (item.account.owner === PROGRAM_ID)
        campaigns.push(
          await decodeCampaign(
            address(item.pubkey),
            Uint8Array.from(atob(item.account.data[0]), (c) => c.charCodeAt(0))
          )
        );
    } catch {
      /* other program accounts */
    }
  }
  return campaigns;
}
