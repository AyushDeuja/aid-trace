import { test } from "node:test";
import assert from "node:assert/strict";
import { address, AccountRole } from "@solana/kit";
import {
  campaignPda,
  vaultPda,
  donationPda,
  createCampaignIx,
  donateIx,
  type Campaign,
} from "../app/lib/campaigns/chain";
import { parseSolAmount, displaySol } from "../app/lib/campaigns/amount";
import {
  allocationPda,
  availableFunds,
  createAllocationIx,
  disbursementPda,
  recordDisbursementIx,
  type Allocation,
} from "../app/lib/finance/chain";

const org = address("11111111111111111111111111111111");
const donor = address("Vote111111111111111111111111111111111111111");
test("campaign, vault and donation addresses are stable and distinct", async () => {
  const campaign = await campaignPda(org, 0n);
  assert.equal(campaign, await campaignPda(org, 0n));
  assert.notEqual(campaign, await vaultPda(campaign));
  assert.notEqual(
    await donationPda(campaign, 0n),
    await donationPda(campaign, 1n)
  );
});
test("creation and donation use program-owned accounts and donor signer", async () => {
  const campaign = await campaignPda(org, 0n);
  const create = await createCampaignIx(
    org,
    donor,
    0n,
    1_000_000_000n,
    null,
    "aa".repeat(32),
    "aidtrace://campaign/550e8400-e29b-41d4-a716-446655440000"
  );
  assert.equal(create.accounts?.[2]?.address, campaign);
  assert.equal(create.accounts?.[3]?.address, await vaultPda(campaign));
  const state = {
    address: campaign,
    organization: org,
    nextDonationId: 0n,
  } as Campaign;
  const donate = await donateIx(state, donor, 100n);
  assert.equal(donate.accounts?.[4]?.address, await donationPda(campaign, 0n));
  assert.equal(donate.accounts?.[5]?.role, AccountRole.WRITABLE_SIGNER);
});
test("SOL amount conversion is exact and rejects invalid input", () => {
  assert.equal(parseSolAmount("0.000000001"), 1n);
  assert.equal(displaySol(1_200_000_001n), "1.200000001");
  for (const value of ["0", "-1", "1.0000000001", "1e3", " 1", "1."])
    assert.throws(() => parseSolAmount(value));
});
test("allocation/disbursement PDAs and fund reservation instructions are deterministic", async () => {
  const campaign = await campaignPda(org, 0n);
  const state = {
    address: campaign, organization: org, authority: donor, campaignId: 0n,
    amountRaised: 10_000n, amountDisbursed: 2_000n, amountReserved: 3_000n,
    nextAllocationId: 4n,
  } as Campaign;
  assert.equal(availableFunds(state), 5_000n);
  const allocation = await allocationPda(campaign, 4n);
  const create = await createAllocationIx(state, donor, donor, 1_000n, "bb".repeat(32));
  assert.equal(create.accounts?.[3]?.address, allocation);
  const record = { address: allocation, campaign, allocationId: 4n, recipient: donor, nextDisbursementId: 2n } as Allocation;
  const payout = await recordDisbursementIx(record, state, donor, 500n, "cc".repeat(32));
  assert.equal(payout.accounts?.[5]?.address, await disbursementPda(allocation, 2n));
  assert.equal(payout.accounts?.[6]?.address, donor);
});
