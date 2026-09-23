# Organization integration test cases

Run these on a fresh local validator with the revised program deployed, a
Postgres database configured, and the `GlobalConfig` PDA initialized by wallet
`A` (the admin). Use separate wallets `B` (founder), `C` (new authority), and
`D` (unauthorized). Prepare two different valid profiles through the in-app
metadata form; each submission creates an immutable PostgreSQL document.

| ID     | Action                                                                                                                | Expected result                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ORG-01 | `B` registers profile 1 at `['org', B]`.                                                                              | One PDA exists, founder/authority are `B`, digest matches profile 1, status is `Pending`, verified is false.     |
| ORG-02 | `B` repeats registration at the same PDA.                                                                             | Transaction fails; the original account and counters are unchanged.                                              |
| ORG-03 | Register with an all-zero digest or wrong PDA.                                                                        | Transaction fails; no organization is created.                                                                   |
| ORG-04 | `D` tries to edit `B`'s digest or nominate an authority.                                                              | Both transactions fail; metadata and authority are unchanged.                                                    |
| ORG-05 | `D` tries to verify or activate the organization.                                                                     | Both transactions fail; status remains `Pending` and unverified.                                                 |
| ORG-06 | `A` tries to activate before verification, then verifies and activates.                                               | Early activation fails; verify and activate succeed; canonical status is active and verified.                    |
| ORG-07 | `A` repeats verification or activation.                                                                               | Repeated transition fails; state is unchanged.                                                                   |
| ORG-08 | `B` updates to profile 2.                                                                                             | Digest changes, verified becomes false, active organization becomes suspended, and profile 1 no longer displays. |
| ORG-09 | `B` nominates `C`; `D` tries to accept; then `C` accepts.                                                             | `D` fails. `C` succeeds, pending authority clears, founder/PDA stay `B`, current authority becomes `C`.          |
| ORG-10 | After transfer, `B` tries to edit metadata or create a campaign; `C` tries after admin reverification and activation. | `B` fails. `C` succeeds using the original organization PDA.                                                     |
| ORG-11 | `A` revokes verification of an active organization.                                                                   | Status becomes suspended; campaign creation is blocked until admin verifies and activates again.                 |
| ORG-12 | `A` closes an organization and then tries to reactivate it.                                                           | Close succeeds and clears pending transfer; reactivation and further edits fail.                                 |
| IDX-01 | Run `npm run index:organizations` twice over the same chain state and events.                                         | One projection row per PDA and one event row per signature/log index; no duplicated history.                     |
| IDX-02 | Apply an older account snapshot after a newer slot.                                                                   | Projection retains the newer authority, digest, status, and slot.                                                |
| IDX-03 | Link profile 1's `aidtrace://` reference to profile 2's canonical digest.                                            | API omits or rejects the mismatched profile; it still shows canonical status.                                    |
| UI-01  | Connect `B`, open `/org`, register, and follow the transaction link.                                                  | Form validates the profile, shows signing/confirmation stages, then displays `Pending` from Solana.              |
| UI-02  | Connect `A` and select `B`'s organization.                                                                            | Only admin controls are offered; verify and activate update canonical status after confirmation.                 |
| UI-03  | Reject a wallet signature or disconnect mid-flow.                                                                     | UI shows failure and does not present the transaction as confirmed.                                              |

For program cases, assert the exact transaction failure and fetch the account
again afterward; a UI-only error is insufficient. For index cases, inspect both
`organization_projection` and `organization_events` in Postgres. Run
`cargo test` from `anchor/` for the existing Rust state-rule tests and `npm
test` for client and metadata tests.
