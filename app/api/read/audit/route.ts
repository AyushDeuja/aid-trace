import { NextResponse } from "next/server";
import { database } from "../../../lib/organizations/db";

const programId = "8tcYj5qT3GAwhhHmK8UgHtyCZq7MgD8nCYGhC7rwEW5r";
const cluster = (value: string | null) =>
  value === "localnet" ? "localnet" : "devnet";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = cluster(url.searchParams.get("cluster"));
  const requested = Number(url.searchParams.get("limit") || "100");
  const limit = Number.isSafeInteger(requested)
    ? Math.min(Math.max(requested, 1), 500)
    : 100;
  const [events, checkpoint] = await Promise.all([
    database().query(
      "SELECT signature,event_index,event_name,payload_base64,slot,block_time,indexed_at FROM chain_events WHERE cluster=$1 AND program_id=$2 ORDER BY slot DESC,event_index ASC LIMIT $3",
      [network, programId, limit]
    ),
    database().query(
      "SELECT last_signature,last_slot,indexed_at FROM chain_index_checkpoints WHERE cluster=$1 AND program_id=$2",
      [network, programId]
    ),
  ]);
  return NextResponse.json({
    indexed: true,
    canonical: false,
    cluster: network,
    checkpoint: checkpoint.rows[0] || null,
    events: events.rows,
  });
}
