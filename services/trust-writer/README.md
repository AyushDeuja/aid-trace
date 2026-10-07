# AidTrace trust writer

The worker consumes the transactional PostgreSQL outbox and writes through the
MagicBlock router/ER using only a short-lived GUM V2 Session Key. It does not
load an admin, treasury, organization, campaign, or custody key.

Required server-only environment variables are `DATABASE_URL`,
`TRUST_WRITER_SESSION_KEY_FILE`, `MAGICBLOCK_BASE_RPC_URL`, and
`MAGICBLOCK_ROUTER_URL`. The key file is a permission-restricted JSON array
containing the 64-byte Session Key secret and must remain outside this repo.

`MAGICBLOCK_ER_RPC_URL` is optional. When supplied, its validator identity must
match both delegation records. Otherwise the router-selected validator FQDN is
used. Run one bounded outbox attempt with `npm run trust:worker`; a supervisor
can schedule it continuously. Subject advisory locks prevent concurrent writes,
and threshold actions can be reconciled without rewriting an evaluation.
