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
  await database().query("SELECT 1 FROM schema_migrations LIMIT 1");
}
