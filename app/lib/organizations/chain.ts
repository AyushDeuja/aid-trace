import {
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";
import { getClusterUrl, type ClusterMoniker } from "../solana-client";

export const PROGRAM_ID = address(
  "5Z7gLMeuA9xqwRQNmuZeZCgUYCSVPtAhqhnvid7V6PXn"
);
const SYSTEM_ID = address("11111111111111111111111111111111");
const encoder = getAddressEncoder();
const decoder = getAddressDecoder();
const utf8 = new TextEncoder();

export type OrganizationStatus = "Pending" | "Active" | "Suspended" | "Closed";
export type OrganizationAccount = {
  address: Address;
  founder: Address;
  authority: Address;
  pendingAuthority: Address | null;
  metadataDigest: string;
  status: OrganizationStatus;
  verified: boolean;
  verifiedDeliveryCount: bigint;
  nextCampaignId: bigint;
};

export async function organizationPda(founder: Address) {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ID,
      seeds: ["org", encoder.encode(founder)],
    })
  )[0];
}
export async function configPda() {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ID,
      seeds: ["config"],
    })
  )[0];
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}
function bytesFromHex(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value))
    throw new Error("Expected a 32-byte SHA-256 digest");
  return Uint8Array.from(value.match(/../g)!, (x) => parseInt(x, 16));
}
async function discriminator(name: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8.encode(`global:${name}`))
  ).slice(0, 8);
}
async function instruction(
  name: string,
  accounts: { address: Address; role: AccountRole }[],
  args = new Uint8Array()
): Promise<Instruction> {
  const data = new Uint8Array(8 + args.length);
  data.set(await discriminator(name));
  data.set(args, 8);
  return { programAddress: PROGRAM_ID, accounts, data };
}
const writable = (address: Address) => ({
  address,
  role: AccountRole.WRITABLE,
});
const readonly = (address: Address) => ({
  address,
  role: AccountRole.READONLY,
});
const signer = (address: Address, write = false) => ({
  address,
  role: write ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER,
});

export async function registerOrganizationIx(
  authority: Address,
  digest: string
) {
  return instruction(
    "register_organization",
    [
      writable(await organizationPda(authority)),
      signer(authority, true),
      readonly(SYSTEM_ID),
    ],
    bytesFromHex(digest)
  );
}
export async function updateMetadataIx(
  org: OrganizationAccount,
  digest: string
) {
  return instruction(
    "update_organization_metadata",
    [writable(org.address), signer(org.authority)],
    bytesFromHex(digest)
  );
}
export async function nominateAuthorityIx(
  org: OrganizationAccount,
  next: Address
) {
  return instruction(
    "nominate_organization_authority",
    [writable(org.address), signer(org.authority)],
    new Uint8Array(encoder.encode(next))
  );
}
export async function acceptAuthorityIx(
  org: OrganizationAccount,
  next: Address
) {
  return instruction("accept_organization_authority", [
    writable(org.address),
    signer(next),
  ]);
}
export async function setVerifiedIx(
  org: OrganizationAccount,
  admin: Address,
  verified: boolean
) {
  return instruction(
    "set_organization_verified",
    [readonly(await configPda()), writable(org.address), signer(admin)],
    Uint8Array.of(verified ? 1 : 0)
  );
}
export async function setStatusIx(
  org: OrganizationAccount,
  admin: Address,
  status: Exclude<OrganizationStatus, "Pending">
) {
  const code = { Active: 1, Suspended: 2, Closed: 3 }[status];
  return instruction(
    "set_organization_status",
    [readonly(await configPda()), writable(org.address), signer(admin)],
    Uint8Array.of(code)
  );
}

export function decodeOrganization(
  key: Address,
  data: Uint8Array
): OrganizationAccount {
  if (data.length !== 156)
    throw new Error("Unexpected organization account size");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const pendingTag = data[72];
  if (pendingTag !== 0 && pendingTag !== 1)
    throw new Error("Invalid pending authority tag");
  const bodyOffset = pendingTag ? 105 : 73;
  const statusOffset = bodyOffset + 32;
  const verifiedOffset = statusOffset + 1;
  const verifiedDeliveryCountOffset = verifiedOffset + 1;
  const nextCampaignIdOffset = verifiedDeliveryCountOffset + 8;

  const status = (["Pending", "Active", "Suspended", "Closed"] as const)[
    data[statusOffset]
  ];
  if (!status || (data[verifiedOffset] !== 0 && data[verifiedOffset] !== 1))
    throw new Error("Invalid organization status");
  return {
    address: key,
    founder: decoder.decode(data.slice(8, 40)),
    authority: decoder.decode(data.slice(40, 72)),
    pendingAuthority: pendingTag ? decoder.decode(data.slice(73, 105)) : null,
    metadataDigest: hex(data.slice(bodyOffset, bodyOffset + 32)),
    status,
    verified: data[verifiedOffset] === 1,
    verifiedDeliveryCount: view.getBigUint64(verifiedDeliveryCountOffset, true),
    nextCampaignId: view.getBigUint64(nextCampaignIdOffset, true),
  };
}
async function assertOrganizationDiscriminator(raw: Uint8Array) {
  const expected = new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8.encode("account:Organization"))
  ).slice(0, 8);
  if (!expected.every((byte, index) => raw[index] === byte))
    throw new Error("Unexpected organization discriminator");
}
export async function rpcCall<T>(
  cluster: ClusterMoniker,
  method: string,
  params: unknown[]
): Promise<T> {
  const response = await fetch(getClusterUrl(cluster), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Solana RPC failed: ${response.status}`);
  const payload = await response.json();
  if (payload.error)
    throw new Error(payload.error.message || "Solana RPC error");
  return payload.result as T;
}
export async function fetchOrganization(
  cluster: ClusterMoniker,
  key: Address
): Promise<OrganizationAccount | null> {
  const result = await rpcCall<{
    value: { owner: string; data: [string, string] } | null;
  }>(cluster, "getAccountInfo", [
    key,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (!result.value) return null;
  if (result.value.owner !== PROGRAM_ID)
    throw new Error("Unexpected account owner");
  const raw = Uint8Array.from(atob(result.value.data[0]), (c) =>
    c.charCodeAt(0)
  );
  await assertOrganizationDiscriminator(raw);
  const organization = decodeOrganization(key, raw);
  if ((await organizationPda(organization.founder)) !== key)
    throw new Error("Organization PDA does not match founder");
  return organization;
}
export async function fetchAdmin(
  cluster: ClusterMoniker
): Promise<Address | null> {
  const result = await rpcCall<{
    value: { owner: string; data: [string, string] } | null;
  }>(cluster, "getAccountInfo", [
    await configPda(),
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (!result.value) return null;
  if (result.value.owner !== PROGRAM_ID)
    throw new Error("Unexpected config owner");
  const raw = Uint8Array.from(atob(result.value.data[0]), (c) =>
    c.charCodeAt(0)
  );
  if (raw.length !== 77) throw new Error("Unexpected config size");
  const expected = new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8.encode("account:GlobalConfig"))
  ).slice(0, 8);
  if (!expected.every((byte, index) => raw[index] === byte))
    throw new Error("Unexpected config discriminator");
  return decoder.decode(raw.slice(8, 40));
}
export async function sha256Hex(data: Uint8Array) {
  return hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)))
  );
}
