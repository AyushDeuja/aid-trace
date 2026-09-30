# AidTrace trust writer

This Node worker is the only component intended to hold a short-lived
MagicBlock Session Key. It reads `trust_write_jobs`, never receives an admin or
treasury key, and records ER/base signatures back into PostgreSQL.

Set `TRUST_WRITER_EXECUTOR` to a reviewed executable that performs the
MagicBlock ER update/commit using the generated AidTrace client and GUM Session
Key token. The executor receives a JSON job on stdin and emits JSON containing
`erSignature`, `baseCommitSignature`, and `actionOutcome`.
