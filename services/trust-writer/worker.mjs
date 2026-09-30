import { spawn } from "node:child_process";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.TRUST_WRITER_EXECUTOR) throw new Error("TRUST_WRITER_EXECUTOR is required; do not use an admin or treasury key");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const invoke = (job) => new Promise((resolve, reject) => {
  const child = spawn(process.env.TRUST_WRITER_EXECUTOR, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "", errors = "";
  child.stdout.on("data", (value) => output += value);
  child.stderr.on("data", (value) => errors += value);
  child.on("error", reject);
  child.on("close", (code) => { if (code) reject(new Error(`executor failed (${code}): ${errors.slice(0, 240)}`)); else try { resolve(JSON.parse(output)); } catch { reject(new Error("executor returned invalid JSON")); } });
  child.stdin.end(JSON.stringify({ id: job.id, evaluationId: job.evaluation_id, cluster: job.cluster, subject: job.subject_address, expectedSequence: job.expected_sequence }));
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const result = await client.query("SELECT * FROM trust_write_jobs WHERE status IN ('pending','failed') AND next_attempt_at <= now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
  const job = result.rows[0];
  if (!job) { await client.query("COMMIT"); process.exit(0); }
  await client.query("UPDATE trust_write_jobs SET status='processing', attempts=attempts+1, updated_at=now() WHERE id=$1", [job.id]);
  await client.query("COMMIT");
  try {
    const outcome = await invoke(job);
    await pool.query("UPDATE trust_write_jobs SET status='committed', er_signature=$2, base_commit_signature=$3, action_outcome=$4, committed_at=now(), updated_at=now(), error_class=NULL, error_message=NULL WHERE id=$1", [job.id, outcome.erSignature ?? null, outcome.baseCommitSignature ?? null, outcome.actionOutcome ?? null]);
  } catch (error) {
    await pool.query("UPDATE trust_write_jobs SET status='failed', error_class='worker_failure', error_message=$2, next_attempt_at=now() + interval '60 seconds', updated_at=now() WHERE id=$1", [job.id, error instanceof Error ? error.message.slice(0, 500) : "trust writer failed"]);
  }
} finally { client.release(); await pool.end(); }
