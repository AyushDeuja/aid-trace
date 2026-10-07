import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import { PROGRAM_ID, rpcCall } from "./organizations/chain";
import type { ClusterMoniker } from "./solana-client";

const encoder = getAddressEncoder();
const decoder = getAddressDecoder();
const utf8 = new TextEncoder();
const riskBands = ["low", "watch", "review_recommended", "high_priority_review"] as const;
const resolutions = ["open", "resolved", "dismissed"] as const;

export type CanonicalTrustScore = {
  address: Address;
  subject: Address;
  score: number;
  riskBand: (typeof riskBands)[number];
  modelVersionDigest: string;
  reasonDigest: string;
  checkpointSlot: string;
  evaluatedAt: string;
  sequence: string;
  flagged: boolean;
};
export type CanonicalFraudFlag = {
  address: Address;
  subject: Address;
  score: number;
  reasonDigest: string;
  resolution: (typeof resolutions)[number];
};

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const base64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function accountDiscriminator(name: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(`account:${name}`))).slice(0, 8);
}
async function assertAccount(raw: Uint8Array, name: string, size: number) {
  if (raw.length !== size) throw new Error(`Unexpected ${name} account size`);
  const expected = await accountDiscriminator(name);
  if (!expected.every((byte, index) => raw[index] === byte)) throw new Error(`Unexpected ${name} discriminator`);
}
function u64(raw: Uint8Array, offset: number) { return new DataView(raw.buffer, raw.byteOffset + offset, 8).getBigUint64(0, true).toString(); }
function i64(raw: Uint8Array, offset: number) { return new DataView(raw.buffer, raw.byteOffset + offset, 8).getBigInt64(0, true).toString(); }

export async function trustScorePda(subject: Address) {
  return (await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ["trust", encoder.encode(subject)] }))[0];
}
export async function fraudFlagPda(subject: Address) {
  return (await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds: ["fraud_flag", encoder.encode(subject)] }))[0];
}
async function fetchRaw(cluster: ClusterMoniker, key: Address) {
  const result = await rpcCall<{ value: { owner: string; data: [string, string] } | null }>(cluster, "getAccountInfo", [key, { encoding: "base64", commitment: "finalized" }]);
  if (!result.value) return null;
  if (result.value.owner !== PROGRAM_ID) throw new Error("Unexpected trust account owner");
  return base64(result.value.data[0]);
}
export async function fetchCanonicalTrustScore(cluster: ClusterMoniker, subject: Address): Promise<CanonicalTrustScore | null> {
  const key = await trustScorePda(subject);
  const raw = await fetchRaw(cluster, key);
  if (!raw) return null;
  await assertAccount(raw, "TrustScore", 132);
  const decodedSubject = decoder.decode(raw.slice(8, 40));
  if (decodedSubject !== subject || (await trustScorePda(decodedSubject)) !== key) throw new Error("TrustScore PDA subject mismatch");
  const band = riskBands[raw[41]];
  if (!band) throw new Error("Invalid TrustScore risk band");
  return { address: key, subject: decodedSubject, score: raw[40], riskBand: band, modelVersionDigest: hex(raw.slice(42, 74)), reasonDigest: hex(raw.slice(74, 106)), checkpointSlot: u64(raw, 106), evaluatedAt: i64(raw, 114), sequence: u64(raw, 122), flagged: raw[130] === 1 };
}
export async function fetchCanonicalFraudFlag(cluster: ClusterMoniker, subject: Address): Promise<CanonicalFraudFlag | null> {
  const key = await fraudFlagPda(subject);
  const raw = await fetchRaw(cluster, key);
  if (!raw) return null;
  await assertAccount(raw, "FraudFlag", 84);
  const decodedSubject = decoder.decode(raw.slice(8, 40));
  if (decodedSubject !== subject || (await fraudFlagPda(decodedSubject)) !== key) throw new Error("FraudFlag PDA subject mismatch");
  const resolution = resolutions[raw[82]];
  if (!resolution) throw new Error("Invalid FraudFlag resolution");
  return { address: key, subject: decodedSubject, score: raw[41], reasonDigest: hex(raw.slice(42, 74)), resolution };
}

export function isTrustSubject(value: string): value is Address {
  try { address(value); return true; } catch { return false; }
}
