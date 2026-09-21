import { Pool } from "pg";

let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }));
}

export async function ensureOrganizationSchema() {
  await database().query(`
    CREATE TABLE IF NOT EXISTS organization_projection (
      address text PRIMARY KEY, founder text NOT NULL, authority text NOT NULL,
      pending_authority text, metadata_digest char(64) NOT NULL,
      metadata_uri text, status text NOT NULL, verified boolean NOT NULL,
      verified_delivery_count text NOT NULL, next_campaign_id text NOT NULL,
      observed_slot bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
