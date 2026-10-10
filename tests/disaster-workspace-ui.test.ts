import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync("app/admin/disasters/page.tsx", "utf8");
const organization = readFileSync("app/org/disasters/page.tsx", "utf8");
const detail = readFileSync("app/components/disaster-detail.tsx", "utf8");
const api = readFileSync("app/api/disasters/[id]/detail/route.ts", "utf8");

test("disaster workspaces use the shared table with their valid actions", () => {
  assert.match(admin, /DataTable/);
  assert.match(admin, /Approve & create/);
  assert.match(admin, /Create active campaign/);
  assert.match(admin, /Reject organization request/);
  assert.match(organization, /DataTable/);
  assert.match(organization, /Request admin approval/);
  assert.match(organization, /parseSolAmount/);
});

test("protected disaster detail preserves authorization and provenance", () => {
  assert.match(api, /requireAdmin/);
  assert.match(api, /requireOrganizationAuthority/);
  assert.match(api, /disaster_candidate_history/);
  assert.match(api, /payload_digest/);
  assert.match(detail, /Source provenance/);
  assert.match(detail, /Recorded history/);
  assert.match(detail, /metadataState/);
});
