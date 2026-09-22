import pg from "pg";
import { createHash } from "node:crypto";
import { getAddressDecoder } from "@solana/kit";

const program = "FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M";
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const decodeAddress = getAddressDecoder();
const discriminator = createHash("sha256")
  .update("account:Organization")
  .digest()
  .subarray(0, 8);
const eventNames = [
  "OrganizationRegistered",
  "OrganizationMetadataUpdated",
  "OrganizationAuthorityNominated",
  "OrganizationAuthorityTransferred",
  "OrganizationVerificationChanged",
  "OrganizationStatusChanged",
];
const eventDiscriminators = new Map(
  eventNames.map((name) => [
    createHash("sha256")
      .update(`event:${name}`)
      .digest()
      .subarray(0, 8)
      .toString("hex"),
    name,
  ])
);
let requestId = 0;
async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}
async function setup() {
  await pool.query(`CREATE TABLE IF NOT EXISTS organization_projection (
    address text PRIMARY KEY, founder text NOT NULL, authority text NOT NULL,
    pending_authority text, metadata_digest char(64) NOT NULL, metadata_uri text,
    status text NOT NULL, verified boolean NOT NULL, verified_delivery_count text NOT NULL,
    next_campaign_id text NOT NULL, observed_slot bigint NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS organization_events (
    signature text NOT NULL, log_index integer NOT NULL, event_name text NOT NULL,
    payload_base64 text NOT NULL, slot bigint NOT NULL,
    PRIMARY KEY (signature, log_index))`);
}
async function syncAccounts() {
  const result = await rpc("getProgramAccounts", [
    program,
    {
      encoding: "base64",
      commitment: "confirmed",
      withContext: true,
      filters: [{ dataSize: 156 }],
    },
  ]);
  const slot = result.context.slot;
  for (const item of result.value) {
    if (item.account.owner !== program) continue;
    const data = Buffer.from(item.account.data[0], "base64");
    if (data.length !== 156 || !data.subarray(0, 8).equals(discriminator))
      continue;
    const founder = decodeAddress.decode(data.subarray(8, 40));
    const authority = decodeAddress.decode(data.subarray(40, 72));
    if (data[72] > 1) continue;
    const pending = data[72]
      ? decodeAddress.decode(data.subarray(73, 105))
      : null;
    const bodyOffset = data[72] ? 105 : 73;
    const statusOffset = bodyOffset + 32;
    const verifiedOffset = statusOffset + 1;
    const verifiedDeliveryCountOffset = verifiedOffset + 1;
    const nextCampaignIdOffset = verifiedDeliveryCountOffset + 8;
    if (data[statusOffset] > 3 || data[verifiedOffset] > 1) continue;
    const status = ["Pending", "Active", "Suspended", "Closed"][
      data[statusOffset]
    ];
    await pool.query(
      `INSERT INTO organization_projection
      (address, founder, authority, pending_authority, metadata_digest, status, verified, verified_delivery_count, next_campaign_id, observed_slot)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (address) DO UPDATE SET authority=EXCLUDED.authority,
      pending_authority=EXCLUDED.pending_authority, metadata_digest=EXCLUDED.metadata_digest,
      metadata_uri=CASE WHEN organization_projection.metadata_digest = EXCLUDED.metadata_digest THEN organization_projection.metadata_uri ELSE NULL END,
      status=EXCLUDED.status, verified=EXCLUDED.verified,
      verified_delivery_count=EXCLUDED.verified_delivery_count, next_campaign_id=EXCLUDED.next_campaign_id,
      observed_slot=EXCLUDED.observed_slot, updated_at=now()
      WHERE organization_projection.observed_slot <= EXCLUDED.observed_slot`,
      [
        item.pubkey,
        founder,
        authority,
        pending,
        data.subarray(bodyOffset, bodyOffset + 32).toString("hex"),
        status,
        data[verifiedOffset] === 1,
        data.readBigUInt64LE(verifiedDeliveryCountOffset).toString(),
        data.readBigUInt64LE(nextCampaignIdOffset).toString(),
        slot,
      ]
    );
  }
  return result.value.length;
}
async function syncEvents() {
  const signatures = await rpc("getSignaturesForAddress", [
    program,
    { limit: 100, commitment: "confirmed" },
  ]);
  for (const entry of signatures.reverse()) {
    if (entry.err) continue;
    const tx = await rpc("getTransaction", [
      entry.signature,
      {
        encoding: "json",
        maxSupportedTransactionVersion: 1,
        commitment: "confirmed",
      },
    ]);
    for (const [index, log] of (tx?.meta?.logMessages || []).entries()) {
      const match = log.match(/^Program data: ([A-Za-z0-9+/=]+)$/);
      if (!match) continue;
      const data = Buffer.from(match[1], "base64");
      const name = eventDiscriminators.get(data.subarray(0, 8).toString("hex"));
      if (!name) continue;
      await pool.query(
        `INSERT INTO organization_events (signature, log_index, event_name, payload_base64, slot)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [entry.signature, index, name, match[1], tx.slot]
      );
    }
  }
}
await setup();
const count = await syncAccounts();
await syncEvents();
console.log(`Indexed ${count} organization accounts`);
await pool.end();
