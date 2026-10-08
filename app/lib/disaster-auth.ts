import { createPublicKey, verify } from "node:crypto";
import { getAddressDecoder } from "@solana/kit";
import { database } from "./organizations/db";
import { fetchAdmin, fetchOrganization } from "./organizations/chain";
import type { ClusterMoniker } from "./solana-client";

const prefix = Buffer.from("302a300506032b6570032100", "hex");
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
    message: `AidTrace Task 9\nAction: ${action}\nCandidate: ${candidateId || "none"}\nNonce: ${nonce}\nExpires: ${expiry.toISOString()}`,
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
  const key = createPublicKey({
    key: Buffer.concat([
      prefix,
      Buffer.from(getAddressDecoder().decode(payload.wallet as any)),
    ]),
    format: "der",
    type: "spki",
  });
  if (
    !verify(
      null,
      Buffer.from(payload.message),
      key,
      Buffer.from(payload.signature, "base64")
    )
  )
    throw new Error("Invalid wallet signature");
  await database().query(
    "UPDATE disaster_auth_challenges SET used_at=now() WHERE nonce=$1",
    [payload.nonce]
  );
}
export async function requireOrganizationAuthority(payload: {
  nonce: string;
  message: string;
  signature: string;
  wallet: string;
  action: string;
  candidateId: string;
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
    row.candidate_id !== payload.candidateId
  )
    throw new Error("Invalid or expired authorization challenge");
  const organization = await fetchOrganization(
    payload.cluster,
    payload.organization as any
  );
  if (!organization || organization.authority !== payload.wallet)
    throw new Error("Connected wallet is not the organization authority");
  const key = createPublicKey({
    key: Buffer.concat([
      prefix,
      Buffer.from(getAddressDecoder().decode(payload.wallet as any)),
    ]),
    format: "der",
    type: "spki",
  });
  if (
    !verify(
      null,
      Buffer.from(payload.message),
      key,
      Buffer.from(payload.signature, "base64")
    )
  )
    throw new Error("Invalid wallet signature");
  await database().query(
    "UPDATE disaster_auth_challenges SET used_at=now() WHERE nonce=$1",
    [payload.nonce]
  );
}
