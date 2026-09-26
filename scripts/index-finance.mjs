import pg from "pg";
import { createHash } from "node:crypto";
import { getAddressDecoder } from "@solana/kit";

const program = "FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M";
const rpcUrl = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const decodeAddress = getAddressDecoder();
let id = 0;
const disc = (name) =>
  createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const eventNames = [
  "AllocationCreated",
  "AllocationCancelled",
  "DisbursementRecorded",
  "VerifierRegistered",
  "VerifierRevoked",
  "DeliveryVerified",
];
const eventDisc = new Map(
  eventNames.map((name) => [
    createHash("sha256")
      .update(`event:${name}`)
      .digest()
      .subarray(0, 8)
      .toString("hex"),
    name,
  ])
);
async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new Error(body.error?.message || `RPC HTTP ${response.status}`);
  return body.result;
}
async function setup() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS allocation_projection (address text PRIMARY KEY,campaign text NOT NULL,allocation_id text NOT NULL,recipient text NOT NULL,amount text NOT NULL,spent text NOT NULL,purpose_digest char(64) NOT NULL,status text NOT NULL,created_at_chain bigint NOT NULL,observed_slot bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS disbursement_projection (address text PRIMARY KEY,allocation text NOT NULL,campaign text NOT NULL,disbursement_id text NOT NULL,recipient text NOT NULL,amount text NOT NULL,description_digest char(64) NOT NULL,authority text NOT NULL,status text NOT NULL,created_at_chain bigint NOT NULL,observed_slot bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS finance_events (signature text NOT NULL,log_index integer NOT NULL,event_name text NOT NULL,payload_base64 text NOT NULL,slot bigint NOT NULL,PRIMARY KEY(signature,log_index)); CREATE TABLE IF NOT EXISTS verifier_projection(address text PRIMARY KEY,organization text NOT NULL,verifier text NOT NULL,active boolean NOT NULL,observed_slot bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS delivery_verification_projection(address text PRIMARY KEY,disbursement text NOT NULL,verification_id text NOT NULL,verifier text NOT NULL,evidence_digest char(64) NOT NULL,status text NOT NULL,verified_at_chain bigint,observed_slot bigint NOT NULL DEFAULT 0,signature text,updated_at timestamptz NOT NULL DEFAULT now());`
  );
}
const u64 = (b, o) => b.readBigUInt64LE(o).toString();
const i64 = (b, o) => b.readBigInt64LE(o).toString();
const key = (b, o) => decodeAddress.decode(b.subarray(o, o + 32));
async function syncAccounts() {
  const result = await rpc("getProgramAccounts", [
    program,
    { encoding: "base64", commitment: "confirmed", withContext: true },
  ]);
  const slot = result.context.slot;
  for (const item of result.value) {
    if (item.account.owner !== program) continue;
    const b = Buffer.from(item.account.data[0], "base64");
    if (b.length === 146 && b.subarray(0, 8).equals(disc("Allocation"))) {
      const status = ["Open", "Closed", "Cancelled"][b[136]];
      if (!status) continue;
      await pool.query(
        `INSERT INTO allocation_projection VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(address) DO UPDATE SET spent=EXCLUDED.spent,status=EXCLUDED.status,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE allocation_projection.observed_slot<=EXCLUDED.observed_slot`,
        [
          item.pubkey,
          key(b, 8),
          u64(b, 40),
          key(b, 48),
          u64(b, 80),
          u64(b, 88),
          b.subarray(96, 128).toString("hex"),
          status,
          i64(b, 128),
          slot,
        ]
      );
    }
    if (b.length === 202 && b.subarray(0, 8).equals(disc("Disbursement"))) {
      const status = ["Recorded", "Verified", "Disputed", "Rejected"][b[192]];
      if (!status) continue;
      await pool.query(
        `INSERT INTO disbursement_projection VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(address) DO UPDATE SET status=EXCLUDED.status,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE disbursement_projection.observed_slot<=EXCLUDED.observed_slot`,
        [
          item.pubkey,
          key(b, 8),
          key(b, 40),
          u64(b, 72),
          key(b, 80),
          u64(b, 112),
          b.subarray(120, 152).toString("hex"),
          key(b, 160),
          status,
          i64(b, 152),
          slot,
        ]
      );
    }
    if (b.length === 74 && b.subarray(0, 8).equals(disc("Verifier"))) {
      await pool.query(`INSERT INTO verifier_projection(address,organization,verifier,active,observed_slot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(address) DO UPDATE SET active=EXCLUDED.active,observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE verifier_projection.observed_slot<=EXCLUDED.observed_slot`, [item.pubkey,key(b,8),key(b,40),b[72]===1,slot]);
    }
    if (b.length === 123 && b.subarray(0, 8).equals(disc("DeliveryVerification"))) {
      const status=["Pending","Verified","Disputed","Rejected"][b[112]]; if (!status || status === "Pending") continue;
      await pool.query(`INSERT INTO delivery_verification_projection(address,disbursement,verification_id,verifier,evidence_digest,status,verified_at_chain,observed_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(address) DO UPDATE SET observed_slot=EXCLUDED.observed_slot,updated_at=now() WHERE delivery_verification_projection.observed_slot<=EXCLUDED.observed_slot`, [item.pubkey,key(b,8),u64(b,40),key(b,48),b.subarray(80,112).toString("hex"),status,b[113]===1?i64(b,114):null,slot]);
    }
  }
}
async function syncEvents() {
  const signatures = await rpc("getSignaturesForAddress", [
    program,
    { limit: 500, commitment: "confirmed" },
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
      const name = eventDisc.get(data.subarray(0, 8).toString("hex"));
      if (name)
        await pool.query(
          `INSERT INTO finance_events(signature,log_index,event_name,payload_base64,slot) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [entry.signature, index, name, match[1], tx.slot]
        );
    }
  }
}
await setup();
await syncAccounts();
await syncEvents();
const [
  {
    rows: [a],
  },
  {
    rows: [d],
  },
  {
    rows: [e],
  },
  {
    rows: [v],
  },
] = await Promise.all([
  pool.query("SELECT count(*)::int AS count FROM allocation_projection"),
  pool.query("SELECT count(*)::int AS count FROM disbursement_projection"),
  pool.query("SELECT count(*)::int AS count FROM finance_events"),
  pool.query("SELECT count(*)::int AS count FROM delivery_verification_projection"),
]);
console.log(
  `Indexed ${a.count} allocations, ${d.count} disbursements, ${v.count} delivery verifications, ${e.count} finance events`
);
await pool.end();
