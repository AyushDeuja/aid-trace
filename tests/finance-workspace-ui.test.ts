import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/org/finance/page.tsx", "utf8");
const navigation = readFileSync("app/lib/navigation.ts", "utf8");
const shell = readFileSync("app/components/workspace-shell.tsx", "utf8");

test("finance workspace separates funding and verification without changing canonical handlers", () => {
  for (const label of [
    "Allocation.*disbursement",
    "Verification",
    "Reserve funds",
    "Record disbursement",
    "Registered verifiers",
    "Upload evidence",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /createAllocationIx/);
  assert.match(page, /recordDisbursementIx/);
  assert.match(page, /verifyDeliveryIx/);
  assert.match(page, /DataTable/);
});

test("organization navigation keeps finance sections distinct and retains organization scope", () => {
  assert.match(navigation, /Allocation & disbursement/);
  assert.match(navigation, /section=verification/);
  assert.match(shell, /searchParams\.get\("organization"\)/);
  assert.match(shell, /financeSection/);
});
