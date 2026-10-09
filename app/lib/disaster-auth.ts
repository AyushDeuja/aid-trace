import { createPublicKey, verify } from "node:crypto";
import { getAddressEncoder, type Address } from "@solana/kit";
import { database } from "./organizations/db";
import { fetchAdmin, fetchOrganization } from "./organizations/chain";
import type { ClusterMoniker } from "./solana-client";

const prefix = Buffer.from("302a300506032b6570032100", "hex");
const addressEncoder = getAddressEncoder();

function challengeMessage(row: {
  action: string;
  candidate_id: string | null;
  nonce: string;
  expires_at: Date | string;
}) {
  return `AidTrace Task 9\nAction: ${row.action}\nCandidate: ${row.candidate_id || "none"}\nNonce: ${row.nonce}\nExpires: ${new Date(row.expires_at).toISOString()}`;
}

function verificationKey(wallet: string) {
  return createPublicKey({
    key: Buffer.concat([
      prefix,
      // Address decoding goes from bytes to base58. Wallet verification needs
      // the reverse conversion, so encode the base58 wallet address instead.
      Buffer.from(addressEncoder.encode(wallet as Address)),
    ]),
    format: "der",
    type: "spki",
  });
}
export async function issueChallenge(
  wallet: string,
  action: string,
  candidateId?: string
) {
  const nonce = crypto.randomUUID();
  const expiry = new Date(Date.now() + 5 * 60_000);
  await database().query(
    "INSERT INTO disaster_auth_challenges(nonce,wallet_address,action,candidate_id,expires_at) VALUES($1,$2,$3,$4,$5)",
    [nonce, wallet, action, candidateId || null, expiry]
  );
  return {
    nonce,
    message: challengeMessage({
      action,
      candidate_id: candidateId || null,
      nonce,
      expires_at: expiry,
    }),
  };
}
export async function requireAdmin(payload: {
  nonce: string;
  message: string;
  signature: string;
  wallet: string;
  action: string;
  candidateId?: string;
  cluster: ClusterMoniker;
}) {
  const row = (
    await database().query(
      "SELECT * FROM disaster_auth_challenges WHERE nonce=$1 FOR UPDATE",
      [payload.nonce]
    )
  ).rows[0];
  if (
    !row ||
    row.used_at ||
    row.expires_at < new Date() ||
    row.wallet_address !== payload.wallet ||
    row.action !== payload.action ||
    row.candidate_id !== (payload.candidateId || null)
  )
    throw new Error("Invalid or expired authorization challenge");
  const expected = await fetchAdmin(payload.cluster);
  if (expected !== payload.wallet)
    throw new Error("Connected wallet is not the GlobalConfig admin");
  if (payload.message !== challengeMessage(row))
    throw new Error(
      "Challenge message does not match the issued authorization"
    );
  const key = verificationKey(payload.wallet);
  if (
    !verify(
      null,
      Buffer.from(payload.message),
      key,
      Buffer.from(payload.signature, "base64")
    )
  )
    throw new Error("Invalid wallet signature");
  const consumed = await database().query(
    "UPDATE disaster_auth_challenges SET used_at=now() WHERE nonce=$1 AND used_at IS NULL RETURNING nonce",
    [payload.nonce]
  );
  if (!consumed.rows[0])
    throw new Error("Authorization challenge was already used");
}
export async function requireOrganizationAuthority(payload: {
  nonce: string;
  message: string;
  signature: string;
  wallet: string;
  action: string;
  candidateId?: string;
  cluster: ClusterMoniker;
  organization: string;
}) {
  const row = (
    await database().query(
      "SELECT * FROM disaster_auth_challenges WHERE nonce=$1 FOR UPDATE",
      [payload.nonce]
    )
  ).rows[0];
  if (
    !row ||
    row.used_at ||
    row.expires_at < new Date() ||
    row.wallet_address !== payload.wallet ||
    row.action !== payload.action ||
    row.candidate_id !== (payload.candidateId || null)
  )
    throw new Error("Invalid or expired authorization challenge");
  const organization = await fetchOrganization(
    payload.cluster,
    payload.organization as Address
  );
  if (!organization || organization.authority !== payload.wallet)
    throw new Error("Connected wallet is not the organization authority");
  if (payload.message !== challengeMessage(row))
    throw new Error(
      "Challenge message does not match the issued authorization"
    );
  const key = verificationKey(payload.wallet);
  if (
    !verify(
      null,
      Buffer.from(payload.message),
      key,
      Buffer.from(payload.signature, "base64")
    )
  )
    throw new Error("Invalid wallet signature");
  const consumed = await database().query(
    "UPDATE disaster_auth_challenges SET used_at=now() WHERE nonce=$1 AND used_at IS NULL RETURNING nonce",
    [payload.nonce]
  );
  if (!consumed.rows[0])
    throw new Error("Authorization challenge was already used");
}
