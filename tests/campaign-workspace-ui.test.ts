import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync("app/campaigns/page.tsx", "utf8");
const detail = readFileSync("app/campaigns/[address]/page.tsx", "utf8");
const viewModel = readFileSync("app/lib/campaigns/view-model.ts", "utf8");
const trustPanel = readFileSync(
  "app/components/trust-assessment-panel.tsx",
  "utf8"
);

test("campaign directory keeps canonical filters, fallback artwork, and organization creation", () => {
  assert.match(index, /Search campaign name/);
  assert.match(index, /PendingReview/);
  assert.match(index, /Create campaign/);
  assert.match(index, /createCampaignIx/);
  assert.match(index, /digest-verified metadata/);
});

test("campaign detail keeps role-aware canonical funding and management controls", () => {
  for (const label of [
    "Canonical funding",
    "Donate with wallet",
    "Campaign edit",
    "Admin lifecycle",
    "Technical identifiers",
    "Public audit trail",
  ]) {
    assert.match(detail, new RegExp(label));
  }
  assert.match(detail, /setCampaignStatusIx/);
  assert.match(detail, /submitCampaignIx/);
  assert.match(detail, /TrustAssessmentPanel/);
  assert.match(viewModel, /digest_mismatch/);
  assert.match(viewModel, /campaignAvailable/);
  assert.match(detail, /\{walletAddress && \(/);
  assert.doesNotMatch(detail, /walletAddress && !isAuthority && !isAdmin/);
  assert.match(detail, /Insufficient SOL/);
  assert.match(detail, /2_000_000n/);
  assert.match(trustPanel, /text-foreground\/70/);
});
