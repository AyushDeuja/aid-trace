import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/admin/review/page.tsx", "utf8");
const route = readFileSync("app/api/admin/review/route.ts", "utf8");

test("admin operations overview renders dynamic queues and lifecycle controls", () => {
  for (const label of [
    "Organizations to review",
    "Disaster requests",
    "Campaign activation",
    "Open fraud flags",
    "System availability",
    "Recent human decisions",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /Organization verified/);
  assert.match(page, /Campaign activated/);
  assert.match(page, /FraudFlag resolved/);
  assert.match(page, /href="\/admin\/disasters"/);
});

test("protected review model returns only safe operational aggregates", () => {
  assert.match(route, /requireAdminChallenge/);
  assert.match(route, /read_review_queue/);
  assert.match(route, /disaster_candidate_history/);
  assert.match(route, /fraud_reviews/);
  assert.match(route, /database: "available"/);
  assert.match(route, /canonical: unavailableReads/);
  assert.match(route, /fraud: fraudHealth\.ok/);
  assert.doesNotMatch(route, /FRAUD_SERVICE_URL/);
});
