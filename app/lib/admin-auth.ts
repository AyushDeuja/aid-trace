import { createPublicKey, verify } from "node:crypto";
import { getAddressEncoder, type Address } from "@solana/kit";
import { database } from "./organizations/db";
import { fetchAdmin } from "./organizations/chain";
import type { ClusterMoniker } from "./solana-client";

const prefix = Buffer.from("302a300506032b6570032100", "hex");
const encoder = getAddressEncoder();
const message = (row: {
  action: string;
  resource_id: string | null;
  nonce: string;
  expires_at: Date | string;
}) =>
  `AidTrace Admin Review\nAction: ${row.action}\nResource: ${row.resource_id || "none"}\nNonce: ${row.nonce}\nExpires: ${new Date(row.expires_at).toISOString()}`;

export async function issueAdminChallenge(
  wallet: string,
  action: string,
  resourceId?: string
) {
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await database().query(
    "INSERT INTO admin_action_challenges(nonce,wallet_address,action,resource_id,expires_at) VALUES($1,$2,$3,$4,$5)",
    [nonce, wallet, action, resourceId || null, expiresAt]
  );
  return {
    nonce,
    message: message({
      action,
      resource_id: resourceId || null,
      nonce,
      expires_at: expiresAt,
    }),
  };
}

export async function requireAdminChallenge(payload: {
  wallet: string;
  action: string;
  resourceId?: string;
  nonce: string;
  message: string;
  signature: string;
  cluster: ClusterMoniker;
}) {
  const row = (
    await database().query(
      "SELECT * FROM admin_action_challenges WHERE nonce=$1",
      [payload.nonce]
    )
  ).rows[0];
  if (
    !row ||
    row.used_at ||
    row.expires_at < new Date() ||
    row.wallet_address !== payload.wallet ||
    row.action !== payload.action ||
    row.resource_id !== (payload.resourceId || null)
  )
    throw new Error("Invalid or expired admin authorization challenge");
  if ((await fetchAdmin(payload.cluster)) !== payload.wallet)
    throw new Error("Connected wallet is not the GlobalConfig admin");
  if (payload.message !== message(row))
    throw new Error("Challenge message does not match");
  const key = createPublicKey({
    key: Buffer.concat([
      prefix,
      Buffer.from(encoder.encode(payload.wallet as Address)),
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
  const used = await database().query(
    "UPDATE admin_action_challenges SET used_at=now() WHERE nonce=$1 AND used_at IS NULL RETURNING nonce",
    [payload.nonce]
  );
  if (!used.rows[0])
    throw new Error("Authorization challenge was already used");
}
