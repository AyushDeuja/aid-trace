import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  donorView,
  primaryNavigation,
  publicView,
} from "../app/lib/navigation";

test("public navigation exposes campaigns and how it works only", () => {
  assert.deepEqual(
    primaryNavigation({
      isConnected: false,
      isAdmin: false,
      isOrganizationAuthority: false,
    }),
    [
      { href: "/campaigns", label: "Campaigns" },
      { href: "/how-it-works", label: "How it works" },
    ]
  );
});

test("organization and admin navigation is derived from canonical role flags", () => {
  const organization = primaryNavigation({
    isConnected: true,
    isAdmin: false,
    isOrganizationAuthority: true,
  });
  assert.equal(
    organization.some((item) => item.href === "/org"),
    true
  );
  assert.equal(
    organization.some((item) => item.href === "/admin/review"),
    false
  );
  const admin = primaryNavigation({
    isConnected: true,
    isAdmin: true,
    isOrganizationAuthority: false,
  });
  assert.equal(
    admin.some((item) => item.href === "/admin/review"),
    true
  );
  assert.equal(
    admin.some((item) => item.href === "/org"),
    false
  );
});

test("donor and combined roles receive the correct non-duplicated tabs", () => {
  const donor = primaryNavigation({
    isConnected: true,
    isAdmin: false,
    isOrganizationAuthority: false,
  });
  assert.equal(
    donor.some((item) => item.href === "/dashboard"),
    true
  );

  const combined = primaryNavigation({
    isConnected: true,
    isAdmin: true,
    isOrganizationAuthority: true,
  });
  const hrefs = combined.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.includes("/org"), true);
  assert.equal(hrefs.includes("/admin/review"), true);
  assert.equal(hrefs.includes("/dashboard"), false);
});

test("public and donor view destinations are stable", () => {
  assert.equal(publicView.href, "/campaigns");
  assert.equal(donorView.href, "/dashboard");
});

test("navbar has a single scrollable row without a sheet menu", () => {
  const source = readFileSync("app/components/app-navbar.tsx", "utf8");
  assert.match(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /Sheet|Menu/);
});
