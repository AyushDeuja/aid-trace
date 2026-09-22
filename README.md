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

`npm run toolchain` currently reports missing prerequisites until the Solana CLI
and Anchor CLI are installed. It is an intentional guard, not a passing check.
Anchor program generation/build/test commands become usable after task 01 has
created `anchor/`.

## Development

```powershell
npm run dev
```

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
index. Profile JSON must contain `name` and `description`, be published at an
`https://ipfs.io/ipfs/<CID>` URL, and match the SHA-256 digest signed during
registration. A new organization starts pending and unverified. The config
admin verifies it, then activates it. Metadata edits and accepted authority
transfers revoke approval and require admin review again.

## Campaign donation demo

The campaign flow uses native Devnet SOL. Each campaign has a program-owned
vault PDA and each donation has a durable donation PDA. The campaign account's
`amount_raised` is the canonical total. Campaign metadata JSON must contain
`title`, `description`, `disasterType`, and `location`; publish it at an
`https://ipfs.io/ipfs/<CID>` URL. The app checks its SHA-256 hash against the
campaign account before displaying it.

1. Install the toolchain in `TOOLCHAIN.md`, then run `npm run anchor-build` and
   `npm run codama:js`. Deploy the resulting AidTrace program to Devnet using
   the program ID in `anchor/Anchor.toml`; initialize the config if needed.
2. Fund the admin, organization, and donor wallets with Devnet SOL. In `/org`,
   register an organization and have the config admin verify and activate it.
3. Open `/campaigns` with the organization authority wallet. Enter metadata
   URL and a goal in SOL, then sign **Create draft**.
4. Open the campaign detail, sign **Submit for review**, then connect the
   config admin wallet and activate it.
5. Connect the donor wallet, enter a SOL amount, and sign **Donate with wallet**.
   Wait for confirmation and open the transaction link. The detail page reads
   the new raised total directly from Solana. Check the campaign vault and
   donation PDA in the explorer using the addresses derived by the client.

The current workspace does not contain a deployed updated program or a funded
wallet. A live Devnet donation requires both before it can be verified.
