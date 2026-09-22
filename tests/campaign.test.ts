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
    "https://ipfs.io/ipfs/abc"
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
