# AidTrace — Project Memory

This file is the compact persistent context for coding agents. Read it before implementing a new task. Update it whenever a durable decision changes.

---

## 1. Product identity

**Name:** AidTrace

**One-line concept:** Transparent disaster-relief funding on Solana with from-scratch AI fraud/authenticity scoring, from-scratch disaster detection, and MagicBlock Ephemeral Rollups for realtime trust-score and campaign-counter updates.

**Primary hackathon positioning:**

- Solana core application
- MagicBlock realtime integration

---

## 2. Non-negotiable mental model

```text
AI decides/scores/proposes off-chain.
MagicBlock lets permitted on-chain state react quickly.
Solana stores durable financial truth.
Humans approve irreversible administrative decisions.
```

Never say “MagicBlock speeds up the AI.” It speeds up the on-chain consequences/state updates after AI computation.

---

## 3. Three state domains

### Solana base layer

Permanent/canonical:

- campaigns
- donations/fund transfers
- allocations
- disbursements
- delivery verification
- final committed trust state
- durable fraud flags
- content hashes/CIDs

### MagicBlock ER

Fast/intermediate:

- delegated TrustScore updates
- delegated FundingCounter updates
- atomic commit-linked follow-up through Magic Actions where appropriate

### Off-chain

Mutable/computational:

- fraud feature extraction/scoring
- transaction graph
- disaster feed ingestion
- classification/NER/deduplication/severity
- Postgres projections
- evidence files
- jobs/indexing

---

## 4. Locked product decisions

1. Disaster Agent cannot autonomously publish a campaign.
2. Fraud Agent cannot autonomously move or seize money.
3. AI service must not hold treasury authority.
4. Donation transfers remain on Solana even during surge windows.
5. ER funding counter is a realtime derived view, not custody/accounting truth.
6. Important ER state eventually commits or is explicitly discarded/recovered; it is not the only copy of important state.
7. Trust scoring must be explainable and versioned.
8. UI must distinguish realtime, canonical, AI-derived, and human-verified state.

---

## 5. Current implementation stack

### Frontend

- Next.js 16 App Router
- TypeScript
- Tailwind
- shadcn/ui

### Solana client

Implementation refinement from current Solana development guidance:

- prefer `@solana/kit`
- Wallet Standard / current Kit wallet integration
- Codama-generated typed clients where practical
- isolate legacy wallet-adapter/web3.js interop if a dependency requires it

### Program

- Rust
- Anchor 1.1.x
- MagicBlock `ephemeral-rollups-sdk` / current equivalent APIs verified against installed skill

### Testing

- LiteSVM/Mollusk for fast program tests
- Surfpool where useful for integration flows
- normal TypeScript/Python unit/integration tests

### AI

- Python
- scikit-learn
- NetworkX
- sentence-transformers
- spaCy
- pandas
- no external LLM API for the two core runtime agents

### Data/infrastructure

- PostgreSQL / Supabase
- IPFS/Arweave evidence storage
- Vercel frontend
- Railway/Render AI/indexer
- Solana Devnet
- MagicBlock validation/dev environment

---

## 6. Core account concepts

Expected initial PDAs/accounts:

```text
GlobalConfig
Organization
Campaign
Allocation
Disbursement
DeliveryVerification
TrustScore
FraudFlag
FundingCounter
```

Donation history may use events + canonical aggregate state rather than one permanent account per donation if that is more efficient and still satisfies auditability.

---

## 7. MagicBlock-specific memory

Use a dual-connection architecture:

```text
base client -> Solana
ER client   -> MagicBlock router/ER
```

### Trust flow

```text
canonical TrustScore
-> delegate
-> AI evaluates off-chain
-> scoped Session Key updates ER score
-> severe threshold may schedule Magic Action
-> commit durable score/flag
-> undelegate at lifecycle boundary
```

### Funding flow

```text
actual donation on Solana
-> confirmed event
-> idempotent worker updates delegated ER FundingCounter
-> UI shows realtime amount
-> periodic reconciliation/commit
-> final reconcile + undelegate
```

Session Keys must never gain donation transfer, disbursement, treasury, campaign activation, or admin authority.

---

## 8. Fraud Agent memory

Use interpretable signals first.

Donor/source signals:

- wallet age/activity proxy
- funding trace
- repeated/circular transfers
- wallet clustering
- burst/repetition patterns

Recipient/org signals:

- registry checks
- delivery verification history
- disputes
- graph-based diversion patterns
- vendor concentration

Output:

- score
- risk band
- reasons
- features
- model/rule version
- evidence refs
- timestamp

Do not present the score as proof of criminal fraud.

---

## 9. Disaster Agent memory

Pipeline:

```text
ingest
-> normalize
-> classify
-> extract entities/location
-> deduplicate/cluster
-> corroborate
-> severity + confidence
-> human review candidate
```

Planned feeds:

- USGS
- ReliefWeb
- NOAA
- GDELT/News-style source as available

AI proposes; human approves.

---

## 10. UX memory

Primary user story is “trace the money,” not “look at blockchain technology.”

Campaign pages should expose:

- amount raised
- canonical vs realtime distinction
- fund trail
- evidence/verification
- trust assessment + reasons
- audit timeline

Fallback behavior:

- MagicBlock down -> show canonical Solana data; donation still works.
- AI down/stale -> show assessment pending/stale; financial flow remains valid.

---

## 11. Security memory

Before implementing any on-chain instruction, ask:

1. Who must sign?
2. Who owns each account?
3. What PDA seeds must match?
4. What state transition is legal?
5. What amount invariant can be violated?
6. Can a user substitute an arbitrary recipient/mint/account?
7. Can this be replayed or double-applied?
8. Does any backend/session identity have more authority than necessary?

---

## 12. Demo story

The preferred judge demo is one continuous narrative:

1. Disaster feed creates candidate.
2. Admin inspects evidence.
3. Human approves campaign.
4. Campaign created/activated on Solana.
5. FundingCounter delegated.
6. Donor sends Devnet donation.
7. Live counter updates quickly.
8. Fraud Agent detects suspicious graph behavior.
9. TrustScore changes on ER.
10. Threshold crossing produces durable review/fraud flag.
11. Organization disburses.
12. Verifier confirms delivery.
13. Public timeline proves the full chain.

---

## 13. Known implementation questions to resolve during coding

These are not product ambiguities; they are API/tooling details that must be verified against current installed skills/docs:

- exact current MagicBlock macros and account contexts for delegation/commit;
- Session Key SDK/API shape and supported scope controls;
- exact Magic Action construction API;
- commit sponsorship / fee-vault requirements for the chosen environment;
- best current MagicBlock local/dev validation endpoint flow;
- whether the demo donation asset should be native SOL or an SPL token;
- final evidence storage provider availability.

Do not guess these APIs from old examples.

---

## 14. Documentation maintenance rule

When a durable decision changes:

1. update this file;
2. update `architecture.md` if technical boundaries changed;
3. update `prd.md` if product behavior changed;
4. update `task.md` if sequencing/scope changed;
5. keep `rules.md` aligned with the new constraint.

---

## 15. Change log

### v1 — planning baseline

- Product brief converted into implementation PRD.
- Three-tier Solana/MagicBlock/off-chain architecture locked.
- Human approval constraint preserved.
- Modern Solana skill guidance adopted for new client/tooling choices.
- Four-week implementation plan created.

### v1.1 â€” repository baseline reconciliation

- The generated vault program/client is not AidTrace implementation and must not be used for product flows.
- Frontend baseline is pinned to Next.js 16.3.4, matching the repository lockfile.
- Program toolchain is pinned to Anchor 1.1.1 and Solana CLI 3.1.10; the local CLIs must be installed before program work begins.

### v1.2 â€” canonical program foundation

- Project skill sources are locked in `skills-lock.json`: `solana-foundation/solana-dev-skill` hash `1ec05821927683f89db3a394cd6a5f7fe324abe3bced90676749a9f6dfb9ce67`; `magicblock-labs/magicblock-dev-skill` hash `1da12d71e2f42e5b8f78fdc474988ec5edd18820281af632c82eca881c32fcd2`.
- Program ID: `5Z7gLMeuA9xqwRQNmuZeZCgUYCSVPtAhqhnvid7V6PXn`.
- Account metadata/evidence references are fixed `[u8; 32]` SHA-256 digests.
- One organization is derived per authority with `['org', authority]`.
- Nested historical records use parent-scoped `u64` counters; callers must match the canonical next counter.
- `GlobalConfig` is one-time initialized by the deployer, who becomes initial admin and treasury authority.
- The foundation originally initialized organizations active; campaigns initialize as `Draft`; no funds, delegation, or AI authority exists in this foundation.

### v1.3 — organization approval and authority

- Organizations now initialize `Pending` and unverified; the config admin alone verifies and activates them.
- Organization PDA seeds retain the original founder after authority transfer. Current authority governs metadata and campaigns.
- Metadata and authority changes revoke verification and suspend active organizations until admin review.
- Profile JSON is stored at an IPFS content URL in the Postgres index and checked against the canonical SHA-256 digest before display.
