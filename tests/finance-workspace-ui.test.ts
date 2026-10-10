import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const finance = readFileSync("app/org/finance/page.tsx", "utf8");
const verification = readFileSync("app/org/verification/page.tsx", "utf8");
const navigation = readFileSync("app/lib/navigation.ts", "utf8");
const shell = readFileSync("app/components/workspace-shell.tsx", "utf8");

test("finance and verification workspaces retain their canonical handlers", () => {
  for (const label of [
    "Allocation.*disbursement",
    "Reserve funds",
    "Record disbursement",
  ]) {
    assert.match(finance, new RegExp(label));
  }
  assert.match(finance, /createAllocationIx/);
  assert.match(finance, /recordDisbursementIx/);
  assert.match(verification, /Delivery verifications/);
  assert.match(verification, /Add evidence/);
  assert.match(verification, /Inspect evidence/);
  assert.match(verification, /disabled={!attached}/);
  assert.match(verification, /verifyDeliveryIx/);
});

test("organization navigation keeps finance sections distinct and retains organization scope", () => {
  assert.match(navigation, /Allocation & disbursement/);
  assert.match(navigation, /\/org\/verification/);
  assert.match(shell, /window\.location\.search/);
  assert.match(shell, /org\/verification/);
});
