import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync("app/org/page.tsx", "utf8");
const detail = readFileSync("app/org/[address]/page.tsx", "utf8");
const table = readFileSync("components/data-table.tsx", "utf8");

test("organization workspace uses a reusable responsive table and founder scope", () => {
  assert.match(table, /overflow-x-auto/);
  assert.match(table, /Loading canonical organization records/);
  assert.match(table, /onRowClick/);
  assert.match(index, /DataTable/);
  assert.match(index, /organization\.founder === walletAddress/);
  assert.match(index, /Create organization/);
  assert.match(index, /Organization verified/);
});

test("organization detail keeps lifecycle controls and canonical metadata state visible", () => {
  for (const label of [
    "Open finance & verification",
    "Revoke verification",
    "Suspend",
    "Close",
    "Metadata verified",
  ]) {
    assert.match(detail, new RegExp(label));
  }
  assert.match(detail, /metadataState/);
  assert.match(detail, /sourceSignature/);
});
