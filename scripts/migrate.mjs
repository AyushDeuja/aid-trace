import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const migrationsDir = path.join(process.cwd(), "db", "migrations");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  const id = `${file}:${createHash("sha256").update(sql).digest("hex")}`;
  const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE id=$1", [id]);
  if (existing.rowCount) continue;
  const sameFile = await pool.query("SELECT id FROM schema_migrations WHERE id LIKE $1", [`${file}:%`]);
  if (sameFile.rowCount) throw new Error(`Migration ${file} was modified after being applied`);
  const client = await pool.connect();
  try { await client.query("BEGIN"); await client.query(sql); await client.query("INSERT INTO schema_migrations(id) VALUES($1)", [id]); await client.query("COMMIT"); console.log(`Applied ${file}`); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
await pool.end();
