# AidTrace — Product and UI Design Specification

**Design objective:** Make disaster-relief money movement understandable in seconds while presenting AI risk signals and realtime state without implying certainty that does not exist.

---

## 1. Experience principles

### Trace the money first

The primary visual idea is not “crypto.” It is the path of funds:

`Donor -> Campaign -> Allocation -> Organization/Vendor -> Delivery -> Verified beneficiary outcome`

### Separate truth states visibly

The interface must distinguish:

- canonical Solana-confirmed state
- realtime MagicBlock state
- AI-derived assessment
- human-reviewed decision

Do not collapse these into one badge.

### Human-readable before technical

Public screens should say “Confirmed on Solana” before exposing signatures, slots, PDAs, or ER details. Technical metadata remains available in expandable audit views.

### High-stakes calmness

Avoid casino, trading-terminal, or meme-token aesthetics. Use clear information hierarchy, restrained motion, accessible status patterns, and evidence-first language.

---

## 2. Information architecture

### Public

```text
/
/campaigns
/campaigns/[address]
/organizations/[address]
/transactions/[signature]
/how-it-works
```

### Connected donor

```text
/dashboard
/dashboard/donations
/dashboard/round-up
```

### Organization

```text
/org
/org/campaigns
/org/campaigns/[address]
/org/disbursements
/org/verifications
/org/trust
```

### Admin

```text
/admin
/admin/disasters
/admin/disasters/[id]
/admin/fraud
/admin/system
```

---

## 3. Global layout

Desktop:

```text
┌─────────────────────────────────────────────────────────┐
│ AidTrace     Campaigns   How it works     Network Wallet│
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    Page content                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Dashboard/admin areas add a persistent left sidebar on wide screens and a drawer on small screens.

---

## 4. Core visual system

Use shadcn/ui primitives and Tailwind tokens rather than one-off component styling.

### Typography

- Clear sans-serif UI typeface.
- Large but not oversized campaign titles.
- Monospace only for addresses, signatures, hashes, model versions, and technical audit data.

### Spacing

Use a consistent 4/8px-derived scale. Dense audit tables may be compact; donation and review decisions should have more breathing room.

### Status semantics

Every status uses icon + text + color, never color alone.

Examples:

- `Confirmed on Solana`
- `Realtime update`
- `Reconciling`
- `AI flagged for review`
- `Human verified`
- `Evidence missing`

### Motion

Allowed:
- subtle counter transitions
- skeleton/loading states
- timeline expansion
- success state after confirmation

Avoid:
- continuously pulsing balances
- confetti for disaster donations
- urgent flashing fraud warnings

---

## 5. Home page

Primary message:

**See where disaster-relief money goes, from donation to verified delivery.**

Hero actions:

- `Explore campaigns`
- `How AidTrace works`

Secondary proof strip:

- total confirmed donations
- active campaigns
- verified deliveries
- public auditability statement

A simple three-step visual should explain:

1. Donate on Solana.
2. AidTrace evaluates risk and tracks movement.
3. Follow funds through verified delivery.

---

## 6. Campaign list

Each card shows:

- disaster/campaign title
- location
- status
- goal
- canonical amount raised
- optional realtime amount when materially newer
- verification/evidence summary
- organization
- last update

Filters:

- disaster type
- status
- geography
- newest/most funded

Do not rank campaigns by AI-generated “worthiness.”

---

## 7. Campaign detail — primary demo screen

Recommended layout:

```text
┌───────────────────────────────────────────────────────────┐
│ Earthquake Relief — Region                               │
│ Active • Confirmed on Solana                             │
│                                                           │
│ $42,180 raised realtime                                  │
│ $41,950 canonical     Goal $100,000                      │
│ [██████████████--------------------]                      │
│ Realtime counter is reconciling with confirmed donations │
│                                                           │
│ [ Donate ]                                               │
├──────────────────────────────┬────────────────────────────┤
│ Fund trail                   │ Campaign trust/evidence    │
│ Donation -> Allocation ...   │ Organization trust         │
│                              │ Delivery verification      │
├──────────────────────────────┴────────────────────────────┤
│ Audit timeline                                             │
│ tx / disbursement / verification / commit events           │
└───────────────────────────────────────────────────────────┘
```

### Amount presentation

Canonical amount is always available. When ER state is ahead:

- headline may use realtime amount if labeled `Live`;
- place `Confirmed on Solana: X` directly beneath it;
- if lag exceeds threshold, label `Reconciling` instead of pretending precision.

### Audit timeline

Timeline entry types:

- donation
- allocation
- disbursement
- evidence uploaded
- delivery verified
- trust update committed
- fraud flag raised/resolved

Each item should link to technical detail without making the default view overly blockchain-centric.

---

## 8. Donation flow

Use a sheet/modal or dedicated panel.

Fields:

- amount
- wallet
- campaign
- optional Round-Up toggle when relevant

Confirmation summary:

```text
Donation                 2.00 SOL
Network                  Devnet
Campaign                 Nepal Flood Relief
Wallet                   7F...k2
----------------------------------------
You are signing a Solana transaction.
```

Transaction state machine:

```text
idle
 -> preparing
 -> awaiting_wallet_signature
 -> submitted
 -> confirming
 -> confirmed
 OR failed
```

Success state shows transaction signature/explorer link and explains that risk analysis may update moments later without blocking the donation.

---

## 9. Trust and fraud UI

Never display an unexplained number like `Trust: 68` alone.

Trust panel should contain:

```text
Trust assessment: Review recommended
Score: 68 / 100
Updated: 20 sec ago (Live)

Contributing signals
+ Registry record matched
+ 12 verified deliveries
- Unusual concentration to one vendor
- New linked-wallet cluster detected

AI assessment • not a legal finding
[View evidence] [View score history]
```

Risk bands should use neutral labels such as:

- Low observed risk
- Watch
- Review recommended
- High-priority review

A permanent `FraudFlag` is a system state, but UI copy must still distinguish automated trigger from human resolution.

---

## 10. Organization dashboard

Top cards:

- active campaigns
- canonical available funds
- pending disbursements
- delivery verification rate
- trust review state

Primary workspace is a funds-flow table:

```text
Campaign | Raised | Allocated | Disbursed | Verified | Available
```

Actions:

- allocate funds
- create disbursement
- attach evidence
- request verification
- review trust details

---

## 11. Disaster review UI

Admin page is intentionally evidence-heavy.

Candidate header:

```text
Possible M6.8 Earthquake — Region
Confidence: High
Severity: Severe
Independent sources: 4
First observed: 10:31
```

Then show:

- map/location summary
- clustered reports
- extracted entities
- timestamps
- conflicting evidence
- suggested campaign title/description/goal placeholder
- model/rule version

Decision buttons:

- `Approve & create draft campaign`
- `Reject candidate`
- `Needs more evidence`

Approval must still lead to a reviewable transaction/signature step; do not hide the human authorization behind an automatic spinner.

---

## 12. Round-Up Relief UI

Round-up must be explicit:

```text
Purchase                         $8.63
Round up                         $0.37
Donation destination             Flood Relief
Total                            $9.00
[✓] Donate my $0.37 round-up
```

The user must see the donation destination before signing.

---

## 13. Empty/error/fallback states

### MagicBlock unavailable

Show canonical amount and a quiet banner:

`Live updates are temporarily unavailable. Confirmed Solana data is still current.`

Donation action remains available.

### AI unavailable/stale

Show:

`Risk assessment pending` or `Last assessed 18 minutes ago`.

Do not replace stale score with zero.

### No evidence

Say `No verification evidence submitted yet`, not `Unverified fraud risk`.

### Wallet/network mismatch

Explain required network and provide a single corrective action.

---

## 14. Responsive behavior

Mobile priority:

1. campaign title/status
2. raised/goal
3. donate CTA
4. canonical/realtime distinction
5. fund trail
6. trust/evidence
7. technical audit

Tables collapse into cards or horizontal scroll only when unavoidable.

---

## 15. Accessibility requirements

- WCAG-oriented contrast.
- Visible focus states.
- All interactive elements keyboard reachable.
- Transaction progress announced through accessible live regions.
- Charts/timelines provide textual equivalents.
- Status icons have readable labels.

---

## 16. Demo narrative

The demo should use the UI to tell one story:

1. Disaster Agent detects a candidate.
2. Admin reviews evidence and approves it.
3. Campaign becomes active on Solana.
4. Donor donates.
5. Live counter reacts quickly.
6. Fraud Agent changes a trust score after a suspicious pattern.
7. A severe threshold triggers a permanent review flag.
8. Organization disburses funds.
9. Verifier confirms delivery.
10. Judge opens the campaign timeline and sees the entire chain.

The visual design should make this sequence legible without requiring judges to understand Solana internals first.
