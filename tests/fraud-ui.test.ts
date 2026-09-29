import test from "node:test";
import assert from "node:assert/strict";
import { isFraudCluster, parseFindings, parseSubject } from "../app/lib/fraud-types";

test("fraud UI parser accepts typed advisory finding data", () => {
  const findings = parseFindings([{
    id: "550e8400-e29b-41d4-a716-446655440000",
    subject_address: "EibzbpfpkSCfqD963bjLvtNsNukYAWaCpk3PTFpoxUYM",
    severity: "high", status: "open", score: 60, risk_band: "high",
    model_version: "rules-graph-v1", created_at: "2026-01-01T00:00:00Z",
    reasons_json: JSON.stringify([{ code: "missing_evidence", message: "Evidence is missing.", weight: 10, source_addresses: ["address"] }]),
  }]);
  assert.equal(findings[0].reasons[0].code, "missing_evidence");
  assert.equal(findings[0].score, 60);
});

test("fraud UI parser rejects malformed service payloads and unsupported clusters", () => {
  assert.throws(() => parseFindings({}), /invalid finding list/);
  assert.throws(() => parseSubject({ subject_address: "x" }), /invalid subject/);
  assert.equal(isFraudCluster("devnet"), true);
  assert.equal(isFraudCluster("mainnet"), false);
});
