# AidTrace

AidTrace makes disaster-relief money movement auditable from donation through
verified delivery. Solana is the canonical financial ledger; MagicBlock is used
only for fast, delegated presentation state; AI evaluates and proposes off-chain
while humans authorize irreversible decisions.

The product requirements and implementation constraints live in [`skills/`](skills).
Read `prd.md`, `architecture.md`, `rules.md`, `task.md`, and `memory.md` in that
order before implementing a feature.

## Current repository state

The frontend has a Next.js 16, TypeScript, Tailwind, `@solana/kit`, and Wallet
Standard foundation. The checked-in `app/generated/vault` files are remnants of
the starter template, not an AidTrace program client; do not use them for new
product flows. ClickUp task 01 creates the Anchor workspace and `aidtrace`
program that supersede them.

## Toolchain

Exact required versions and local status are in [TOOLCHAIN.md](TOOLCHAIN.md).

```powershell
npm install
npm run toolchain
npm run lint
npm run build
```

### Windows and WSL dependencies

`node_modules` contains native binaries selected for the operating system that
ran `npm install`. If you switch between PowerShell and WSL in the same checkout,
reinstall dependencies from that environment before running tests or builds:

```bash
npm ci
npm test
```

For regular use of both environments, keep separate checkouts so each has its
own `node_modules`. The lockfile is shared; the installed native binaries are
not.

`npm run toolchain` currently reports missing prerequisites until the Solana CLI
and Anchor CLI are installed. It is an intentional guard, not a passing check.
Anchor program generation/build/test commands become usable after task 01 has
created `anchor/`.

## Development

```powershell
npm run dev
```

## PostgreSQL migrations, indexing, and backups

PostgreSQL is the application's immutable metadata and indexed-audit store. Solana remains the source of truth for SOL balances and financial state. Before starting the app or indexer against a new database, load `.env` and apply reviewed migrations:

```bash
set -a && source .env && set +a
npm run db:migrate
```

Run the finalized-ledger indexer on demand after chain activity:

```bash
npm run index:chain
```

`index:organizations` and `index:finance` remain supported compatibility commands and invoke the same indexer. The indexer records an idempotent event key of cluster, program, transaction signature, and event-log index; it also keeps a durable checkpoint and reconciles finalized program accounts.

Create an append-only local archive of immutable metadata documents with:

```bash
npm run backup:metadata
```

Archives and SHA-256 checksum files are written under `data/backups/postgres/`, which is intentionally gitignored. `pg_dump` and `pg_restore` must be installed in the environment running the command. Back up `data/evidence/` separately: metadata archives do not include local evidence file bytes.

Verify an archive checksum and inspect it before restoring:

```bash
sha256sum -c data/backups/postgres/metadata-documents-<timestamp>.dump.sha256
pg_restore --list data/backups/postgres/metadata-documents-<timestamp>.dump
```

Restore only into an intentionally chosen PostgreSQL database (never over a
production database without a reviewed recovery plan):

```bash
pg_restore --dbname="$DATABASE_URL" data/backups/postgres/metadata-documents-<timestamp>.dump
```

## Advisory fraud scoring (Task 7)

`services/fraud/` is a separate Python service. It reads only finalized
PostgreSQL projections from `index:chain`; it does not have a wallet, signer,
Solana RPC client, or permission to change campaign/fund state. Its initial
`rules-graph-v1` scorer is deliberately explainable and rule-based because the
project has no labelled fraud dataset yet.

After applying migrations, create a Python virtual environment and install the
service dependencies:

```bash
cd services/fraud
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

With `DATABASE_URL` exported, run a finalized index and then one manual
advisory scoring pass:

```bash
npm run index:chain
npm run fraud:score
npm run fraud:dev
```

The service API documentation is at `http://localhost:8001/docs`. Medium and
high findings are a human-review queue, never a fraud verdict or automatic
fund-control action. Reviewer outcomes form the future labelled dataset.

The default browser network is Devnet. Start from `.env.example` for local
configuration; never commit secrets or put secrets in public environment values.

## Delivery order

Work through the AidTrace ClickUp list in sequence. The immediate next task is
the on-chain data model and program foundation. Every financial change needs
program-level authority, PDA, state-transition, arithmetic, and negative-path
tests before it is considered done.

# Organization registration

Run PostgreSQL, set `DATABASE_URL` and `SOLANA_RPC_URL` from `.env.example`,
deploy the revised AidTrace program to localnet or Devnet, and initialize its
config account with the intended admin wallet. Run `npm run index:organizations`
after on-chain changes (or schedule it periodically); it creates the two
organization index tables and upserts canonical account state by observed slot.
The app's `/org` page reads status from Solana and profile metadata from the
index. Profiles are stored as immutable PostgreSQL documents and must match the
SHA-256 digest signed during registration. A new organization starts pending and unverified. The config
admin verifies it, then activates it. Metadata edits and accepted authority
transfers revoke approval and require admin review again.

## Campaign donation demo

The campaign flow uses native Devnet SOL. Each campaign has a program-owned
vault PDA and each donation has a durable donation PDA. The campaign account's
`amount_raised` is the canonical total. Campaign metadata contains `title`,
`description`, `disasterType`, and `location`; the app stores immutable
PostgreSQL documents and checks their SHA-256 hash against the campaign account
before displaying them. Back up PostgreSQL: Solana proves the metadata hash but
does not retain the full human-readable document.

1. Install the toolchain in `TOOLCHAIN.md`, then run `npm run anchor-build` and
   `npm run codama:js`. Deploy the resulting AidTrace program to Devnet using
   the program ID in `anchor/Anchor.toml`; initialize the config if needed.
2. Fund the admin, organization, and donor wallets with Devnet SOL. In `/org`,
   register an organization and have the config admin verify and activate it.
3. Open `/campaigns` with the organization authority wallet. Enter campaign
   details and a goal in SOL, then sign **Create draft**.
4. Open the campaign detail, sign **Submit for review**, then connect the
   config admin wallet and activate it.
5. Connect the donor wallet, enter a SOL amount, and sign **Donate with wallet**.
   Wait for confirmation and open the transaction link. The detail page reads
   the new raised total directly from Solana. Check the campaign vault and
   donation PDA in the explorer using the addresses derived by the client.

The current workspace does not contain a deployed updated program or a funded
wallet. A live Devnet donation requires both before it can be verified.
