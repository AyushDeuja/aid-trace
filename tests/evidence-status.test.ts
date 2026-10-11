import assert from "node:assert/strict";
import test from "node:test";
import { evidenceReviewStatus } from "../app/lib/finance/evidence-status";
import type { Disbursement } from "../app/lib/finance/chain";

const disbursement = (status: Disbursement["status"]) =>
  ({ status }) as Disbursement;

test("evidence review status requires a linked digest before pending", () => {
  assert.equal(
    evidenceReviewStatus(disbursement("Recorded"), false),
    "Missing evidence"
  );
  assert.equal(evidenceReviewStatus(disbursement("Recorded"), true), "Pending");
});

test("canonical delivery decisions are reflected after evidence is linked", () => {
  assert.equal(
    evidenceReviewStatus(disbursement("Verified"), true),
    "Verified"
  );
  assert.equal(
    evidenceReviewStatus(disbursement("Disputed"), true),
    "Disputed"
  );
  assert.equal(
    evidenceReviewStatus(disbursement("Rejected"), true),
    "Rejected"
  );
});
