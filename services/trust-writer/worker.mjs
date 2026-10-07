import pg from "pg";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createMagicBlockAdapter,
  TrustWriterError,
} from "./magicblock-adapter.ts";

const MAX_ATTEMPTS = 8;
export const retryDelaySeconds = (attempts) =>
  Math.min(60 * 2 ** Math.max(0, attempts - 1), 15 * 60);

export function classifyFailure(error, attempts) {
  const known = error instanceof TrustWriterError;
  return {
    errorClass: known ? error.code : "worker_failure",
    errorMessage: (error instanceof Error
      ? error.message
      : "trust writer failed"
    ).slice(0, 500),
    terminal: (known && error.terminal) || attempts >= MAX_ATTEMPTS,
    delaySeconds: retryDelaySeconds(attempts),
  };
}

async function claimNext(client, adapter) {
  let lockKey;
  await client.query("BEGIN");
  try {
    const result = await client.query(`
      SELECT j.*, e.score, e.risk_band, e.model_version, e.reasons_json,
             e.checkpoint_slot, e.created_at AS evaluated_at
      FROM trust_write_jobs j JOIN fraud_evaluations e ON e.id = j.evaluation_id
      WHERE j.status IN ('pending', 'failed', 'action_pending')
        AND j.terminal = false AND j.next_attempt_at <= now()
      ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`);
    const job = result.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return null;
    }
    lockKey = `${job.cluster}:${job.program_id}:${job.subject_address}`;
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [lockKey]
    );
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return null;
    }
    const prepared = await adapter.prepare(job);
    const sequence =
      job.status === "action_pending" && job.expected_sequence != null
        ? BigInt(job.expected_sequence)
        : prepared.nextSequence;
    const claimed = await client.query(
      `UPDATE trust_write_jobs SET status='processing', attempts=attempts+1,
       expected_sequence=$2, er_endpoint=$3, session_public_key=$4,
       session_expires_at=$5, claimed_at=now(), updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        job.id,
        sequence.toString(),
        prepared.endpoint,
        prepared.sessionPublicKey,
        prepared.sessionExpiresAt,
      ]
    );
    await client.query("COMMIT");
    return { ...job, ...claimed.rows[0], prepared, lockKey };
  } catch (error) {
    await client.query("ROLLBACK");
    if (lockKey)
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
        lockKey,
      ]);
    throw error;
  }
}

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!process.env.TRUST_WRITER_SESSION_KEY_FILE)
    throw new Error("TRUST_WRITER_SESSION_KEY_FILE is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let job;
  try {
    const adapter = await createMagicBlockAdapter(process.env);
    job = await claimNext(client, adapter);
    if (!job) return;
    console.info("trust writer claimed job", {
      jobId: job.id,
      sessionPublicKey: job.prepared.sessionPublicKey,
      sessionExpiresAt: job.prepared.sessionExpiresAt,
      endpoint: job.prepared.endpoint,
    });
    try {
      const outcome = await adapter.execute(job, {
        reconcileOnly: job.action_outcome === "pending",
      });
      const status =
        outcome.actionOutcome === "pending" ? "action_pending" : "committed";
      await client.query(
        `UPDATE trust_write_jobs SET status=$2,
         er_signature=COALESCE($3,er_signature),
         base_commit_signature=COALESCE($4,base_commit_signature),
         action_outcome=$5, action_checked_at=now(),
         committed_at=CASE WHEN $2='committed' THEN now() ELSE committed_at END,
         next_attempt_at=CASE WHEN $2='action_pending'
           THEN now()+interval '60 seconds' ELSE next_attempt_at END,
         error_class=NULL,error_message=NULL,terminal=false,updated_at=now()
         WHERE id=$1`,
        [
          job.id,
          status,
          outcome.erSignature,
          outcome.baseCommitSignature,
          outcome.actionOutcome,
        ]
      );
    } catch (error) {
      const failure = classifyFailure(error, Number(job.attempts));
      await client.query(
        `UPDATE trust_write_jobs SET status='failed',error_class=$2,error_message=$3,
         terminal=$4,next_attempt_at=now()+($5*interval '1 second'),updated_at=now()
         WHERE id=$1`,
        [
          job.id,
          failure.errorClass,
          failure.errorMessage,
          failure.terminal,
          failure.delaySeconds,
        ]
      );
      console.error("trust writer job failed", {
        jobId: job.id,
        errorClass: failure.errorClass,
        terminal: failure.terminal,
      });
      process.exitCode = 1;
    }
  } finally {
    if (job?.lockKey)
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
        job.lockKey,
      ]);
    client.release();
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void run().catch((error) => {
    console.error("trust writer startup failed", {
      error: error instanceof Error ? error.message : "worker startup failed",
    });
    process.exitCode = 1;
  });
}
