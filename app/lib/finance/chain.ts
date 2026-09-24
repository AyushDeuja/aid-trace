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
import { vaultPda, type Campaign } from "../campaigns/chain";
import type { ClusterMoniker } from "../solana-client";

const enc = new TextEncoder();
const decoder = getAddressDecoder();
const encoder = getAddressEncoder();
const system = address("11111111111111111111111111111111");
const ro = (address: Address) => ({ address, role: AccountRole.READONLY });
const rw = (address: Address) => ({ address, role: AccountRole.WRITABLE });
const sig = (address: Address) => ({
  address,
  role: AccountRole.WRITABLE_SIGNER,
});
const u64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};
const join = (...parts: Uint8Array[]) => {
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    b.set(p, o);
    o += p.length;
  }
  return b;
};
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const digest = (value: string) => {
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error("Invalid metadata digest");
  return Uint8Array.from(value.match(/../g)!, (x) => parseInt(x, 16));
};
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

export type AllocationStatus = "Open" | "Closed" | "Cancelled";
export type Allocation = {
  address: Address;
  campaign: Address;
  allocationId: bigint;
  recipient: Address;
  amount: bigint;
  spent: bigint;
  purposeDigest: string;
  createdAt: bigint;
  status: AllocationStatus;
  nextDisbursementId: bigint;
  bump: number;
};
export type Disbursement = {
  address: Address;
  allocation: Address;
  campaign: Address;
  disbursementId: bigint;
  recipient: Address;
  amount: bigint;
  descriptionDigest: string;
  createdAt: bigint;
  authority: Address;
  status: "Recorded" | "Verified" | "Disputed" | "Rejected";
  bump: number;
};

export async function allocationPda(campaign: Address, id: bigint) {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ID,
      seeds: ["allocation", encoder.encode(campaign), u64(id)],
    })
  )[0];
}
export async function disbursementPda(allocation: Address, id: bigint) {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ID,
      seeds: ["disbursement", encoder.encode(allocation), u64(id)],
    })
  )[0];
}
export async function createAllocationIx(
  campaign: Campaign,
  authority: Address,
  recipient: Address,
  amount: bigint,
  purposeDigest: string
) {
  const allocation = await allocationPda(
    campaign.address,
    campaign.nextAllocationId
  );
  return ix(
    "create_allocation",
    [
      ro(await configPda()),
      ro(campaign.organization),
      rw(campaign.address),
      rw(allocation),
      sig(authority),
      ro(system),
    ],
    join(
      u64(campaign.nextAllocationId),
      Uint8Array.from(encoder.encode(recipient)),
      u64(amount),
      digest(purposeDigest)
    )
  );
}
export async function cancelAllocationIx(
  allocation: Allocation,
  campaign: Campaign,
  authority: Address
) {
  return ix("cancel_allocation", [
    ro(campaign.organization),
    rw(campaign.address),
    rw(allocation.address),
    sig(authority),
  ]);
}
export async function recordDisbursementIx(
  allocation: Allocation,
  campaign: Campaign,
  authority: Address,
  amount: bigint,
  descriptionDigest: string
) {
  const disbursement = await disbursementPda(
    allocation.address,
    allocation.nextDisbursementId
  );
  return ix(
    "record_disbursement",
    [
      ro(await configPda()),
      ro(campaign.organization),
      rw(campaign.address),
      rw(await vaultPda(campaign.address)),
      rw(allocation.address),
      rw(disbursement),
      rw(allocation.recipient),
      sig(authority),
      ro(system),
    ],
    join(
      u64(allocation.nextDisbursementId),
      u64(amount),
      digest(descriptionDigest)
    )
  );
}

function view(raw: Uint8Array) {
  return new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
}
function is(raw: Uint8Array, offset: number, values: readonly string[]) {
  return values[raw[offset]];
}
export async function decodeAllocation(
  key: Address,
  raw: Uint8Array
): Promise<Allocation> {
  if (
    raw.length !== 154 ||
    !(await discriminator("account", "Allocation")).every(
      (b, i) => raw[i] === b
    )
  )
    throw new Error("Invalid allocation account");
  const v = view(raw);
  let p = 8;
  const pubkey = () => {
    const a = decoder.decode(raw.slice(p, p + 32));
    p += 32;
    return a;
  };
  const u = () => {
    const n = v.getBigUint64(p, true);
    p += 8;
    return n;
  };
  const campaign = pubkey(),
    allocationId = u(),
    recipient = pubkey(),
    amount = u(),
    spent = u();
  const purposeDigest = hex(raw.slice(p, p + 32));
  p += 32;
  const createdAt = v.getBigInt64(p, true);
  p += 8;
  const status = is(raw, p++, [
    "Open",
    "Closed",
    "Cancelled",
  ] as const) as AllocationStatus;
  const nextDisbursementId = u(),
    bump = raw[p];
  if (!status || (await allocationPda(campaign, allocationId)) !== key)
    throw new Error("Allocation account mismatch");
  return {
    address: key,
    campaign,
    allocationId,
    recipient,
    amount,
    spent,
    purposeDigest,
    createdAt,
    status,
    nextDisbursementId,
    bump,
  };
}
export async function decodeDisbursement(
  key: Address,
  raw: Uint8Array
): Promise<Disbursement> {
  if (
    raw.length !== 210 ||
    !(await discriminator("account", "Disbursement")).every(
      (b, i) => raw[i] === b
    )
  )
    throw new Error("Invalid disbursement account");
  const v = view(raw);
  let p = 8;
  const pubkey = () => {
    const a = decoder.decode(raw.slice(p, p + 32));
    p += 32;
    return a;
  };
  const u = () => {
    const n = v.getBigUint64(p, true);
    p += 8;
    return n;
  };
  const allocation = pubkey(),
    campaign = pubkey(),
    disbursementId = u(),
    recipient = pubkey(),
    amount = u();
  const descriptionDigest = hex(raw.slice(p, p + 32));
  p += 32;
  const createdAt = v.getBigInt64(p, true);
  p += 8;
  const authority = pubkey();
  const status = is(raw, p++, [
    "Recorded",
    "Verified",
    "Disputed",
    "Rejected",
  ] as const) as Disbursement["status"];
  p += 8;
  const bump = raw[p];
  if (!status || (await disbursementPda(allocation, disbursementId)) !== key)
    throw new Error("Disbursement account mismatch");
  return {
    address: key,
    allocation,
    campaign,
    disbursementId,
    recipient,
    amount,
    descriptionDigest,
    createdAt,
    authority,
    status,
    bump,
  };
}
async function programAccounts(cluster: ClusterMoniker) {
  return rpcCall<
    Array<{
      pubkey: string;
      account: { owner: string; data: [string, string] };
    }>
  >(cluster, "getProgramAccounts", [
    PROGRAM_ID,
    { encoding: "base64", commitment: "confirmed" },
  ]);
}
export async function listAllocations(
  cluster: ClusterMoniker,
  campaign: Address
) {
  const accounts = await programAccounts(cluster);
  const values: Allocation[] = [];
  for (const item of accounts)
    try {
      if (item.account.owner === PROGRAM_ID) {
        const value = await decodeAllocation(
          address(item.pubkey),
          Uint8Array.from(atob(item.account.data[0]), (c) => c.charCodeAt(0))
        );
        if (value.campaign === campaign) values.push(value);
      }
    } catch {}
  return values.sort((a, b) => Number(a.allocationId - b.allocationId));
}
export async function listDisbursements(
  cluster: ClusterMoniker,
  campaign: Address
) {
  const accounts = await programAccounts(cluster);
  const values: Disbursement[] = [];
  for (const item of accounts)
    try {
      if (item.account.owner === PROGRAM_ID) {
        const value = await decodeDisbursement(
          address(item.pubkey),
          Uint8Array.from(atob(item.account.data[0]), (c) => c.charCodeAt(0))
        );
        if (value.campaign === campaign) values.push(value);
      }
    } catch {}
  return values.sort((a, b) => Number(a.disbursementId - b.disbursementId));
}
export const availableFunds = (campaign: Campaign) =>
  campaign.amountRaised - campaign.amountDisbursed - campaign.amountReserved;
