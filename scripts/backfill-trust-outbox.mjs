import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(`
    INSERT INTO trust_write_jobs (
      id, evaluation_id, cluster, program_id, subject_address, expected_sequence
    )
    SELECT gen_random_uuid(), e.id, e.cluster, e.program_id, e.subject_address, NULL
    FROM fraud_evaluations e
    WHERE NOT EXISTS (
      SELECT 1 FROM trust_write_jobs j WHERE j.evaluation_id = e.id
    )
    RETURNING id`);
  console.info("trust outbox backfill complete", { inserted: result.rowCount });
} finally {
  await pool.end();
}
