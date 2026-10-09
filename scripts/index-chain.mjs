import { createHash } from "node:crypto";
import pg from "pg";
import { getAddressDecoder } from "@solana/kit";

const program = "8tcYj5qT3GAwhhHmK8UgHtyCZq7MgD8nCYGhC7rwEW5r";
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const cluster =
  process.env.AIDTRACE_CLUSTER ||
  (rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1")
    ? "localnet"
    : "devnet");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const address = getAddressDecoder();
const decoder = new TextDecoder();
let requestId = 0,
  lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const disc = (prefix, name) =>
  createHash("sha256").update(`${prefix}:${name}`).digest().subarray(0, 8);
const accountDiscs = Object.fromEntries(
  [
    "Organization",
    "Campaign",
    "Donation",
    "Allocation",
    "Disbursement",
    "Verifier",
    "DeliveryVerification",
  ].map((name) => [name, disc("account", name)])
);
const eventNames = [
  "OrganizationRegistered",
  "OrganizationMetadataUpdated",
  "OrganizationAuthorityNominated",
  "OrganizationAuthorityTransferred",
  "OrganizationVerificationChanged",
  "OrganizationStatusChanged",
  "CampaignCreated",
  "CampaignStatusChanged",
  "CampaignUpdated",
  "DonationReceived",
  "AllocationCreated",
  "AllocationCancelled",
  "DisbursementRecorded",
  "VerifierRegistered",
  "VerifierRevoked",
  "DeliveryVerified",
];
const eventDiscs = new Map(
  eventNames.map((name) => [disc("event", name).toString("hex"), name])
);
const hex = (bytes) => bytes.toString("hex");
const key = (raw, offset) => address.decode(raw.subarray(offset, offset + 32));
const u64 = (raw, offset) => raw.readBigUInt64LE(offset).toString();
const i64 = (raw, offset) => raw.readBigInt64LE(offset).toString();
async function rpc(method, params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const pause = Math.max(0, 300 - (Date.now() - lastRequestAt));
    if (pause) await sleep(pause);
    lastRequestAt = Date.now();
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    });
    const body = await response.json();
    const message = body.error?.message || `RPC HTTP ${response.status}`;
    if (response.ok && !body.error) return body.result;
    if (response.status !== 429 && !/too many requests/i.test(message))
      throw new Error(message);
    const retry = response.headers.get("retry-after");
    await sleep(retry ? Number(retry) * 1000 : 1000 * 2 ** attempt);
  }
  throw new Error("RPC rate limit persisted; retry this on-demand index later");
}
function matches(raw, name) {
  return raw.length >= 8 && raw.subarray(0, 8).equals(accountDiscs[name]);
}
function decodeAccount(publicKey, raw) {
  if (matches(raw, "Organization") && raw.length === 156) {
    const pending = raw[72],
      body = pending ? 105 : 73,
      status = ["Pending", "Active", "Suspended", "Closed"][raw[body + 32]];
    if (pending > 1 || !status || raw[body + 33] > 1) return null;
    return {
      kind: "organization",
      address: publicKey,
      metadataDigest: hex(raw.subarray(body, body + 32)),
      payload: {
        founder: key(raw, 8),
        authority: key(raw, 40),
        pendingAuthority: pending ? key(raw, 73) : null,
        status,
        verified: raw[body + 33] === 1,
        verifiedDeliveryCount: u64(raw, body + 34),
        nextCampaignId: u64(raw, body + 42),
      },
    };
  }
  if (matches(raw, "Campaign")) {
    let p = 8;
    const org = key(raw, p);
    p += 32;
    const authority = key(raw, p);
    p += 32;
    const campaignId = u64(raw, p);
    p += 8;
    const targetAmount = u64(raw, p);
    p += 8;
    const amountRaised = u64(raw, p);
    p += 8;
    const amountDisbursed = u64(raw, p);
    p += 8;
    const amountReserved = u64(raw, p);
    p += 8;
    const status = ["Draft", "PendingReview", "Active", "Paused", "Closed"][
      raw[p++]
    ];
    const createdAt = i64(raw, p);
    p += 8;
    const hasEnd = raw[p++];
    if (!status || hasEnd > 1) return null;
    const endsAt = hasEnd ? i64(raw, p) : null;
    if (hasEnd) p += 8;
    const metadataDigest = hex(raw.subarray(p, p + 32));
    p += 32;
    const length = raw.readUInt32LE(p);
    p += 4;
    if (length > 500 || p + length + 17 > raw.length) return null;
    const metadataUri = decoder.decode(raw.subarray(p, p + length));
    p += length;
    return {
      kind: "campaign",
      address: publicKey,
      organization: org,
      metadataDigest,
      metadataUri,
      payload: {
        authority,
        campaignId,
        targetAmount,
        amountRaised,
        amountDisbursed,
        amountReserved,
        status,
        createdAt,
        endsAt,
        nextDonationId: u64(raw, p),
        nextAllocationId: u64(raw, p + 8),
      },
    };
  }
  if (matches(raw, "Donation") && raw.length === 98)
    return {
      kind: "donation",
      address: publicKey,
      campaign: key(raw, 8),
      payload: {
        donor: key(raw, 40),
        donationId: u64(raw, 72),
        amount: u64(raw, 80),
        source: "Standard",
        occurredAt: i64(raw, 89),
      },
    };
  if (matches(raw, "Allocation") && raw.length === 146)
    return {
      kind: "allocation",
      address: publicKey,
      campaign: key(raw, 8),
      metadataDigest: hex(raw.subarray(96, 128)),
      payload: {
        allocationId: u64(raw, 40),
        recipient: key(raw, 48),
        amount: u64(raw, 80),
        spent: u64(raw, 88),
        createdAt: i64(raw, 128),
        status: ["Open", "Closed", "Cancelled"][raw[136]],
        nextDisbursementId: u64(raw, 137),
      },
    };
  if (matches(raw, "Disbursement") && raw.length === 202)
    return {
      kind: "disbursement",
      address: publicKey,
      campaign: key(raw, 40),
      metadataDigest: hex(raw.subarray(120, 152)),
      payload: {
        allocation: key(raw, 8),
        disbursementId: u64(raw, 72),
        recipient: key(raw, 80),
        amount: u64(raw, 112),
        createdAt: i64(raw, 152),
        authority: key(raw, 160),
        status: ["Recorded", "Verified", "Disputed", "Rejected"][raw[192]],
        nextDeliveryVerificationId: u64(raw, 193),
      },
    };
  if (matches(raw, "Verifier") && raw.length === 74)
    return {
      kind: "verifier",
      address: publicKey,
      organization: key(raw, 8),
      payload: { verifier: key(raw, 40), active: raw[72] === 1 },
    };
  if (matches(raw, "DeliveryVerification") && raw.length === 123)
    return {
      kind: "deliveryVerification",
      address: publicKey,
      payload: {
        disbursement: key(raw, 8),
        verificationId: u64(raw, 40),
        verifier: key(raw, 48),
        evidenceDigest: hex(raw.subarray(80, 112)),
        status: ["Pending", "Verified", "Disputed", "Rejected"][raw[112]],
        verifiedAt: raw[113] === 1 ? i64(raw, 114) : null,
      },
    };
  return null;
}
async function upsert(record, slot) {
  const json = JSON.stringify(record.payload);
  const base = [cluster, program, record.address, json, slot];
  if (record.kind === "organization")
    return pool.query(
      `INSERT INTO chain_organization_projection(cluster,program_id,address,metadata_digest,payload,observed_slot) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(cluster,program_id,address) DO UPDATE SET metadata_digest=EXCLUDED.metadata_digest,payload=EXCLUDED.payload,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE chain_organization_projection.observed_slot<=EXCLUDED.observed_slot`,
      [...base.slice(0, 3), record.metadataDigest, json, slot]
    );
  if (record.kind === "campaign")
    return pool.query(
      `INSERT INTO chain_campaign_projection(cluster,program_id,address,organization,metadata_digest,metadata_uri,payload,observed_slot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(cluster,program_id,address) DO UPDATE SET metadata_digest=EXCLUDED.metadata_digest,metadata_uri=EXCLUDED.metadata_uri,payload=EXCLUDED.payload,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE chain_campaign_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        cluster,
        program,
        record.address,
        record.organization,
        record.metadataDigest,
        record.metadataUri,
        json,
        slot,
      ]
    );
  if (record.kind === "donation")
    return pool.query(
      `INSERT INTO chain_donation_projection(cluster,program_id,address,campaign,payload,observed_slot) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(cluster,program_id,address) DO UPDATE SET payload=EXCLUDED.payload,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE chain_donation_projection.observed_slot<=EXCLUDED.observed_slot`,
      [cluster, program, record.address, record.campaign, json, slot]
    );
  if (record.kind === "allocation")
    return pool.query(
      `INSERT INTO chain_allocation_projection(cluster,program_id,address,campaign,purpose_digest,payload,observed_slot) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(cluster,program_id,address) DO UPDATE SET payload=EXCLUDED.payload,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE chain_allocation_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        cluster,
        program,
        record.address,
        record.campaign,
        record.metadataDigest,
        json,
        slot,
      ]
    );
  if (record.kind === "disbursement")
    return pool.query(
      `INSERT INTO chain_disbursement_projection(cluster,program_id,address,campaign,description_digest,payload,observed_slot) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(cluster,program_id,address) DO UPDATE SET payload=EXCLUDED.payload,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE chain_disbursement_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        cluster,
        program,
        record.address,
        record.campaign,
        record.metadataDigest,
        json,
        slot,
      ]
    );
  if (record.kind === "verifier")
    return pool.query(
      `INSERT INTO chain_verifier_projection(cluster,program_id,address,organization,verifier,active,payload,observed_slot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(cluster,program_id,address) DO UPDATE SET active=EXCLUDED.active,payload=EXCLUDED.payload,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE chain_verifier_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        cluster,
        program,
        record.address,
        record.organization,
        record.payload.verifier,
        record.payload.active,
        json,
        slot,
      ]
    );
  return pool.query(
    `INSERT INTO chain_delivery_verification_projection(cluster,program_id,address,disbursement,evidence_digest,payload,observed_slot) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(cluster,program_id,address) DO UPDATE SET payload=EXCLUDED.payload,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE chain_delivery_verification_projection.observed_slot<=EXCLUDED.observed_slot`,
    [
      cluster,
      program,
      record.address,
      record.payload.disbursement,
      record.payload.evidenceDigest,
      json,
      slot,
    ]
  );
}
async function mirrorLegacy(record, slot) {
  const p = record.payload;
  if (record.kind === "organization")
    return pool.query(
      `INSERT INTO organization_projection(address,founder,authority,pending_authority,metadata_digest,status,verified,verified_delivery_count,next_campaign_id,observed_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(address) DO UPDATE SET authority=EXCLUDED.authority,pending_authority=EXCLUDED.pending_authority,metadata_digest=EXCLUDED.metadata_digest,status=EXCLUDED.status,verified=EXCLUDED.verified,verified_delivery_count=EXCLUDED.verified_delivery_count,next_campaign_id=EXCLUDED.next_campaign_id,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE organization_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        record.address,
        p.founder,
        p.authority,
        p.pendingAuthority,
        record.metadataDigest,
        p.status,
        p.verified,
        p.verifiedDeliveryCount,
        p.nextCampaignId,
        slot,
      ]
    );
  if (record.kind === "allocation")
    return pool.query(
      `INSERT INTO allocation_projection(address,campaign,allocation_id,recipient,amount,spent,purpose_digest,status,created_at_chain,observed_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(address) DO UPDATE SET spent=EXCLUDED.spent,status=EXCLUDED.status,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE allocation_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        record.address,
        record.campaign,
        p.allocationId,
        p.recipient,
        p.amount,
        p.spent,
        record.metadataDigest,
        p.status,
        p.createdAt,
        slot,
      ]
    );
  if (record.kind === "disbursement")
    return pool.query(
      `INSERT INTO disbursement_projection(address,allocation,campaign,disbursement_id,recipient,amount,description_digest,authority,status,created_at_chain,observed_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(address) DO UPDATE SET status=EXCLUDED.status,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE disbursement_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        record.address,
        p.allocation,
        record.campaign,
        p.disbursementId,
        p.recipient,
        p.amount,
        record.metadataDigest,
        p.authority,
        p.status,
        p.createdAt,
        slot,
      ]
    );
  if (record.kind === "verifier")
    return pool.query(
      `INSERT INTO verifier_projection(address,organization,verifier,active,observed_slot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(address) DO UPDATE SET active=EXCLUDED.active,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE verifier_projection.observed_slot<=EXCLUDED.observed_slot`,
      [record.address, record.organization, p.verifier, p.active, slot]
    );
  if (record.kind === "deliveryVerification")
    return pool.query(
      `INSERT INTO delivery_verification_projection(address,disbursement,verification_id,verifier,evidence_digest,status,verified_at_chain,observed_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(address) DO UPDATE SET observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE delivery_verification_projection.observed_slot<=EXCLUDED.observed_slot`,
      [
        record.address,
        p.disbursement,
        p.verificationId,
        p.verifier,
        p.evidenceDigest,
        p.status,
        p.verifiedAt,
        slot,
      ]
    );
}
async function reconcileAccounts() {
  const result = await rpc("getProgramAccounts", [
    program,
    { encoding: "base64", commitment: "finalized", withContext: true },
  ]);
  let count = 0;
  for (const item of result.value) {
    if (item.account.owner !== program) continue;
    const record = decodeAccount(
      item.pubkey,
      Buffer.from(item.account.data[0], "base64")
    );
    if (record) {
      await upsert(record, result.context.slot);
      await mirrorLegacy(record, result.context.slot);
      count++;
    }
  }
  return count;
}
async function indexEvents() {
  const checkpoint = (
    await pool.query(
      "SELECT last_signature,last_slot FROM chain_index_checkpoints WHERE cluster=$1 AND program_id=$2",
      [cluster, program]
    )
  ).rows[0];
  let before,
    pages = 0,
    finished = false,
    newest;
  const entries = [];
  const maxPages = Number(process.env.CHAIN_MAX_PAGES || 1000);
  while (!finished && pages++ < maxPages) {
    const page = await rpc("getSignaturesForAddress", [
      program,
      { limit: 1000, before, commitment: "finalized" },
    ]);
    if (!page.length) {
      finished = true;
      break;
    }
    if (!newest) newest = page[0];
    const marker = checkpoint?.last_signature
      ? page.findIndex((entry) => entry.signature === checkpoint.last_signature)
      : -1;
    if (marker >= 0) {
      entries.push(...page.slice(0, marker));
      finished = true;
      break;
    }
    entries.push(...page);
    before = page.at(-1).signature;
    if (page.length < 1000) finished = true;
  }
  for (const entry of entries.reverse()) {
    if (entry.err) continue;
    const tx = await rpc("getTransaction", [
      entry.signature,
      {
        encoding: "json",
        maxSupportedTransactionVersion: 1,
        commitment: "finalized",
      },
    ]);
    for (const [eventIndex, log] of (tx?.meta?.logMessages || []).entries()) {
      const match = log.match(/^Program data: ([A-Za-z0-9+/=]+)$/);
      if (!match) continue;
      const data = Buffer.from(match[1], "base64");
      const eventName = eventDiscs.get(hex(data.subarray(0, 8)));
      if (eventName)
        await pool.query(
          `INSERT INTO chain_events(cluster,program_id,signature,event_index,event_name,payload_base64,slot,block_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [
            cluster,
            program,
            entry.signature,
            eventIndex,
            eventName,
            match[1],
            tx.slot,
            tx.blockTime,
          ]
        );
    }
  }
  if (finished && newest)
    await pool.query(
      `INSERT INTO chain_index_checkpoints(cluster,program_id,last_signature,last_slot) VALUES($1,$2,$3,$4) ON CONFLICT(cluster,program_id) DO UPDATE SET last_signature=EXCLUDED.last_signature,last_slot=EXCLUDED.last_slot,indexed_at=now()`,
      [cluster, program, newest.signature, newest.slot]
    );
  return entries.length;
}
const accounts = await reconcileAccounts();
const transactions = await indexEvents();
console.log(
  `Indexed ${accounts} finalized account projections and ${transactions} new transaction candidates for ${cluster}`
);
await pool.end();
