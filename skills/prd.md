# AidTrace — Product Requirements Document

**Status:** Implementation-ready v1  
**Product:** AidTrace  
**Primary network:** Solana Devnet for hackathon/demo  
**Realtime layer:** MagicBlock Ephemeral Rollups  
**Frontend:** Next.js 16 + TypeScript + Tailwind + shadcn/ui
**On-chain program:** Rust + Anchor 1.1.x  
**AI services:** Python, built from scratch; no external LLM API for the two runtime agents

---

## 1. Product statement

AidTrace is a transparent disaster-relief funding platform that tracks money from donor to final beneficiary, evaluates the authenticity of both funding sources and recipients, detects emerging disasters from external signals, and uses MagicBlock Ephemeral Rollups to make high-frequency trust and funding-state updates feel real-time while retaining Solana as the durable financial source of truth.

The core product promise is:

> **Every important movement of relief money is auditable; AI assists with detection and risk assessment; humans retain approval authority; Solana remains the permanent truth; MagicBlock provides the realtime reaction layer.**

---

## 2. Problem

Disaster-relief funding has four recurring problems:

1. Donors lose visibility after funds enter a multi-hop NGO/distributor/local-org/relief-center chain.
2. Illegitimate donors, fake organizations, fake vendors, duplicate beneficiaries, or diversion patterns can enter the flow without systematic screening.
3. Relief campaigns are often launched slowly because detection, verification, and campaign setup are manual.
4. Viral donation surges create a poor realtime experience if every visible state update depends on base-layer confirmation.

AidTrace addresses all four without putting AI in unilateral control of irreversible financial actions.

---

## 3. Product principles

### 3.1 Durable financial truth lives on Solana

Donations, allocations, disbursements, delivery-verification milestones, campaign authority, and final fraud flags must be represented on the Solana base layer.

### 3.2 AI advises; humans authorize

AI agents may calculate scores, flag risk, cluster suspicious activity, detect probable disasters, deduplicate reports, estimate severity, and draft campaigns. They must not independently publish campaigns, seize funds, permanently blacklist accounts, or finalize financial decisions.

### 3.3 MagicBlock accelerates state reaction, not AI computation

AI inference remains off-chain. MagicBlock is used for fast, high-frequency state transitions such as live trust-score updates and campaign funding counters. Important final state must commit back to Solana.

### 3.4 Explainability over opaque scoring

Every fraud/trust score shown to an operator should expose the major factors that contributed to it. Operators must be able to distinguish raw evidence, derived features, model output, and the final human decision.

### 3.5 Demo paths must reflect production architecture

Hackathon shortcuts may use mock registries or seeded disaster feeds, but the same interfaces must support real APIs and real verification sources later.

---

## 4. Users and roles

### Donor

Connects a Solana wallet, discovers active campaigns, donates, optionally uses Round-Up Relief, and follows the end-to-end fund trail.

### Organization operator

Creates or manages approved campaigns, allocates funds, records disbursements, uploads evidence, manages beneficiary/distributor relationships, and responds to fraud flags.

### Relief verifier

Confirms delivery milestones or beneficiary receipt and attaches supporting evidence.

### Admin / campaign reviewer

Reviews AI-proposed disasters and campaign drafts, approves or rejects launch, reviews severe fraud flags, and performs exceptional recovery operations.

### AI service identity

A backend service with narrowly scoped Session Key authority for permitted ER-side writes. It must never hold broad authority capable of moving treasury funds.

### Public observer / judge

Can inspect campaign history, donation totals, disbursement paths, verification state, trust indicators, and linked Solana transactions without privileged access.

---

## 5. Core user journeys

### 5.1 Donation journey

1. User opens an active campaign.
2. UI fetches canonical campaign state from Solana and realtime display state from the ER where applicable.
3. User connects wallet and chooses donation amount.
4. Client builds the donation transaction.
5. Donation transfer settles on Solana.
6. Indexer/backend records the transaction and triggers fraud evaluation.
7. Fraud Agent computes donor-side and recipient-side features.
8. AI service writes permitted trust-score updates to delegated ER accounts.
9. Dashboard reflects the new donation and realtime risk state.
10. Final/periodic trust state commits back to Solana according to settlement policy.

### 5.2 Organization disbursement journey

1. Authorized operator selects a campaign allocation.
2. Operator selects registered recipient/vendor and amount.
3. Backend presents current authenticity/trust evidence.
4. Operator signs the disbursement instruction.
5. Solana records the disbursement.
6. Fraud Agent evaluates the transaction graph and recipient history.
7. Evidence upload is stored off-chain; its immutable content identifier/hash is recorded in the relevant audit record.
8. Delivery verifier later confirms delivery or disputes it.

### 5.3 Disaster-to-campaign journey

1. Disaster Agent ingests supported external feeds.
2. Pipeline classifies reports, extracts entities, clusters duplicates, and calculates confidence/severity.
3. When configured thresholds are met, it creates an internal disaster candidate.
4. Candidate includes evidence links, geography, type, confidence, severity, and suggested campaign metadata.
5. Human admin reviews the candidate.
6. Approval creates the canonical campaign on Solana.
7. Campaign realtime funding-counter account is delegated to MagicBlock.
8. Campaign becomes publicly discoverable.
9. Donation surge updates the ER counter quickly while funds continue settling on base layer.

### 5.4 Round-Up Relief journey

1. User scans or opens a merchant/payment request.
2. UI calculates round-up amount to the configured currency unit.
3. User sees payment amount, round-up donation, destination campaign, and total before signing.
4. Transaction builder composes payment + donation where supported.
5. Donation remains independently auditable in AidTrace.

---

## 6. Functional requirements

### FR-1 Wallet and identity

- Connect supported Solana wallets through the current Solana wallet-standard stack.
- Never request seed phrases or private keys.
- Display active network and connected public key.
- Support transaction simulation/error feedback before or after signing where feasible.

### FR-2 Campaign management

A campaign must contain at minimum:

- campaign public key/PDA
- creator/admin authority
- title
- disaster type
- location label and normalized geo metadata off-chain
- goal amount
- amount raised
- status
- creation timestamp
- optional end timestamp
- evidence/content CID or metadata hash
- realtime-counter delegation state

Campaign statuses:

`Draft -> PendingReview -> Active -> Paused -> Closed`

Only authorized humans may transition `PendingReview -> Active`.

### FR-3 Donations

- Record each donation on Solana.
- Associate each donation with campaign and donor.
- Record source classification/tag where available.
- Emit an event for indexing.
- Ensure donation transfer and accounting cannot diverge.
- Never use the ER as the sole ledger for transferred funds.

### FR-4 Allocations and disbursements

- Authorized organization operators can allocate campaign funds.
- Disbursements must reference campaign, recipient, amount, and purpose/evidence metadata.
- Prevent unauthorized or over-budget disbursement.
- Each state-changing financial instruction emits an indexable event.

### FR-5 Delivery verification

- Authorized verifier can mark a disbursement/delivery milestone as verified, disputed, or rejected.
- Store evidence off-chain and commit content identifier/hash on-chain.
- UI exposes verification history.

### FR-6 Fraud & Authenticity Agent

The Python agent must support feature extraction for:

**Donor/source side**

- wallet age/activity proxy
- funding trace indicators
- repeated circular flows
- wallet clustering
- burst patterns
- donation repetition anomalies

**Recipient/org side**

- registry verification result
- delivery-verification history
- prior disputes
- graph relationships
- unusual diversion paths
- repeated vendor/recipient concentration

Agent output must contain:

- normalized trust/risk score
- decision band
- contributing factors
- model/rule version
- timestamp
- entity evaluated
- evidence references

### FR-7 Realtime trust scores with MagicBlock

- TrustScore account is created canonically on Solana.
- Eligible TrustScore accounts can be delegated to an ER.
- AI service receives only scoped temporary authority through a Session Key pattern.
- AI service may update the delegated score but may not transfer campaign funds.
- When score crosses a configured severe-risk threshold, an ER transaction may schedule a Magic Action that creates/updates the permanent base-layer fraud flag.
- Commit/undelegate must occur at defined lifecycle points.
- System must expose delegation and settlement state to operators.

### FR-8 Disaster Detection Agent

Pipeline stages:

`ingest -> normalize -> classify -> NER/location extraction -> deduplicate/cluster -> corroborate -> severity score -> candidate`

Minimum candidate fields:

- disaster type
- location
- first-seen timestamp
- last-updated timestamp
- confidence
- severity
- independent-source count
- source references
- proposed title/summary
- review status

The agent must never directly call the on-chain `create_campaign` path without a human approval action.

### FR-9 Realtime funding counter

- On campaign approval, realtime counter may be delegated to an ER.
- Counter is presentation/realtime aggregate state, not custody state.
- Donation funds settle on Solana.
- Backend/relayer updates counter only from confirmed or explicitly defined commitment-level donation events.
- Counter periodically commits to base layer.
- UI must distinguish pending/realtime amount from canonical settled amount if they temporarily differ.

### FR-10 Audit trail

Every important object should expose:

- current state
- state history where practical
- actor/authority
- Solana signature for canonical transactions
- evidence hash/CID
- fraud/detection model version where applicable

### FR-11 Round-Up Relief

- Explicit opt-in.
- Show calculated round-up before signing.
- Keep merchant payment semantics separate from donation semantics in UI and audit data.
- Support QR-based initiation.

---

## 7. On-chain account model

Initial account set:

- `GlobalConfig`
- `Organization`
- `Campaign`
- `DonationRecord` or event-indexed donation representation
- `Allocation`
- `Disbursement`
- `DeliveryVerification`
- `TrustScore`
- `FraudFlag`
- `FundingCounter`

Exact byte layouts belong in `architecture.md` and implementation IDL, not in this PRD.

---

## 8. Non-functional requirements

### Security

- Explicit signer/authority constraints on every instruction.
- PDA seed and ownership validation.
- Checked arithmetic for money/accounting.
- No backend custody of user wallets.
- AI Session Keys scoped to minimum account/instruction set and short lifetime.
- Permanent financial movement remains base-layer controlled.

### Performance

- Normal dashboard data should become visible within a few seconds of canonical confirmation.
- ER trust-score and counter writes target realtime UX and should not block donation completion.
- API endpoints used by primary UI should target sub-second cached/read latency where feasible.

### Reliability

- If MagicBlock is unavailable, donations must still work on Solana and UI should fall back to canonical counters.
- If AI service is unavailable, financial flows must not corrupt; trust state can display as stale/pending.
- If external disaster feeds fail, existing campaigns remain unaffected.

### Observability

- Correlation ID across backend job, AI evaluation, ER write, and final base-layer commit.
- Structured logs.
- Metrics for donation success/failure, AI processing latency, ER write latency, settlement lag, feed ingestion failures, and alert volume.

### Accessibility

- Keyboard-accessible critical flows.
- Semantic labels on wallet, donation, review, and verification controls.
- Do not communicate risk solely by color.

---

## 9. Success metrics for hackathon

The demo is successful when judges can observe, end-to-end:

1. A wallet donates to a campaign on Devnet.
2. The donation appears in the public audit trail.
3. Fraud Agent evaluates an entity and updates a delegated trust score.
4. A threshold-crossing scenario produces a durable fraud flag through the designed settlement/Magic Action path.
5. Disaster Agent ingests evidence and produces a campaign candidate.
6. A human approves the candidate before campaign creation.
7. A burst of donations causes the realtime funding counter to update quickly while funds remain base-layer transactions.
8. A disbursement and delivery-verification path can be traced from campaign funds to recipient evidence.

---

## 10. Out of scope for v1

- Autonomous AI control of treasury funds
- Mainnet launch
- Fiat custody or regulated money-transmission infrastructure
- Fully decentralized identity/KYC
- Zero-knowledge recipient privacy system
- Cross-chain donations
- Production-grade governmental registry coverage for every jurisdiction
- Machine-learning claims of fraud as legal determinations

---

## 11. Acceptance criteria

AidTrace v1 is implementation-complete when:

- all core financial instructions are covered by automated program tests;
- donation, disbursement, and delivery-verification flows work on Devnet;
- AI scoring exposes factors and version metadata;
- campaign creation is human-gated;
- TrustScore delegation/update/commit lifecycle works in a MagicBlock validation environment;
- realtime funding counter can reconcile to canonical donation totals;
- frontend clearly presents canonical vs realtime state;
- failure of AI or ER does not make the Solana accounting path unavailable;
- demo seed data and scripts reproduce the judge flow deterministically.
