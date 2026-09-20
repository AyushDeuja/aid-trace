# AidTrace — Engineering and Agent Rules

These rules are mandatory for humans and AI coding agents working on AidTrace.

---

## 1. Source-of-truth hierarchy

When requirements conflict, resolve them in this order:

1. `prd.md` — product behavior and acceptance criteria
2. `architecture.md` — technical boundaries and invariants
3. `rules.md` — implementation constraints
4. `design.md` — UX/UI behavior
5. `task.md` — current execution order
6. `memory.md` — project decisions/history; update it when decisions change
7. code comments / TODOs

Never silently override a higher-level document from a lower-level one.

---

## 2. Non-negotiable architecture rules

1. **Solana is the canonical financial ledger.**
2. **MagicBlock is a realtime execution/state layer, not the sole durable copy of important financial state.**
3. **Runtime AI is off-chain.** Do not claim ERs execute or accelerate model inference.
4. **AI may propose and flag; humans authorize irreversible administrative decisions.**
5. **AI/automation identities must never possess treasury/disbursement authority.**
6. **A donation must remain possible if the AI service or MagicBlock realtime layer is temporarily unavailable.**
7. **Every ER-derived display value must have a canonical reconciliation strategy.**

---

## 3. Solana development rules

Follow the installed `solana-dev` skill before relying on remembered APIs.

### Required defaults

- Anchor 1.1.x unless a documented dependency blocks it.
- `@solana/kit` for new TypeScript client/RPC code.
- Wallet Standard / current Kit wallet integration for new wallet UI.
- Codama-generated typed clients where practical.
- LiteSVM or Mollusk for fast program tests.
- Surfpool for integration testing where appropriate.

### Program rules

- Validate signer authority explicitly.
- Validate account ownership explicitly.
- Use deterministic PDA seeds and document them.
- Store bumps where useful; verify expected seeds in constraints.
- Use checked integer arithmetic for amounts/counters.
- Never use floating point for token accounting.
- Reject invalid campaign status transitions.
- Avoid unnecessarily large on-chain accounts.
- Emit structured events for indexable transitions.
- Close/reclaim accounts only through explicit authorized flows.
- Never assume transaction success because a signature string was returned; define confirmation semantics.

### Dependency rules

- Pin compatible Anchor/Solana/Rust/Node versions in repo tooling.
- Do not introduce legacy web3.js/wallet-adapter APIs into new modules unless a third-party integration requires them.
- If legacy interop is required, isolate it under `app/lib/solana/compat/` and document why.

---

## 4. MagicBlock development rules

Follow the installed `magicblock` skill before writing integration code.

### Connection discipline

- Name base-layer and ER clients differently.
- Never route a transaction based on implicit global state.
- Every function that can send to either domain must make its target explicit.

### Delegation discipline

For each delegated account, document:

- who can delegate
- what state may mutate while delegated
- who can write
- which RPC/ER endpoint is used
- when commits occur
- when undelegation occurs
- recovery procedure

### Session Keys

- Minimum privilege only.
- Short-lived by default.
- No treasury transfers.
- No campaign activation.
- No admin role mutation.
- No fraud-resolution authority.
- Rotate/revoke on compromise or service redeploy.

### Magic Actions

Use only when an ER commit and a base-layer follow-up are one logical operation. The action must be deterministic from validated state. Do not use Magic Actions as a general backend job queue.

### Reconciliation

- Never hide ER/base mismatch.
- Expose `live`, `reconciling`, or `canonical` state where relevant.
- Canonical financial reporting always comes from base layer.

---

## 5. AI rules

### Runtime restriction

The two core agents must be implemented from scratch using the approved Python libraries and deterministic/local model artifacts. Do not substitute an external hosted LLM API for fraud scoring or disaster detection.

### Fraud Agent

- Preserve raw features used in each evaluation.
- Version weights/models.
- Provide human-readable reason codes.
- Do not label an entity legally “fraudulent”; use risk/flag language.
- Make thresholds configurable.
- Separate “missing evidence” from “negative evidence.”
- Never fabricate registry verification.

### Disaster Agent

- Preserve source attribution.
- Deduplicate before severity aggregation.
- Require corroboration rules for auto-escalation to review.
- Never auto-publish a campaign.
- Store why a candidate was created.
- Distinguish confidence from severity.

### Model lifecycle

Every persisted evaluation must include a model/rules version so demo and debugging runs are reproducible.

---

## 6. Financial safety rules

- No client-provided aggregate amount may be trusted without program-side checks.
- Program must derive or validate expected mint/token accounts.
- Disbursement cannot exceed available authorized balance.
- Campaign totals must not rely only on an off-chain database.
- Idempotency is required for relayer/reconciliation operations.
- Never log private keys, seed phrases, session secrets, bearer tokens, or full sensitive auth payloads.
- Never place secrets in frontend environment variables unless intentionally public.

---

## 7. Frontend rules

- Use server components by default; opt into client components only for interactivity/wallet/browser APIs.
- Keep blockchain client creation centralized.
- No raw RPC calls scattered inside React components.
- All transaction flows show clear stages: `preparing`, `awaiting signature`, `submitted`, `confirming`, `confirmed`, `failed`.
- Link canonical transactions to a block explorer in demo builds.
- Show wallet/network mismatch explicitly.
- Never show a realtime ER number as canonical without labeling.
- Do not use green/red alone to communicate trust or risk.

---

## 8. Backend rules

- Treat chain events as idempotent inputs.
- Queue AI evaluation rather than block user-facing transaction responses.
- Persist job status and retry count.
- External feed adapters must normalize into one internal schema.
- Apply timeouts/retries/circuit breakers to external APIs.
- Validate inbound payloads with a schema library.
- APIs that initiate privileged actions require explicit role checks.

---

## 9. Database rules

- Postgres stores projections, evidence metadata, jobs, model outputs, and external feed data.
- It is not the canonical source for on-chain balances.
- Every projection row derived from chain data should retain its source signature/account.
- Use migrations for schema changes.
- Prefer immutable evaluation records over in-place mutation; create a new version/evaluation where feasible.

---

## 10. Testing rules

No feature is complete without tests at the layer where its invariant lives.

Minimum merge gate:

```text
format/lint
Rust tests
TypeScript tests
Python tests
program security/invariant tests
integration test for modified cross-layer flow
```

Critical instructions require negative tests for unauthorized signer, malformed PDA/accounts, insufficient balance, invalid status, and duplicate/replay conditions where relevant.

MagicBlock features require at least one test of failure/recovery, not only the happy path.

---

## 11. Git and task rules

- One task = one clear outcome.
- Prefer small commits with imperative messages.
- Do not combine unrelated refactors with functional changes.
- Update `task.md` checkboxes as work lands.
- Update `memory.md` whenever a lasting architecture/product decision changes.
- If implementation contradicts docs, either fix implementation or update docs in the same change with rationale.

Suggested branch names:

```text
feat/campaign-program
feat/magicblock-trust-score
feat/fraud-agent
fix/counter-reconciliation
chore/devnet-seed
```

---

## 12. Definition of done

A task is done only when:

- implementation exists;
- relevant automated tests pass;
- failure states are handled;
- observability/logging exists where needed;
- documentation has not drifted;
- security implications were considered;
- the feature works in the intended local/devnet/ER environment.
