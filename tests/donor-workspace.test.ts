import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const model = readFileSync("app/lib/donor-read-model.ts", "utf8");
const workspace = readFileSync("app/components/donor-workspace.tsx", "utf8");

test("donor workspace joins only indexed wallet donations with campaign progress", () => {
  assert.match(model, /d\.payload->>'donor'=\$3/);
  assert.match(model, /chain_campaign_projection/);
  assert.match(model, /chain_allocation_projection/);
  assert.match(model, /chain_disbursement_projection/);
  assert.match(model, /metadataState/);
});

test("donor screens show factual campaign-level traceability without unsupported features", () => {
  assert.match(workspace, /Where your SOL went/);
  assert.match(workspace, /Campaign-level progress/);
  assert.match(workspace, /Connect your wallet/);
  assert.match(workspace, /My donations/);
  assert.doesNotMatch(workspace, /Round-Up/);
  assert.doesNotMatch(workspace, /Export receipts/);
});
