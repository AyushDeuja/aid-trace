import { createHash, randomUUID } from "node:crypto";
import { database } from "./organizations/db";

const GDACS =
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ,TC,FL,VO,DR,WF&alertlevel=orange,red";
const USGS =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/5.0_day.geojson";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
type Normalized = {
  provider: "gdacs" | "usgs";
  externalId: string;
  sourceUrl: string;
  occurredAt: string | null;
  disasterType: string;
  title: string;
  location: string;
  payload: unknown;
};

async function fetchJson(url: string) {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++)
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "AidTrace-disaster-ingestor/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`source returned ${response.status}`);
      return await response.json();
    } catch (error) {
      failure = error;
    }
  throw failure;
}
function usgs(payload: any): Normalized[] {
  return Array.isArray(payload?.features)
    ? payload.features
        .filter((f: any) => Number(f?.properties?.mag) >= 5)
        .map((f: any) => ({
          provider: "usgs",
          externalId: String(f.id),
          sourceUrl: String(f.properties.url || USGS),
          occurredAt: f.properties.time
            ? new Date(f.properties.time).toISOString()
            : null,
          disasterType: "Earthquake",
          title: clean(f.properties.title, 240) || "USGS earthquake",
          location: clean(f.properties.place, 240) || "Location unavailable",
          payload: f,
        }))
    : [];
}
function gdacs(payload: any): Normalized[] {
  const rows = payload?.features || payload?.events || [];
  return Array.isArray(rows)
    ? rows
        .filter((f: any) =>
          ["orange", "red"].includes(
            String(
              f?.properties?.alertlevel || f?.alertlevel || ""
            ).toLowerCase()
          )
        )
        .map((f: any) => {
          const p = f.properties || f;
          const id = String(p.eventid || p.id || "");
          return {
        provider: "gdacs" as const,
            externalId: id,
            sourceUrl: String(p.url || GDACS),
            occurredAt: p.fromdate || p.eventdate || null,
            disasterType: clean(p.eventtype || p.type, 80) || "Disaster",
            title: clean(p.name || p.title, 240) || "GDACS alert",
            location:
              clean(p.country || p.location, 240) || "Location unavailable",
            payload: f,
          };
        })
        .filter((f: Normalized) => Boolean(f.externalId))
    : [];
}
export async function ingestDisasters() {
  const db = database();
  const sources: ["gdacs" | "usgs", string, (p: any) => Normalized[]][] = [
    ["gdacs", GDACS, gdacs],
    ["usgs", USGS, usgs],
  ];
  const result: any[] = [];
  for (const [provider, url, parser] of sources) {
    const run = randomUUID();
    await db.query(
      "INSERT INTO disaster_ingestion_runs(id,provider,status) VALUES($1,$2,'running')",
      [run, provider]
    );
    try {
      const events = parser(await fetchJson(url));
      for (const event of events) {
        const observation = randomUUID(),
          digest = hash(event.payload);
        const inserted = await db.query(
          "INSERT INTO disaster_source_observations(id,provider,external_id,source_url,occurred_at,payload,payload_digest) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(provider,external_id,payload_digest) DO NOTHING RETURNING id",
          [
            observation,
            event.provider,
            event.externalId,
            event.sourceUrl,
            event.occurredAt,
            event.payload,
            digest,
          ]
        );
        const candidate = await db.query(
          "INSERT INTO disaster_candidates(id,provider,external_id,disaster_type,title,location,occurred_at,normalized) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(provider,external_id) DO UPDATE SET title=EXCLUDED.title,location=EXCLUDED.location,occurred_at=EXCLUDED.occurred_at,normalized=EXCLUDED.normalized,updated_at=now() RETURNING id",
          [
            randomUUID(),
            event.provider,
            event.externalId,
            event.disasterType,
            event.title,
            event.location,
            event.occurredAt,
            event,
          ]
        );
        if (inserted.rows[0])
          await db.query(
            "INSERT INTO disaster_candidate_observations(candidate_id,observation_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [candidate.rows[0].id, inserted.rows[0].id]
          );
      }
      await db.query(
        "UPDATE disaster_ingestion_runs SET status='succeeded',finished_at=now(),items_seen=$2,items_eligible=$2 WHERE id=$1",
        [run, events.length]
      );
      result.push({ provider, items: events.length });
    } catch (error) {
      await db.query(
        "UPDATE disaster_ingestion_runs SET status='failed',finished_at=now(),error_message=$2 WHERE id=$1",
        [
          run,
          error instanceof Error
            ? error.message.slice(0, 500)
            : "ingestion failed",
        ]
      );
      result.push({ provider, error: "failed" });
    }
  }
  return result;
}
