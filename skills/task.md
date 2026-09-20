# AidTrace — Implementation Task Plan

**Target:** four-week hackathon build  
**Rule:** complete vertical slices early; do not build all UI first or all chain code first.

---

## Milestone 0 — Repository and toolchain lock

### M0.1 Workspace

- [x] Create monorepo/repository structure from `architecture.md`.
- [x] Install project-scoped `solana-dev` skill.
- [x] Install project-scoped `magicblock` skill.
- [x] Record exact skill/source commit or installation version in `memory.md`.
- [x] Pin Node, Rust, Solana CLI, Anchor, Python versions.
- [x] Add `.env.example` with no secrets.
- [x] Add format/lint/test scripts at root.

### M0.2 Solana client baseline

- [x] Set up `@solana/kit` client.
- [x] Add wallet-standard connection.
- [x] Add cluster configuration for local/devnet.
- [x] Create a single transaction lifecycle utility.

### M0.3 CI

- [ ] Rust fmt/clippy/test.
- [ ] TypeScript lint/test/typecheck.
- [ ] Python lint/test.
- [ ] Secret scanning/basic dependency audit.

**Exit criterion:** clean repository can be cloned, installed, tested, and started from documented commands.

---

# Week 1 — Canonical Solana donation vertical slice

## W1.1 Program scaffolding

- [x] Initialize Anchor program.
- [x] Implement `GlobalConfig`.
- [x] Implement `Organization`.
- [x] Implement `Campaign`.
- [x] Define status enums/errors/events.
- [x] Add PDA derivation tests.

## W1.2 Campaign instructions

- [x] `initialize_config`.
- [x] `register_organization`.
- [x] `create_campaign`.
- [ ] `activate_campaign` with human/admin authority.
- [ ] `pause_campaign`.
- [ ] `close_campaign`.
- [ ] Negative authorization/status tests.

## W1.3 Donation

- [ ] Select demo asset model (SOL or a fixed SPL token); document decision.
- [ ] Implement `donate` transfer + canonical accounting.
- [ ] Emit `DonationReceived` event.
- [ ] Test amount validation and accounting invariants.
- [ ] Generate/update IDL.
- [ ] Generate typed client using Codama where practical.

## W1.4 Frontend vertical slice

- [ ] Landing page shell.
- [ ] Campaign list.
- [ ] Campaign detail.
- [ ] Wallet connection.
- [ ] Donation modal.
- [ ] Transaction states + explorer link.
- [ ] Devnet donation works end-to-end.

## W1.5 Indexer baseline

- [ ] Consume campaign/donation events.
- [ ] Add idempotent transaction/event keys.
- [ ] Populate Postgres projections.
- [ ] Dashboard reads indexed campaign history.

**Week 1 demo:** create campaign -> activate -> connect wallet -> donate -> see canonical total + audit event.

---

# Week 2 — Fund flow and verification

## W2.1 Program

- [ ] Implement `Allocation`.
- [ ] Implement `Disbursement`.
- [ ] Implement `DeliveryVerification`.
- [ ] Enforce `disbursed <= raised` and allocation limits.
- [ ] Add verifier/authority constraints.
- [ ] Emit all relevant events.

## W2.2 Evidence

- [ ] Evidence upload service abstraction.
- [ ] IPFS/Arweave provider implementation for demo.
- [ ] Record CID/hash in audit metadata/on-chain record as designed.
- [ ] Evidence viewer.

## W2.3 Organization dashboard

- [ ] Campaign fund-flow summary.
- [ ] Allocation form.
- [ ] Disbursement form.
- [ ] Verification queue.
- [ ] Fund-trail visualization.

## W2.4 Testing

- [ ] Unauthorized disbursement tests.
- [ ] Over-disbursement tests.
- [ ] Invalid campaign-state tests.
- [ ] Duplicate verification/replay tests where applicable.
- [ ] End-to-end donation -> disbursement -> verification test.

**Week 2 demo:** trace a donation through allocation, disbursement, uploaded evidence, and verified delivery.

---

# Week 3 — Fraud Agent + MagicBlock trust layer

## W3.1 Fraud data model

- [ ] Define normalized transaction/entity feature schema.
- [ ] Add `trust_evaluations` and `fraud_features` migrations.
- [ ] Seed registry/demo organization data.

## W3.2 Fraud feature pipeline

- [ ] Wallet age/activity proxy feature.
- [ ] Funding-trace feature.
- [ ] Donation burst/repetition features.
- [ ] NetworkX transaction graph.
- [ ] Circular-flow/wallet-cluster features.
- [ ] Recipient registry verification feature.
- [ ] Delivery-history feature.
- [ ] Vendor concentration/diversion feature.

## W3.3 Fraud scoring

- [ ] Define deterministic rule layer.
- [ ] Add interpretable anomaly model.
- [ ] Define weighted score aggregation.
- [ ] Version model/rules.
- [ ] Produce reason codes + evidence refs.
- [ ] Create fixture-based tests.

## W3.4 TrustScore program accounts

- [ ] Implement canonical `TrustScore` account.
- [ ] Implement `FraudFlag` account.
- [ ] Add initialization/authorization tests.

## W3.5 MagicBlock trust lifecycle

- [ ] Verify current `ephemeral-rollups-sdk` APIs against installed skill/docs.
- [ ] Add correct `#[ephemeral]`/delegation integration as required by current SDK.
- [ ] Implement trust-score delegation.
- [ ] Create base/ER dual clients.
- [ ] Add Session Key acquisition/creation flow.
- [ ] Scope Session Key to trust updates only.
- [ ] Implement ER `update_trust_score`.
- [ ] Implement commit path.
- [ ] Implement undelegate/recovery path.
- [ ] Add Magic Action path for severe threshold -> durable fraud flag.
- [ ] Test wrong endpoint/delegation state.
- [ ] Test expired/rejected Session Key.
- [ ] Test commit and durable flag result.

## W3.6 Trust UI

- [ ] Trust panel with score + reasons.
- [ ] Live/canonical indicator.
- [ ] Score history.
- [ ] Fraud review admin queue.
- [ ] Stale AI fallback state.

**Week 3 demo:** donation event -> fraud evaluation -> live ER trust update -> threshold crossing -> durable base-layer fraud flag.

---

# Week 4 — Disaster Agent + realtime campaign counter + Round-Up + polish

## W4.1 Disaster feed framework

- [ ] Common feed adapter interface.
- [ ] USGS adapter.
- [ ] ReliefWeb adapter.
- [ ] NOAA adapter where relevant.
- [ ] News/GDELT adapter if API availability permits.
- [ ] Raw payload/evidence retention.

## W4.2 Detection pipeline

- [ ] Normalize events.
- [ ] Text classifier.
- [ ] spaCy NER/location extraction.
- [ ] Embedding/text similarity deduplication.
- [ ] Cross-source clustering.
- [ ] Corroboration rule.
- [ ] Severity score.
- [ ] Confidence score.
- [ ] Candidate creation with source evidence.
- [ ] Fixture tests for duplicate and non-duplicate events.

## W4.3 Human review

- [ ] Admin candidate list.
- [ ] Candidate evidence detail.
- [ ] Approve/reject/needs-evidence states.
- [ ] Approval builds/initiates Solana campaign creation.
- [ ] Assert detector service itself cannot activate campaign.

## W4.4 FundingCounter MagicBlock layer

- [ ] Implement canonical `FundingCounter`.
- [ ] Delegate counter on approved campaign launch.
- [ ] Create donation-confirmation -> ER counter update worker.
- [ ] Add sequence/idempotency key.
- [ ] Periodic commit strategy.
- [ ] Reconciliation job canonical vs realtime.
- [ ] UI `Live` and `Reconciling` states.
- [ ] Failure fallback to canonical amount.
- [ ] Undelegate/finalize on campaign close.

## W4.5 Round-Up Relief

- [ ] QR parser/scanner.
- [ ] Round-up amount calculator.
- [ ] Explicit opt-in UI.
- [ ] Combined transaction builder where technically safe/supported.
- [ ] Round-up audit tagging.

## W4.6 Demo and hardening

- [ ] Deterministic seed script.
- [ ] Demo wallets with Devnet funding.
- [ ] Demo disaster candidate fixtures if live feeds are unreliable.
- [ ] Demo suspicious transaction graph fixture.
- [ ] End-to-end judge script.
- [ ] Empty/loading/error states.
- [ ] Accessibility pass.
- [ ] Security review of all program constraints.
- [ ] Verify no secrets in repository.
- [ ] Deployment smoke test.

**Week 4 demo:** full disaster detection -> human campaign approval -> donation surge -> realtime counter -> fraud signal -> disbursement -> verified delivery story.

---

# Priority tiers

## P0 — Must ship

- Solana campaign/donation/disbursement/verification flow
- public audit trail
- Fraud Agent v1
- TrustScore ER lifecycle
- durable fraud flag path
- Disaster Agent candidate pipeline
- human approval gate
- ER realtime funding counter
- clear canonical vs realtime UI
- deterministic demo

## P1 — Strongly desired

- Round-Up Relief
- evidence storage with IPFS/Arweave
- rich graph visualization
- multiple live disaster feeds
- polished organization trust history

## P2 — Stretch

- advanced graph anomaly models
- automated commit sponsorship tuning
- multiple token support
- rich geo map
- deeper registry integrations

---

# Final pre-demo checklist

- [ ] Program ID consistent across Anchor config, generated client, frontend, scripts.
- [ ] Devnet and ER endpoints verified.
- [ ] All demo wallets funded.
- [ ] Session Key valid and narrowly scoped.
- [ ] Delegated accounts in expected lifecycle state.
- [ ] Seed/reset script tested from clean state.
- [ ] External-feed outage fallback prepared.
- [ ] AI model/rule versions visible.
- [ ] Explorer links work.
- [ ] Canonical/realtime labels visible.
- [ ] No claim that MagicBlock makes AI inference faster.
- [ ] Human approval visible in disaster campaign flow.
